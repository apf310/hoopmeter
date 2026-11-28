// Carrera oculta en el servidor (Tarea 8.4): la foto del día y las partidas. Solo servidor.
//
// La foto del día (jugador, su carrera con equipos, sus pistas y a quién se puede decir) la guarda `game-days.ts` en
// `game_days`, como Adivina el jugador: la misma para todos durante todo el día aunque el job diario de las 11:30
// cambie la temporada en curso, y sin repetir jugador en `REPEAT_DAYS` días. Las partidas, en `game_runs`
// (`game-runs.ts`, compartido con los otros dos retos).
import {
  buildPuzzle,
  HONOUR_AWARDS,
  honoursOf,
  isCarreraRun,
  isDayPuzzle,
  newRun,
  playRun,
  REPEAT_DAYS,
  runScore,
  viewRun,
  type CarreraRun,
  type DayPuzzle,
  type Move,
  type MoveError,
  type PlayerRow,
  type PuzzleData,
  type RunView,
  type SeasonRow,
  type TeamInfo,
} from "./carrera";
import { createDayStore } from "./game-days";
import { withReceipt } from "./game-receipt";
import { createRunStore } from "./game-runs";
import { getTeams, selectPages } from "./queries";
import { getSupabase, type Player, type PlayerContract } from "./supabase";

const GAME = "carrera";

// ---------------------------------------------------------------------------------------------------------
// Foto del día

async function loadData(): Promise<PuzzleData> {
  type PlayerDb = Pick<Player, "id" | "full_name" | "is_active" | "team_id" | "position" | "height" | "country" | "draft_year" | "draft_number">;
  type SeasonDb = {
    player_id: number;
    season_id: string;
    team_id: number | null;
    pts: number | null;
    reb: number | null;
    ast: number | null;
    games_played: number | null;
    age: unknown;
    abbr: unknown;
    teams: unknown;
  };
  const supabase = getSupabase();
  const [players, seasons, contracts, awards, teams] = await Promise.all([
    selectPages<PlayerDb>("jugadores", (from, to) =>
      supabase.from("players").select("id, full_name, is_active, team_id, position, height, country, draft_year, draft_number").order("id").range(from, to)
    ),
    // Las ~5.000 temporadas regulares guardadas, en paralelo (incluida "Career", para saber quién tiene la carrera completa)
    selectPages<SeasonDb>(
      "temporadas",
      (from, to) =>
        supabase
          .from("player_season_stats")
          .select("player_id, season_id, team_id, games_played, pts, reb, ast, age:advanced_stats->age, abbr:advanced_stats->team_abbreviation, teams:advanced_stats->teams")
          .eq("season_type", "Regular Season")
          .order("id")
          .range(from, to),
      6
    ),
    // Solo para saber quién es una figura (nunca sale de aquí)
    selectPages<Pick<PlayerContract, "player_id" | "salary_current">>("contratos", (from, to) =>
      supabase.from("player_contracts").select("player_id, salary_current").order("player_id").range(from, to)
    ),
    selectPages<{ player_id: number; award_name: string }>(
      "palmarés",
      (from, to) => supabase.from("player_awards").select("player_id, award_name").in("award_name", Object.values(HONOUR_AWARDS)).order("id").range(from, to),
      2
    ),
    getTeams(),
  ]);

  const salary = new Map(contracts.map((c) => [c.player_id, c.salary_current]));
  const withCareer = new Set(seasons.filter((s) => s.season_id === "Career").map((s) => s.player_id));
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    players: players.map(
      (p): PlayerRow => ({
        id: p.id,
        name: p.full_name,
        active: p.is_active,
        teamId: p.team_id,
        position: p.position,
        height: p.height,
        country: p.country,
        draftYear: p.draft_year,
        draftNumber: p.draft_number,
        salary: salary.get(p.id) ?? null,
        hasCareer: withCareer.has(p.id),
      })
    ),
    seasons: seasons
      .filter((s) => s.season_id !== "Career")
      .map(
        (s): SeasonRow => ({
          playerId: s.player_id,
          season: s.season_id,
          teamId: s.team_id,
          abbr: typeof s.abbr === "string" ? s.abbr : null,
          teams: Array.isArray(s.teams) ? (s.teams as SeasonRow["teams"]) : null,
          age: num(s.age),
          gp: s.games_played,
          pts: s.pts,
          reb: s.reb,
          ast: s.ast,
        })
      ),
    honours: honoursOf(awards),
    // Solo la abreviatura: nunca la clasificación que lleva cada equipo
    teams: new Map<number, TeamInfo>(teams.map((t) => [t.id, { abbr: t.abbreviation }])),
  };
}

/** La foto de un día (el de hoy, o el de una partida empezada antes de las 7:00). */
export const getPuzzle = createDayStore<DayPuzzle, PuzzleData>(GAME, {
  isPuzzle: isDayPuzzle,
  repeatDays: REPEAT_DAYS,
  load: loadData,
  build: buildPuzzle,
});

// ---------------------------------------------------------------------------------------------------------
// Partidas (`game-runs.ts`, compartido con ¿Más o menos? y Adivina el jugador)

const runs = createRunStore<CarreraRun>(GAME, {
  isState: isCarreraRun,
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

export type MoveResult = StoredView | { error: MoveError | "not-found" | "conflict" };

/**
 * Jugada `index` (decir un jugador o ver los equipos). Sin partida (`run` null), la empieza con la foto de `day`, que
 * tiene que ser la de hoy: el jugador cambia a las 7:00 y quien tenía la página abierta desde antes ve la carrera de ayer.
 */
export async function move(run: string | null, day: string, index: number, value: Move): Promise<MoveResult> {
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
  const result = await runs.play(id, (s) => playRun(s, puzzle, index, value));
  if ("error" in result) return result;
  return { run: id, view: signed(id, result.outcome), puzzle };
}
