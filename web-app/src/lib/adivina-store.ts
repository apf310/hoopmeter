// Adivina el jugador en el servidor (Tarea 8.3): la foto del día y las partidas. Solo servidor.
//
// La foto del día (jugador, radar y pistas de todos los que se pueden decir) la guarda `game-days.ts` en `game_days`
// (compartido con Carrera oculta): la misma para todos durante todo el día y sin repetir jugador en `REPEAT_DAYS` días.
import {
  buildPuzzle,
  guessRun,
  isAdivinaRun,
  isDayPuzzle,
  newRun,
  REPEAT_DAYS,
  runScore,
  viewRun,
  type AdivinaRun,
  type DayPuzzle,
  type GuessError,
  type RunView,
  type SuspectRow,
  type TeamInfo,
} from "./adivina";
import { createDayStore } from "./game-days";
import { withReceipt } from "./game-receipt";
import { createRunStore } from "./game-runs";
import { getTeams, selectPages } from "./queries";
import { getSupabase, type Player, type PlayerContract } from "./supabase";

const GAME = "adivina";

// ---------------------------------------------------------------------------------------------------------
// Foto del día

async function loadRows(): Promise<SuspectRow[]> {
  type Row = Pick<Player, "id" | "full_name" | "position" | "height" | "birth_date" | "team_id"> & { radar_attributes: SuspectRow["radar"] | null };
  const supabase = getSupabase();
  const [rows, contracts] = await Promise.all([
    selectPages<Row>("jugadores", (from, to) =>
      supabase
        .from("players")
        .select("id, full_name, position, height, birth_date, team_id, radar_attributes")
        .eq("is_active", true)
        .not("team_id", "is", null)
        .order("id")
        .range(from, to)
    ),
    // Solo para saber quién es una figura (nunca sale de aquí)
    selectPages<Pick<PlayerContract, "player_id" | "salary_current">>("contratos", (from, to) =>
      supabase.from("player_contracts").select("player_id, salary_current").order("player_id").range(from, to)
    ),
  ]);
  const salary = new Map(contracts.map((c) => [c.player_id, c.salary_current]));
  return rows.map((r) => ({
    id: r.id,
    name: r.full_name,
    position: r.position,
    height: r.height,
    birthDate: r.birth_date,
    teamId: r.team_id,
    salary: salary.get(r.id) ?? null,
    radar: r.radar_attributes ?? {},
  }));
}

/** La foto de un día (el de hoy, o el de una partida empezada antes de las 7:00). */
export const getPuzzle = createDayStore<DayPuzzle, [SuspectRow[], Awaited<ReturnType<typeof getTeams>>]>(GAME, {
  isPuzzle: isDayPuzzle,
  repeatDays: REPEAT_DAYS,
  load: () => Promise.all([loadRows(), getTeams()]),
  build: ([rows, teams], day, recent, rng) => {
    // Solo abreviatura y conferencia: nunca la clasificación que lleva cada equipo
    const info = new Map<number, TeamInfo>(
      teams.map((t) => [t.id, { abbr: t.abbreviation, conf: t.conference === "East" || t.conference === "West" ? t.conference : null }])
    );
    return buildPuzzle(rows, info, day, recent, rng);
  },
});

// ---------------------------------------------------------------------------------------------------------
// Partidas (`game-runs.ts`, compartido con ¿Más o menos?)

const runs = createRunStore<AdivinaRun>(GAME, {
  isState: isAdivinaRun,
  score: (state) => {
    const { points, finished } = runScore(state);
    return { score: points, totalMs: 0, finished };
  },
});

export type StoredView = { run: string; view: RunView; puzzle: DayPuzzle };

/** Acabada: con su recibo, para pasarla a la cuenta (Tarea 8.5). */
const signed = (run: string, view: RunView): RunView =>
  view.summary ? { ...view, summary: withReceipt(view.summary, { run, game: GAME, day: view.day }) } : view;

/** Una partida guardada con lo que se ve de ella; null si ya no existe. */
export async function getRun(id: string): Promise<StoredView | null> {
  const state = await runs.get(id);
  if (!state) return null;
  const puzzle = await getPuzzle(state.day);
  return { run: id, view: signed(id, viewRun(state, puzzle)), puzzle };
}

export type GuessResult = StoredView | { error: GuessError | "not-found" | "conflict" };

/**
 * Intento `index` diciendo `playerId`. Sin partida (`run` null), la empieza con la foto de `day`, que tiene que ser la
 * de hoy: el jugador cambia a las 7:00 y quien tenía la página abierta desde antes ve el radar de ayer.
 */
export async function guess(run: string | null, day: string, index: number, playerId: number): Promise<GuessResult> {
  let id = run;
  if (id === null) {
    if (index !== 0) return { error: "not-found" };
    const puzzle = await getPuzzle(day);
    id = await runs.create(newRun(puzzle));
  }
  // Solo hace falta su día: si la memoria va por detrás, `play` la pone al día
  const state = await runs.get(id, { fresh: false });
  if (!state) return { error: "not-found" };
  const puzzle = await getPuzzle(state.day);
  const result = await runs.play(id, (s) => guessRun(s, puzzle, index, playerId));
  if ("error" in result) return result;
  return { run: id, view: signed(id, result.outcome), puzzle };
}
