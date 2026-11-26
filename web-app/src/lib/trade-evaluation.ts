// Evaluación de traspasos con Gemini (solo servidor: la clave nunca llega al navegador).
// El modelo recibe los datos reales de la app y responde en un JSON con esquema fijo, que se valida.
// Tarea 6.24: la respuesta llega por partes (streaming) y, si un modelo tarda en empezar, se lanza el
// siguiente a la vez y se queda el primero que responda.
import { previousSeason } from "@/lib/game-day";
import { buildTrade, GRADES, pickLabel, type GmData, type GmPlayer, type GmTeam, type GmTrade, type TradeEvaluation, type TradeRequest } from "@/lib/gm";
import { archetypeOf, RADAR_LABEL } from "@/lib/player-profile";
import { getGmData, getScoutingReports, type ScoutingReport } from "@/lib/queries";
import { RADAR_CATEGORIES } from "@/lib/supabase";
import { partialEvaluation, type EvaluationStep, type PartialEvaluation } from "@/lib/trade-evaluation-stream";
import { checkTrade, formatMoney, salaryZone, SEASON, verdictTitle, ZONE_LABEL } from "@/lib/trade-rules";

const API_URL = "https://generativelanguage.googleapis.com/v1beta/models";
// Medido en noviembre de 2026 con traspasos reales: 3.5-flash tardaba 34-43 s (razonaba ~2.500 tokens
// y hacía cola; sin razonar, 21-26 s) y 3.6/3.7/3.8-flash, igual o saturados. Con razonamiento bajo,
// 3.1-flash-lite responde en 2,5-3,5 s con buen baloncesto, tildes y toda la escala de notas;
// 3-flash-preview escribe igual de bien pero a veces sin tildes; 3.5-flash-lite era más blando con las
// notas y fallaba más. El alias "-latest" siempre existe.
const DEFAULT_MODEL = "gemini-3.1-flash-lite";
const FALLBACK_MODELS = ["gemini-3-flash-preview", "gemini-flash-lite-latest"];
/** Si un modelo no ha empezado a escribir en este tiempo, se lanza el siguiente a la vez. */
const HEDGE_MS = 5_000;
const TIMEOUT_MS = 30_000;
const ROTATION_SIZE = 9;

const SYSTEM_PROMPT = `Eres el analista de un programa de televisión sobre la NBA y escribes en español de España, con tildes.
Evalúas un traspaso simulado por un aficionado, ya validado contra las reglas salariales.

Reglas OBLIGATORIAS:
- Usa SOLO los datos que recibes. Plantillas, edades, promedios y contratos son los actuales aunque difieran de lo que recuerdes. No inventes lesiones, rumores, declaraciones ni datos externos.
- "movimientos" dice de dónde sale y adónde va cada jugador y cada ronda. En cada equipo, "recibe" son los que llegan y "envia" los que se van: no los confundas.
- Valora para cada equipo el encaje táctico en pista: posiciones, espaciado, creación de juego, defensa, rebote y quién pierde minutos con la llegada de cada jugador.
- Ten en cuenta su momento competitivo (balance y edad de la plantilla) y el coste de futuro: años de contrato, opciones y rondas cedidas.
- Escribe primero el análisis de cada equipo y solo después su titular y su nota, que tiene que salir de ese análisis. El resumen va al final.
- "analysis": 2 o 3 frases por equipo, entre 35 y 60 palabras, con nombres propios y razones de baloncesto.
- "headline": titular de cada equipo, 8 palabras como máximo.
- "grade": de A+ a F. Usa toda la escala con honestidad: un robo o un disparate deben verse en la nota, y no todo merece una B.
- "summary": una frase de 30 palabras como máximo con la conclusión del traspaso.
- Los atributos van de 40 (el último de los jugadores de rotación) a 99 (el primero): no los cites, tradúcelos a lenguaje de baloncesto.
- Si un contrato aún no es público y su salario es una estimación del aficionado, dilo así: nunca lo presentes como una cifra oficial.
- Texto plano: sin markdown ni emojis. Salarios en millones ("25,8 millones").`;

