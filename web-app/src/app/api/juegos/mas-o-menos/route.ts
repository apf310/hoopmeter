// ¿Más o menos?, reto del día (Tarea 8.2). Todo se decide aquí: preguntas propias de cada partida, solución y reloj.
//   POST {action: "start"}                          → {run, day, limitMs, revealMs, question}
//   POST {action: "answer", run, index, choice}      → AnswerOutcome (choice null = se acabó el tiempo)
// La pregunta llega sin la cifra del segundo jugador; la cifra, solo al responder. La IP solo cuenta peticiones en
// memoria durante un minuto: nunca se guarda.
import { randomInt } from "node:crypto";
import { challengeDay } from "@/lib/games";
import { ANSWER_MS, buildQuestions, currentQuestion, DAILY_PLAN, DAILY_QUESTIONS, newRun, parseChoice, REVEAL_MS, seededRng } from "@/lib/mas-o-menos";
import { answerStoredRun, createRun, getPool } from "@/lib/mas-o-menos-store";

const NO_STORE = { "Cache-Control": "no-store" };
const WINDOW_MS = 60_000;
const MAX_STARTS = 10;
const MAX_ANSWERS = 120;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const recent = new Map<string, number[]>();

function isRateLimited(key: string, max: number): boolean {
  const now = Date.now();
  const hits = (recent.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
  hits.push(now);
  recent.set(key, hits);
  if (recent.size > 5_000) {
    for (const [k, times] of recent) if (times.every((at) => now - at >= WINDOW_MS)) recent.delete(k);
  }
  return hits.length > max;
}

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE });

export async function POST(request: Request) {
  const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  if (body?.action === "start") {
    if (isRateLimited(`start:${client}`, MAX_STARTS)) return json({ error: "Demasiadas partidas seguidas: espera un minuto." }, 429);
    try {
      const pool = await getPool();
      const questions = buildQuestions(pool, DAILY_PLAN, seededRng(randomInt(2 ** 32)));
      const now = Date.now();
      const state = newRun(questions, challengeDay(now), now);
      const run = await createRun(state);
      return json({ run, day: state.day, limitMs: ANSWER_MS, revealMs: REVEAL_MS, question: currentQuestion(state) });
    } catch (error) {
      console.error("[api/juegos/mas-o-menos]", error);
      return json({ error: "El reto no está disponible ahora mismo. Inténtalo en un rato." }, 503);
    }
  }

  if (body?.action === "answer") {
    if (isRateLimited(`answer:${client}`, MAX_ANSWERS)) return json({ error: "Demasiadas respuestas seguidas." }, 429);
    const { run, index } = body;
    const choice = parseChoice(body.choice);
    if (typeof run !== "string" || !UUID.test(run) || !Number.isInteger(index) || (index as number) < 0 || (index as number) >= DAILY_QUESTIONS || choice === undefined) {
      return json({ error: "Respuesta no válida" }, 400);
    }
    const result = await answerStoredRun(run, index as number, choice, Date.now());
    if ("error" in result) {
      return result.error === "not-found"
        ? json({ error: "Esta partida ya no existe: empieza otra." }, 404)
        : json({ error: "Esa pregunta no toca ahora." }, 409);
    }
    return json(result.outcome);
  }

  return json({ error: "Acción no válida" }, 400);
}
