// "Qué ver" (Tarea 6.11): los mejores partidos de la semana, del mes y de la temporada por nota.
// Puro y sin dependencias (lo usan los tests con `node --test`).
//
// Regla de spoilers: aquí solo entran emparejamiento, fecha y nota (Nivel 2). Nunca marcadores,
// ni en Nivel 3. El orden depende de la nota, así que la lista entera es Nivel 2: en Nivel 1 no se
// enseña ni un partido (el puesto de cada uno ya delataría su nota).

/** Lo único que necesita la pantalla de cada partido: lo mismo que `GameLevel2` sin el nivel. */
export type ScoredGame = {
  id: string;
  game_datetime_utc: string;
  home_team_id: number;
  away_team_id: number;
  excitement_score: number | null;
};

export type WatchPeriod = "semana" | "mes" | "temporada";

/** `days`: jornadas que cuenta el periodo hasta hoy incluido (null = toda la temporada). */
export const WATCH_PERIODS: { id: WatchPeriod; label: string; hint: string; days: number | null }[] = [
  { id: "semana", label: "Semana", hint: "Últimos 7 días", days: 7 },
  { id: "mes", label: "Mes", hint: "Últimos 30 días", days: 30 },
  { id: "temporada", label: "Temporada", hint: "Toda la temporada", days: null },
];

export const DEFAULT_WATCH_PERIOD: WatchPeriod = "semana";

export function isWatchPeriod(value: unknown): value is WatchPeriod {
  return WATCH_PERIODS.some((period) => period.id === value);
}

/** Filtro de equipo: todos, los de tus favoritos o uno concreto (id de la NBA). */
export type WatchTeamFilter = "todos" | "favoritos" | number;

/** Lee `?equipo=` de la URL. Cualquier valor raro vuelve a "todos". */
export function parseTeamFilter(value: unknown, teamIds: ReadonlySet<number>): WatchTeamFilter {
  if (value === "favoritos") return "favoritos";
  const id = Number(value);
  return typeof value === "string" && teamIds.has(id) ? id : "todos";
}

/** Parámetros de la URL para compartir la vista (sin nada de los valores por defecto). */
export function watchSearch(period: WatchPeriod, team: WatchTeamFilter): string {
  const params = new URLSearchParams();
  if (period !== DEFAULT_WATCH_PERIOD) params.set("periodo", period);
  if (team !== "todos") params.set("equipo", String(team));
  const query = params.toString();
  return query ? `?${query}` : "";
}

// Los días "YYYY-MM-DD" se anclan a mediodía UTC: restar días nunca salta de fecha.
function addDays(day: string, amount: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

/** Primera jornada del periodo (incluida) o null si es la temporada entera. */
export function periodStart(period: WatchPeriod, today: string): string | null {
  const days = WATCH_PERIODS.find((p) => p.id === period)?.days ?? null;
  return days === null ? null : addDays(today, -(days - 1));
}

const hasScore = (game: ScoredGame): boolean => typeof game.excitement_score === "number" && Number.isFinite(game.excitement_score);

type RankOptions = {
  period: WatchPeriod;
  /** Jornada NBA de hoy ("YYYY-MM-DD"). */
  today: string;
  /** Jornada NBA de un partido (`gameDayOf`), inyectada para que este archivo no dependa de nada. */
  dayOf: (utc: string) => string;
  /** Equipos que se quieren ver; null = todos. Un conjunto vacío no deja ningún partido. */
  teams?: ReadonlySet<number> | ReadonlyMap<number, unknown> | null;
};

/**
 * Partidos con nota del periodo, de mejor a peor nota. A igual nota, el más reciente primero (y el id,
 * para que el orden sea siempre el mismo). Sin nota (aún sin calcular) no entran.
 */
export function rankGames<T extends ScoredGame>(games: readonly T[], { period, today, dayOf, teams = null }: RankOptions): T[] {
  const from = periodStart(period, today);
  return games
    .filter((game) => {
      if (!hasScore(game)) return false;
      const day = dayOf(game.game_datetime_utc);
      if (day > today || (from !== null && day < from)) return false;
      return teams === null || teams.has(game.home_team_id) || teams.has(game.away_team_id);
    })
    .sort(
      (a, b) =>
        b.excitement_score! - a.excitement_score! ||
        b.game_datetime_utc.localeCompare(a.game_datetime_utc) ||
        a.id.localeCompare(b.id)
    );
}

/** "El partidazo de la semana": el de mejor nota de los últimos 7 días, de cualquier equipo. */
export function gameOfTheWeek<T extends ScoredGame>(games: readonly T[], today: string, dayOf: (utc: string) => string): T | null {
  return rankGames(games, { period: "semana", today, dayOf })[0] ?? null;
}