function contractFacts(player: GmPlayer): string {
  if (player.salaryStatus === "pending") return "recién firmado, cifra aún no pública";
  if (player.salaryStatus === "estimated") return `recién firmado, cifra aún no pública: el aficionado la estima en ${formatMoney(player.salary)} esta temporada`;
  const years = player.contract.filter((salary) => salary !== null).length;
  const length = years === 4 ? "4 años o más" : `${years} año(s)`;
  const renewal = player.futurePending ? ", más años aún sin cifra pública" : "";
  const amount = player.salaryStatus === "approx" ? `≈${formatMoney(player.salary)} (cifra redondeada publicada por la prensa)` : formatMoney(player.salary);
  return `${amount} esta temporada, ${length}${player.option ? `, ${player.option}` : ""}${renewal}`;
}

function playerFacts(player: GmPlayer, report: ScoutingReport | undefined) {
  const radar = report?.radar;
  return {
    nombre: player.name,
    posicion: player.position,
    edad: player.age,
    altura: report?.height,
    perfil: radar && archetypeOf(radar),
    contrato: contractFacts(player),
    promedios: report?.games_played
      ? {
          temporada: report.season_id,
          partidos: report.games_played,
          minutos: report.minutes,
          puntos: report.pts,
          rebotes: report.reb,
          asistencias: report.ast,
          triples_pct: report.fg3_pct,
          tiro_real_pct: report.tsPct,
        }
      : null,
    atributos: radar && Object.fromEntries(RADAR_CATEGORIES.map((category) => [RADAR_LABEL[category], radar[category]])),
  };
}

/** Lo que el modelo sabe del traspaso: cada equipo con lo que entra, lo que sale y cómo queda su rotación. */
async function tradeFacts(data: GmData, trade: GmTrade) {
  const teamIds = trade.teams.map((team) => team.id);
  const involved = data.players.filter((player) => teamIds.includes(player.teamId));
  const reports = await getScoutingReports(involved.map((player) => player.id), SEASON, previousSeason(SEASON));
  const verdict = checkTrade(trade, data.today);
  const minutes = (player: GmPlayer) => reports.get(player.id)?.minutes ?? 0;
  const abbreviation = (teamId: number) => trade.teams.find((team) => team.id === teamId)?.abbreviation;

  return {
    fecha: data.today,
    temporada: SEASON,
    veredicto: verdictTitle(verdict),
    movimientos: [
      ...trade.players.map(({ player, to }) => `${player.name}: ${abbreviation(player.teamId)} → ${abbreviation(to)}`),
      ...trade.picks.map(({ pick, to }) => `${pickLabel(pick)} de ${abbreviation(pick.teamId)}: ${abbreviation(pick.teamId)} → ${abbreviation(to)}`),
    ],
    equipos: trade.teams.map((team) => {
      const report = verdict.teams.find((entry) => entry.teamId === team.id)!;
      const arriving = trade.players.filter((move) => move.to === team.id).map((move) => move.player);
      const leaving = trade.players.filter((move) => move.player.teamId === team.id).map((move) => move.player);
      const staying = involved
        .filter((player) => player.teamId === team.id && !leaving.includes(player))
        .sort((a, b) => minutes(b) - minutes(a))
        .slice(0, ROTATION_SIZE);
      return {
        equipo: team.name,
        sigla: team.abbreviation,
        balance: `${team.wins}-${team.losses}`,
        nomina: `${formatMoney(team.payroll)} → ${formatMoney(report.payrollAfter)} (${ZONE_LABEL[salaryZone(report.payrollAfter)]})`,
        recibe: arriving.map((player) => playerFacts(player, reports.get(player.id))),
        envia: leaving.map((player) => playerFacts(player, reports.get(player.id))),
        rondas_recibidas: trade.picks.filter((move) => move.to === team.id).map((move) => pickLabel(move.pick)),
        rondas_cedidas: trade.picks.filter((move) => move.pick.teamId === team.id).map((move) => pickLabel(move.pick)),
        rotacion_que_se_queda: staying.map((player) => playerFacts(player, reports.get(player.id))),
      };
    }),
  };
}

