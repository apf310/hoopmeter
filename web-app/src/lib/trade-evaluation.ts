// Evaluación de traspasos con Gemini (solo servidor: la clave nunca llega al navegador).
// El modelo recibe los datos reales de la app y responde en un JSON con esquema fijo, que se valida.
import { cacheLife } from "next/cache";
import { previousSeason } from "@/lib/game-day";
import { buildTrade, GRADES, pickLabel, type GmData, type GmPlayer, type GmTeam, type GmTrade, type TradeEvaluation, type TradeRequest } from "@/lib/gm";
import { archetypeOf, RADAR_LABEL } from "@/lib/player-profile";
import { getGmData, getScoutingReports, type ScoutingReport } from "@/lib/queries";
import { RADAR_CATEGORIES } from "@/lib/supabase";
import { checkTrade, formatMoney, salaryZone, SEASON, verdictTitle, ZONE_LABEL } from "@/lib/trade-rules";

const API_URL = "https://generativelanguage.googleapis.com/v1beta/models";
// Mismo orden que el backend: si el principal está saturado o retirado, los alias "-latest" siempre existen
const DEFAULT_MODEL = "gemini-3.5-flash";
const FALLBACK_MODELS = ["gemini-flash-latest", "gemini-flash-lite-latest"];
const TIMEOUT_MS = 30_000;
const ROTATION_SIZE = 9;

const SYSTEM_PROMPT = `Eres el analista de un programa de televisión sobre la NBA y escribes en español de España.
Evalúas un traspaso simulado por un aficionado, ya validado contra las reglas salariales.

Reglas OBLIGATORIAS:
- Usa SOLO los datos que recibes. Plantillas, edades, promedios y contratos son los actuales aunque difieran de lo que recuerdes. No inventes lesiones, rumores, declaraciones ni datos externos.
- Valora para cada equipo el encaje táctico en pista: posiciones, espaciado, creación de juego, defensa, rebote y quién pierde minutos con la llegada de cada jugador.
- Ten en cuenta su momento competitivo (balance y edad de la plantilla) y el coste de futuro: años de contrato, opciones y rondas cedidas.
- Pon a cada equipo una nota de A+ a F y usa toda la escala con honestidad: un robo o un disparate deben verse en la nota, y no todo merece una B.
- "summary": una frase de 30 palabras como máximo con la conclusión del traspaso.
- "headline": titular de cada equipo, 8 palabras como máximo.
- "analysis": 2 o 3 frases por equipo, entre 35 y 60 palabras, con nombres propios y razones de baloncesto.
- Los atributos son percentiles de 0 a 99 frente al resto de la liga: no los cites, tradúcelos a lenguaje de baloncesto.
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

  return {
    fecha: data.today,
    temporada: SEASON,
    veredicto: verdictTitle(verdict),
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

function responseSchema(teams: GmTeam[]) {
  return {
    type: "OBJECT",
    properties: {
      summary: { type: "STRING" },
      teams: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            team: { type: "STRING", enum: teams.map((team) => team.abbreviation) },
            grade: { type: "STRING", enum: [...GRADES] },
            headline: { type: "STRING" },
            analysis: { type: "STRING" },
          },
          required: ["team", "grade", "headline", "analysis"],
        },
      },
    },
    required: ["summary", "teams"],
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

async function askModel(model: string, apiKey: string, facts: string, teams: GmTeam[]): Promise<TradeEvaluation | null> {
  const response = await fetch(`${API_URL}/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: `Datos del traspaso:\n${facts}` }] }],
      generationConfig: { temperature: 0.6, responseMimeType: "application/json", responseSchema: responseSchema(teams) },
    }),
  });
  if (!response.ok) {
    console.warn(`[gm] ${model} respondió ${response.status}`);
    return null;
  }
  const body = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  return parseEvaluation(text, teams);
}

/**
 * Evalúa un traspaso legal, dado en su forma canónica (`canonicalTrade`). Cada traspaso se evalúa
 * una sola vez: el mismo cambio repetido no gasta cuota. Los errores no se cachean.
 */
export async function evaluateTrade(canonical: string): Promise<TradeEvaluation> {
  "use cache";
  cacheLife("days");

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Falta GEMINI_API_KEY en web-app/.env.local");

  const data = await getGmData();
  const trade = buildTrade(data, JSON.parse(canonical) as TradeRequest);
  if (!trade) throw new Error("Traspaso no válido");

  const facts = JSON.stringify(await tradeFacts(data, trade));
  const models = [process.env.GEMINI_MODEL || DEFAULT_MODEL, ...FALLBACK_MODELS];
  for (const model of models) {
    try {
      const evaluation = await askModel(model, apiKey, facts, trade.teams);
      if (evaluation) return evaluation;
    } catch (error) {
      console.warn(`[gm] ${model} no disponible:`, error);
    }
  }
  throw new Error("Ningún modelo de Gemini disponible");
}
