// ¿Más o menos? en el servidor (Tarea 8.2): los jugadores de las preguntas y las partidas. Solo servidor.
//
// Las partidas viven en Supabase (`backend-data/juegos.sql`) a través de `game-runs.ts`: sin la clave, o si Supabase
// falla, siguen en la memoria de la instancia y el juego nunca deja de funcionar.
import { withReceipt } from "./game-receipt";
import { createRunStore } from "./game-runs";
import { answerRun, isRunState, runSummary, isFinished, buildPool, type AnswerOutcome, type Choice, type Pool, type RunState, type TeamTag } from "./mas-o-menos";
import { getExplorerSeasons, getPlayerExplorer, getTeams } from "./queries";
import { teamAccent, teamBackdrop } from "./team-colors";

const GAME = "mas-o-menos";

// ---------------------------------------------------------------------------------------------------------
// Jugadores: los del explorador (job diario, caché compartida hasta el siguiente) con su equipo de hoy

const POOL_MS = 10 * 60_000;
let pool: { at: number; value: Promise<Pool> } | null = null;

async function loadPool(): Promise<Pool> {
  const [seasons, teams] = await Promise.all([getExplorerSeasons(), getTeams()]);
  const explorer = await getPlayerExplorer(seasons[0]);
  // Solo abreviatura y colores: nunca la clasificación que lleva cada equipo
  const tags = new Map<number, TeamTag>(
    teams.map((team) => [team.id, { abbr: team.abbreviation, color: teamBackdrop(team.primary_color), accent: teamAccent(team) }])
  );
  return buildPool(explorer.current ? explorer.rows : explorer.rows.map((row) => ({ ...row, overall: null })), tags, explorer.season);
}

export function getPool(): Promise<Pool> {
  if (!pool || Date.now() - pool.at > POOL_MS) {
    const value = loadPool();
    pool = { at: Date.now(), value };
    // Si falla, la próxima petición lo vuelve a intentar
    value.catch(() => {
      if (pool?.value === value) pool = null;
    });
  }
  return pool.value;
}

// ---------------------------------------------------------------------------------------------------------
// Partidas (`game-runs.ts`, compartido con Adivina el jugador)

const runs = createRunStore<RunState>(GAME, {
  isState: isRunState,
  score: (state) => {
    const summary = runSummary(state);
    return { score: summary.points, totalMs: summary.ms, finished: isFinished(state) };
  },
});

/** Guarda una partida nueva y devuelve su id. */
export const createRun = (state: RunState): Promise<string> => runs.create(state);

export type AnswerResult = { outcome: AnswerOutcome } | { error: "not-found" | "out-of-order" };

/**
 * Responde la pregunta `index` de la partida `id` con la hora del servidor. Reenviar una respuesta devuelve la que
 * contó; si la memoria de esta instancia se ha quedado atrás (la partida siguió en otra), manda la base de datos.
 */
export async function answerStoredRun(id: string, index: number, choice: Choice | null, now: number): Promise<AnswerResult> {
  let day = "";
  const result = await runs.play(id, (state) => {
    day = state.day;
    return answerRun(state, index, choice, now) ?? { error: "out-of-order" as const };
  });
  if ("outcome" in result) {
    const { summary } = result.outcome;
    // Acabada: con su recibo, para pasarla a la cuenta (Tarea 8.5)
    return summary ? { outcome: { ...result.outcome, summary: withReceipt(summary, { run: id, game: GAME, day, ms: summary.ms }) } } : result;
  }
  return { error: result.error === "not-found" ? "not-found" : "out-of-order" };
}