/** Esquema con el orden de escritura: análisis antes que nota (sin razonamiento largo, el modelo razona escribiendo). */
function responseSchema(teams: GmTeam[]) {
  return {
    type: "OBJECT",
    properties: {
      teams: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            team: { type: "STRING", enum: teams.map((team) => team.abbreviation) },
            analysis: { type: "STRING" },
            headline: { type: "STRING" },
            grade: { type: "STRING", enum: [...GRADES] },
          },
          required: ["team", "analysis", "headline", "grade"],
          propertyOrdering: ["team", "analysis", "headline", "grade"],
        },
      },
      summary: { type: "STRING" },
    },
    required: ["teams", "summary"],
    propertyOrdering: ["teams", "summary"],
  };
}

/** Respuesta validada, o null si no trae una nota legible para cada equipo. */
function parseEvaluation(text: string, teams: GmTeam[]): TradeEvaluation | null {
  try {
    const { summary, teams: entries } = JSON.parse(text) as {
      summary?: string;
      teams?: { team?: string; grade?: string; headline?: string; analysis?: string }[];
    };
    const graded = teams.map((team) => {
      const entry = entries?.find((candidate) => candidate.team === team.abbreviation);
      const grade = GRADES.find((value) => value === entry?.grade);
      return grade && entry?.headline && entry.analysis ? { teamId: team.id, grade, headline: entry.headline, analysis: entry.analysis } : null;
    });
    if (!summary || graded.some((entry) => entry === null)) return null;
    return { summary, teams: graded as TradeEvaluation["teams"] };
  } catch {
    return null;
  }
}

/** Texto de cada trozo del stream SSE de Gemini (sin los fragmentos de razonamiento). */
async function* sseText(response: Response): AsyncGenerator<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replaceAll("\r", "");
    let end: number;
    while ((end = buffer.indexOf("\n\n")) >= 0) {
      const event = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = event
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5))
        .join("");
      if (!data) continue;
      const chunk = JSON.parse(data) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
      const text = chunk.candidates?.[0]?.content?.parts?.map((part) => (part.thought ? "" : (part.text ?? ""))).join("") ?? "";
      if (text) yield text;
    }
  }
}

type Started = { model: string; first: string; rest: AsyncGenerator<string> };

/** Abre el stream de un modelo y espera a su primer texto (si falla antes, rechaza). */
async function startModel(model: string, apiKey: string, facts: string, teams: GmTeam[], signal: AbortSignal): Promise<Started> {
  const response = await fetch(`${API_URL}/${model}:streamGenerateContent?alt=sse`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: `Datos del traspaso:\n${facts}` }] }],
      generationConfig: {
        temperature: 0.6,
        responseMimeType: "application/json",
        responseSchema: responseSchema(teams),
        thinkingConfig: { thinkingLevel: "low" },
      },
    }),
  });
  if (!response.ok) throw new Error(`respondió ${response.status}`);
  const rest = sseText(response);
  const first = await rest.next();
  if (first.done) throw new Error("respuesta vacía");
  return { model, first: first.value, rest };
}

/**
 * Lanza los modelos en orden: el siguiente sale si el anterior falla o lleva `HEDGE_MS` sin escribir.
 * Se queda el primero que empiece a responder y cancela el resto.
 */
