// Adivina el jugador (Tarea 8.3). Todo se decide aquí: jugador del día, pistas, número de intento y puntos.
//   GET                                               → {puzzle}: el radar del día y a quién se puede decir (sin pistas)
//   GET ?run=ID                                       → {puzzle, run, view}: una partida empezada (null si ya no existe)
//   POST {action: "guess", run|null, day, index, player} → {run, view}: sin partida, la empieza con ese intento
// El jugador del día solo sale en `view.answer` al acabar. La IP solo cuenta peticiones en memoria durante un minuto:
// nunca se guarda.
import { connection } from "next/server";
import { publicPuzzle, MAX_GUESSES } from "@/lib/adivina";
import { getPuzzle, getRun, guess } from "@/lib/adivina-store";
import { cdnHeaders } from "@/lib/cache-window";
import { challengeDay, nextChallengeAt } from "@/lib/games";

const NO_STORE = { "Cache-Control": "no-store" };
const WINDOW_MS = 60_000;
const MAX_STARTS = 10;
const MAX_GUESSES_PER_MINUTE = 40;
/** Lo que la CDN guarda el reto del día (y nunca pasadas las 7:00, cuando cambia). */
const PUZZLE_CACHE_S = 600;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

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

const json = (body: unknown, status = 200, headers: Record<string, string> = NO_STORE) => Response.json(body, { status, headers });

const unavailable = (error: unknown) => {
  console.error("[api/juegos/adivina]", error);
  return json({ error: "El reto no está disponible ahora mismo. Inténtalo en un rato." }, 503);
};

export async function GET(request: Request) {
  await connection();
  const run = new URL(request.url).searchParams.get("run");
  if (run !== null && !UUID.test(run)) return json({ error: "Partida no válida" }, 400);
  try {
    const now = Date.now();
    if (run) {
      const stored = await getRun(run);
      if (stored) return json({ puzzle: publicPuzzle(stored.puzzle), run: stored.run, view: stored.view });
    }
    const puzzle = publicPuzzle(await getPuzzle(challengeDay(now)));
    if (run) return json({ puzzle, run: null, view: null });
    const untilNext = Math.max(0, Math.floor((nextChallengeAt(now) - now) / 1000));
    const window = Math.min(PUZZLE_CACHE_S, untilNext);
    return json({ puzzle }, 200, cdnHeaders({ fresh: window, expire: window }));
  } catch (error) {
    return unavailable(error);
  }
}

export async function POST(request: Request) {
  const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (body?.action !== "guess") return json({ error: "Acción no válida" }, 400);

  const { run, day, index, player } = body;
  if (
    (run !== null && (typeof run !== "string" || !UUID.test(run))) ||
    typeof day !== "string" ||
    !DAY.test(day) ||
    !Number.isInteger(index) ||
    (index as number) < 0 ||
    (index as number) >= MAX_GUESSES ||
    !Number.isInteger(player)
  ) {
    return json({ error: "Intento no válido" }, 400);
  }
  if (isRateLimited(`guess:${client}`, MAX_GUESSES_PER_MINUTE)) return json({ error: "Demasiados intentos seguidos: espera un minuto." }, 429);
  if (run === null) {
    if (isRateLimited(`start:${client}`, MAX_STARTS)) return json({ error: "Demasiadas partidas seguidas: espera un minuto." }, 429);
    // El jugador cambia a las 7:00: quien tenía la página abierta desde antes estaba viendo el radar de ayer
    if (day !== challengeDay(Date.now())) return json({ error: "Ya hay jugador nuevo.", code: "new-day" }, 409);
  }

  try {
    const result = await guess(run as string | null, day, index as number, player as number);
    if (!("error" in result)) return json({ run: result.run, view: result.view });
    switch (result.error) {
      case "not-found":
        return json({ error: "Esta partida ya no existe.", code: "not-found" }, 404);
      case "unknown-player":
        return json({ error: "Ese jugador no está en la lista de hoy." }, 400);
      case "repeated":
        return json({ error: "Ya lo has dicho." }, 409);
      default:
        return json({ error: "Ese intento no toca ahora.", code: "out-of-order" }, 409);
    }
  } catch (error) {
    return unavailable(error);
  }
}
