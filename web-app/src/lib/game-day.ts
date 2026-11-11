// Jornadas NBA. Una jornada es la fecha en Nueva York (una noche NBA completa), aunque en España
// sus partidos acaben de madrugada del día siguiente. Las horas siempre se muestran en hora de España.
// Sin "use client": se usa tanto en servidor como en cliente.
import type { LiveGame } from "@/lib/live";
import type { Game, GameLevel3 } from "@/lib/spoilers";

export const DISPLAY_TZ = "Europe/Madrid";
const NBA_TZ = "America/New_York";

/** Solo emparejamiento y fecha: lo único que ve el Nivel 1. */
export type GameMatchup = {
  id: string;
  game_datetime_utc: string;
  home_team_id: number;
  away_team_id: number;
};

/** Calendario compacto de `/api/schedule`: [id, fecha UTC, local, visitante]. */
export type ScheduleTuple = [id: string, utc: string, home: number, away: number];

/** Datos mínimos de cada equipo para pintar la jornada. */
export type TeamLite = { id: number; name: string; abbreviation: string; accent: string };

const isoDay = (timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
const nbaDayFormat = isoDay(NBA_TZ);
const madridDayFormat = isoDay(DISPLAY_TZ);

// Los días "YYYY-MM-DD" se anclan a mediodía UTC: sumar días y formatearlos nunca salta de fecha.
const utcNoon = (day: string) => new Date(`${day}T12:00:00Z`);
const weekdayShort = new Intl.DateTimeFormat("es-ES", { weekday: "short", timeZone: "UTC" });
const weekdayLong = new Intl.DateTimeFormat("es-ES", { weekday: "long", timeZone: "UTC" });
const dayMonth = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", timeZone: "UTC" });
const dayMonthShort = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });
const timeFormat = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: DISPLAY_TZ });

/** Jornada a la que pertenece un partido. */
export function gameDayOf(utc: string | Date): string {
  return nbaDayFormat.format(new Date(utc));
}

/** Jornada actual: coincide con la fecha de España de 06:00 a 24:00; de madrugada, la que se está jugando. */
export function todayGameDay(): string {
  return gameDayOf(new Date());
}

/** ID oficial de partido de la NBA: "0022600170". */
export function isGameId(value: unknown): value is string {
  return typeof value === "string" && /^\d{10}$/.test(value);
}

/** Temporada a la que pertenece un partido ("2026-27"): empieza en octubre, se cuenta desde agosto. */
export function seasonOf(utc: string): string {
  const [year, month] = gameDayOf(utc).split("-").map(Number);
  const start = month >= 8 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export function previousSeason(season: string): string {
  const start = Number(season.slice(0, 4)) - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export function isGameDay(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && utcNoon(value).toISOString().startsWith(value);
}

export function addDays(day: string, amount: number): string {
  const date = utcNoon(day);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

/** Rango UTC holgado que contiene todos los partidos de la jornada (filtrar después con `gameDayOf`). */
export function gameDayUtcRange(day: string): { from: string; to: string } {
  return { from: `${day}T00:00:00Z`, to: `${addDays(day, 1)}T12:00:00Z` };
}

export function relativeDayLabel(day: string, today: string): "Hoy" | "Ayer" | "Mañana" | null {
  if (day === today) return "Hoy";
  if (day === addDays(today, -1)) return "Ayer";
  if (day === addDays(today, 1)) return "Mañana";
  return null;
}

export function formatWeekday(day: string, style: "short" | "long" = "short"): string {
  return (style === "short" ? weekdayShort : weekdayLong).format(utcNoon(day)).replace(".", "");
}

export function formatDayMonth(day: string, style: "short" | "long" = "long"): string {
  return (style === "short" ? dayMonthShort : dayMonth).format(utcNoon(day)).replace(".", "");
}

export function dayOfMonth(day: string): number {
  return utcNoon(day).getUTCDate();
}

/** Hora de inicio en España: "01:30". */
export function formatGameTime(utc: string): string {
  return timeFormat.format(new Date(utc));
}

/** "jue 5" si en España el partido cae en otro día que la jornada (madrugada); si no, null. */
export function madridDayIfDifferent(utc: string, day: string): string | null {
  const madrid = madridDayFormat.format(new Date(utc));
  return madrid === day ? null : `${formatWeekday(madrid)} ${dayOfMonth(madrid)}`;
}

export function toScheduleTuple(game: GameMatchup): ScheduleTuple {
  return [game.id, game.game_datetime_utc, game.home_team_id, game.away_team_id];
}

/** Agrupa el calendario por jornada, cada una ordenada por hora (nunca por nada que dependa del resultado). */
export function groupByGameDay(schedule: ScheduleTuple[]): Map<string, GameMatchup[]> {
  const byDay = new Map<string, GameMatchup[]>();
  for (const [id, utc, home, away] of schedule) {
    const day = gameDayOf(utc);
    const list = byDay.get(day) ?? [];
    list.push({ id, game_datetime_utc: utc, home_team_id: home, away_team_id: away });
    byDay.set(day, list);
  }
  for (const list of byDay.values()) {
    list.sort((a, b) => a.game_datetime_utc.localeCompare(b.game_datetime_utc) || a.id.localeCompare(b.id));
  }
  return byDay;
}

// --- Nivel 3: resultado listo para pintar (Supabase + marcador en directo) ---

export type ResultSide = { score: number | null; periods: number[] };

export type GameResult = {
  status: Game["status"];
  periodText: string | null;
  home: ResultSide;
  away: ResultSide;
  /** En Nivel 3 la nota se ve junto al resultado (el directo no la trae: siempre de Supabase). */
  excitementScore: number | null;
};

const STATUS_RANK: Record<Game["status"], number> = { Scheduled: 0, Live: 1, Final: 2 };

function storedPeriods(quarters: Game["quarters_score"], side: "home" | "away"): number[] {
  const value = quarters?.[side];
  return Array.isArray(value) ? value.filter((n): n is number => typeof n === "number") : [];
}

/** Resultado de Supabase, sustituido por el directo de `/api/live` si este va igual o más avanzado. */
export function toGameResult(game: GameLevel3 | undefined, live: LiveGame | undefined): GameResult | undefined {
  if (live && (!game || STATUS_RANK[live.status] >= STATUS_RANK[game.status])) {
    return {
      status: live.status,
      periodText: live.periodText,
      home: { score: live.home.score, periods: live.home.periods.map((p) => p.score) },
      away: { score: live.away.score, periods: live.away.periods.map((p) => p.score) },
      excitementScore: game?.excitement_score ?? null,
    };
  }
  if (!game) return undefined;
  return {
    status: game.status,
    periodText: game.live_period_text,
    home: { score: game.home_score, periods: storedPeriods(game.quarters_score, "home") },
    away: { score: game.away_score, periods: storedPeriods(game.quarters_score, "away") },
    excitementScore: game.excitement_score,
  };
}

/** Etiqueta corta de cada periodo: 1, 2, 3, 4, PR1, PR2… */
export function periodLabel(index: number): string {
  return index < 4 ? String(index + 1) : `PR${index - 3}`;
}