function firstToRespond(models: string[], start: (model: string, signal: AbortSignal) => Promise<Started>): Promise<Started & { index: number }> {
  return new Promise((resolve, reject) => {
    const controllers: AbortController[] = [];
    let launched = 0;
    let failed = 0;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const launch = () => {
      clearTimeout(timer);
      if (settled || launched >= models.length) return;
      const index = launched++;
      const controller = new AbortController();
      controllers[index] = controller;
      timer = setTimeout(launch, HEDGE_MS);
      start(models[index], controller.signal).then(
        (started) => {
          if (settled) return controller.abort();
          settled = true;
          clearTimeout(timer);
          controllers.forEach((other, i) => i !== index && other.abort());
          resolve({ ...started, index });
        },
        (error) => {
          if (settled) return;
          console.warn(`[gm] ${models[index]} no disponible:`, error instanceof Error ? error.message : error);
          failed++;
          if (launched < models.length) launch();
          else if (failed === launched) {
            settled = true;
            reject(new Error("Ningún modelo de Gemini disponible"));
          }
        },
      );
    };
    launch();
  });
}

/** Quien sigue la evaluación mientras se calcula: pasos y texto a medias. */
export type EvaluationProgress = { step: (step: EvaluationStep) => void; partial: (evaluation: PartialEvaluation) => void };

const listeners = new Map<string, Set<EvaluationProgress>>();
/** Evaluaciones en marcha en esta instancia: si llega otra del mismo traspaso, sigue la que ya hay. */
const running = new Map<string, Promise<TradeEvaluation>>();

function emit(canonical: string, send: (progress: EvaluationProgress) => void) {
  listeners.get(canonical)?.forEach((progress) => {
    try {
      send(progress);
    } catch {
      // El cliente se fue: la evaluación sigue y se guarda
    }
  });
}

/** Evalúa un traspaso legal, dado en su forma canónica (`canonicalTrade`). Quien llama mira antes si ya está hecha (`gm-store`). */
async function evaluateTrade(canonical: string): Promise<TradeEvaluation> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Falta GEMINI_API_KEY en web-app/.env.local");

  emit(canonical, (progress) => progress.step("datos"));
  const data = await getGmData();
  const trade = buildTrade(data, JSON.parse(canonical) as TradeRequest);
  if (!trade) throw new Error("Traspaso no válido");
  const facts = JSON.stringify(await tradeFacts(data, trade));

  let models = [process.env.GEMINI_MODEL || DEFAULT_MODEL, ...FALLBACK_MODELS];
  while (models.length > 0) {
    emit(canonical, (progress) => progress.step("modelo"));
    const started = await firstToRespond(models, (model, signal) => startModel(model, apiKey, facts, trade.teams, signal));
    emit(canonical, (progress) => progress.step("escritura"));

    let raw = started.first;
    const showPartial = () => {
      const partial = partialEvaluation(raw, trade.teams, GRADES);
      if (partial) emit(canonical, (progress) => progress.partial(partial));
    };
    showPartial();
    try {
      for await (const text of started.rest) {
        raw += text;
        showPartial();
      }
    } catch (error) {
      console.warn(`[gm] ${started.model} se cortó:`, error instanceof Error ? error.message : error);
    }

    const evaluation = parseEvaluation(raw, trade.teams);
    if (evaluation) return evaluation;
    console.warn(`[gm] ${started.model} no dio una evaluación válida`);
    models = models.slice(started.index + 1);
  }
  throw new Error("Ningún modelo de Gemini dio una evaluación válida");
}

/** `evaluateTrade` avisando a `progress` de cada paso mientras se calcula. */
export async function evaluateTradeWithProgress(canonical: string, progress: EvaluationProgress): Promise<TradeEvaluation> {
  const current = listeners.get(canonical) ?? new Set();
  current.add(progress);
  listeners.set(canonical, current);
  try {
    let evaluation = running.get(canonical);
    if (!evaluation) {
      evaluation = evaluateTrade(canonical).finally(() => running.delete(canonical));
      running.set(canonical, evaluation);
    }
    return await evaluation;
  } finally {
    current.delete(progress);
    if (current.size === 0) listeners.delete(canonical);
  }
}
