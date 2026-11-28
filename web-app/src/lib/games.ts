// Juegos (Tarea 8.1): día del reto, resultados, divisiones, racha con escudo y resultado en emojis.
// Puro y sin dependencias de React (lo usan los tests con `node --test`); el almacén está en `games-store.ts`.
//
// Reglas de la Fase 8: la solución, los puntos y el número de intento los decide el servidor de cada reto
// (Tareas 8.2-8.4). Aquí solo se guarda en el dispositivo lo que el servidor dio por bueno, y al llegar las
// cuentas (8.5) no se fía de estos puntos. El nivel (ELO, que sube y baja) sale de estos resultados: `elo.ts`.
// Nada de esto depende de resultados de partidos: los tres retos son
// de salarios, radares y carreras, así que se ven igual en los tres niveles de spoilers.
import { addDays, formatDayMonth, formatWeekday } from "./game-day.ts";

export const GAMES_STORAGE_KEY = "hoopmeter:juegos";

/** Los retos cambian a las 7:00 de España (también los días del cambio de hora). */
export const CHALLENGE_TZ = "Europe/Madrid";
export const CHALLENGE_HOUR = 7;

export type ChallengeId = "mas-o-menos" | "adivina" | "carrera";

export type Challenge = {
  id: ChallengeId;
  name: string;
  tagline: string;
  /** Tope de puntos al día (Tarea 8.6: 60 + 20 + 20; los dos que se pueden copiar pesan poco). */
  maxPoints: number;
  /** Tarea en la que llega: hasta entonces sale como "Pronto". */
  task: string;
  ready: boolean;
  href: string;
};

export const CHALLENGES: readonly Challenge[] = [
  { id: "mas-o-menos", name: "¿Más o menos?", tagline: "Salarios, medias y promedios contrarreloj. Preguntas solo para ti", maxPoints: 60, task: "8.2", ready: true, href: "/juegos/mas-o-menos" },
  { id: "adivina", name: "Adivina el jugador", tagline: "Por la huella de su radar, en 6 intentos", maxPoints: 20, task: "8.3", ready: true, href: "/juegos/adivina" },
  { id: "carrera", name: "Carrera oculta", tagline: "Por sus temporadas, con equipos o sin ellos", maxPoints: 20, task: "8.4", ready: true, href: "/juegos/carrera-oculta" },
];

export const DAILY_MAX_POINTS = CHALLENGES.reduce((sum, c) => sum + c.maxPoints, 0);

const challengeById = new Map(CHALLENGES.map((c) => [c.id, c]));

// ---------------------------------------------------------------------------------------------------------
// Día del reto

const madridClock = new Intl.DateTimeFormat("en-CA", {
  timeZone: CHALLENGE_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function madridParts(at: number) {
  const parts = Object.fromEntries(madridClock.formatToParts(at).map((p) => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second) };
}

/** Diferencia en ms entre la hora de Madrid y la UTC en ese instante (1 h en invierno, 2 h en verano). */
function madridOffset(at: number): number {
  const { day, hour, minute, second } = madridParts(at);
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d, hour, minute, second) - Math.floor(at / 1000) * 1000;
}

/** Día del reto ("2026-11-26"): la fecha de España, que no cambia hasta las 7:00. */
export function challengeDay(now: number): string {
  const { day, hour } = madridParts(now);
  return hour < CHALLENGE_HOUR ? addDays(day, -1) : day;
}

/** Instante en que empiezan los retos de un día (las 7:00 de España de esa fecha). */
export function challengeStart(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d, CHALLENGE_HOUR);
  // A las 7:00 nunca hay cambio de hora (es a las 2:00 o a las 3:00): basta con corregir una vez
  const first = wall - madridOffset(wall);
  return wall - madridOffset(first);
}

/** Cuándo llegan los retos siguientes. */
export function nextChallengeAt(now: number): number {
  return challengeStart(addDays(challengeDay(now), 1));
}

/** "3 h 12 min", "12 min", "menos de 1 min". */
export function formatCountdown(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return "menos de 1 min";
  const h = Math.floor(minutes / 60);
  const min = minutes % 60;
  return h === 0 ? `${min} min` : min === 0 ? `${h} h` : `${h} h ${min} min`;
}

/** "Retos del jueves" (o "Retos de hoy" mientras no se sabe la hora del dispositivo). */
export function challengeTitle(day: string | null): string {
  return day ? `Retos del ${formatWeekday(day, "long")}` : "Retos de hoy";
}

const isDay = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

// ---------------------------------------------------------------------------------------------------------
// Divisiones: por ELO (`elo.ts`), que sube y baja; Sexto Hombre y Titular no se pierden una vez alcanzadas.
// Quien juega como la mitad de la gente se queda en Titular (1.000); All-Star, MVP y Hall of Fame piden jugar mejor
// que casi todos día tras día.

export type Division = { id: string; name: string; from: number };

export const DIVISIONS: readonly Division[] = [
  { id: "rookie", name: "Rookie", from: 0 },
  { id: "sexto-hombre", name: "Sexto Hombre", from: 400 },
  { id: "titular", name: "Titular", from: 800 },
  { id: "all-star", name: "All-Star", from: 1_100 },
  { id: "mvp", name: "MVP", from: 1_250 },
  { id: "hall-of-fame", name: "Hall of Fame", from: 1_400 },
];

export type DivisionStanding = {
  division: Division;
  /** 1 = Rookie … 6 = Hall of Fame. */
  rank: number;
  next: Division | null;
  /** ELO que falta para la siguiente (0 en Hall of Fame). */
  toNext: number;
  /** Avance dentro de la división actual, de 0 a 1 (1 en Hall of Fame). */
  progress: number;
};

/** La división de un ELO. */
export function divisionOf(elo: number): DivisionStanding {
  const safe = Math.max(0, Math.floor(elo));
  const index = DIVISIONS.findLastIndex((d) => safe >= d.from);
  const division = DIVISIONS[index];
  const next = DIVISIONS[index + 1] ?? null;
  return {
    division,
    rank: index + 1,
    next,
    toNext: next ? next.from - safe : 0,
    progress: next ? (safe - division.from) / (next.from - division.from) : 1,
  };
}

// ---------------------------------------------------------------------------------------------------------
// Resultados guardados en el dispositivo

/** Cada marca del resultado: acierto, cerca o fallo. Una fila por intento (en ¿Más o menos?, filas de diez preguntas). */
export type Mark = "o" | "c" | "x";

export type ChallengeResult = {
  /** Día del reto, no del calendario: lo que se juega a las 2:00 cuenta para el día anterior. */
  day: string;
  game: ChallengeId;
  /** Los que dio el servidor, nunca calculados en el cliente. */
  points: number;
  /** Para compartir: cada fila, una cadena de marcas ("oocx"). */
  rows: string[];
  /**
   * El par del reto ese día (de 0 a 1: lo que sacó la mitad de la gente), tal como estaba al apuntarlo: con él se
   * calcula el ELO (`elo.ts`). Falta mientras no se ha podido preguntar al servidor.
   */
  par?: number;
  /**
   * El recibo que firmó el servidor del reto (Tarea 8.5, `game-receipt.ts`): con él, el resultado pasa a la cuenta sin
   * fiarse de estos puntos. Se quita al mandarlo a la cuenta. Falta si se jugó sin la clave del servidor (en local).
   */
  receipt?: string;
};

/** La partida de hoy de un reto que se juega con calma (Adivina, Carrera oculta): solo su número, para seguirla al volver. */
export type OpenRun = { day: string; run: string };

export type GamesProgress = {
  results: ChallengeResult[];
  /** Mejor racha del modo infinito de ¿Más o menos? (sin puntos: solo para batirla). */
  endless: number;
  /** La última partida de cada reto (el servidor guarda lo jugado: aquí no hay ni pistas ni solución). */
  runs: Partial<Record<ChallengeId, OpenRun>>;
};

export const EMPTY_PROGRESS: GamesProgress = { results: [], endless: 0, runs: {} };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function sanitizeRuns(value: unknown): GamesProgress["runs"] {
  const runs: GamesProgress["runs"] = {};
  if (!value || typeof value !== "object") return runs;
  for (const [game, open] of Object.entries(value)) {
    const { day, run } = (open ?? {}) as Record<string, unknown>;
    if (challengeById.has(game as ChallengeId) && isDay(day) && typeof run === "string" && UUID.test(run)) runs[game as ChallengeId] = { day, run };
  }
  return runs;
}

/** Tope del récord del modo infinito: más sería un dato roto. */
export const MAX_ENDLESS = 10_000;

const isEndless = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= MAX_ENDLESS;

const MAX_ROWS = 10;
const MAX_MARKS = 30;
const ROW = new RegExp(`^[ocx]{1,${MAX_MARKS}}$`);

/** Una fila de marcas para compartir ("oocx"). */
export const isMarksRow = (row: unknown): row is string => typeof row === "string" && ROW.test(row);

/** Más largo no puede ser un recibo (`game-receipt.ts`). */
export const RECEIPT_MAX_LENGTH = 1_500;
const RECEIPT = /^r1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/** Tiene forma de recibo (si es bueno, solo lo sabe el servidor). */
export const isReceiptToken = (value: unknown): value is string =>
  typeof value === "string" && value.length <= RECEIPT_MAX_LENGTH && RECEIPT.test(value);

function sanitizeResult(value: unknown): ChallengeResult | null {
  if (!value || typeof value !== "object") return null;
  const { day, game, points, rows } = value as Record<string, unknown>;
  const challenge = challengeById.get(game as ChallengeId);
  if (!isDay(day) || !challenge) return null;
  if (typeof points !== "number" || !Number.isInteger(points) || points < 0 || points > challenge.maxPoints) return null;
  const cleanRows = Array.isArray(rows) ? rows.filter(isMarksRow).slice(0, MAX_ROWS) : [];
  const { par, receipt } = value as { par?: unknown; receipt?: unknown };
  return { day, game: challenge.id, points, rows: cleanRows, ...(isPar(par) ? { par } : {}), ...(isReceiptToken(receipt) ? { receipt } : {}) };
}

const isPar = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0 && value < 1;

/** Lo guardado, sin fiarse: fuera lo que no cuadra, un solo resultado por reto y día (el primero) y en orden. */
export function parseProgress(raw: string | null): GamesProgress {
  if (!raw) return EMPTY_PROGRESS;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return EMPTY_PROGRESS;
  }
  const stored = (data && typeof data === "object" ? data : {}) as { results?: unknown; endless?: unknown; runs?: unknown };
  const list = Array.isArray(stored.results) ? stored.results : [];
  return {
    results: normalize(list.map(sanitizeResult).filter((r) => r !== null)),
    endless: isEndless(stored.endless) ? stored.endless : 0,
    runs: sanitizeRuns(stored.runs),
  };
}

function normalize(results: ChallengeResult[]): ChallengeResult[] {
  const seen = new Set<string>();
  const unique = results.filter((r) => {
    const key = `${r.day}|${r.game}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique.sort((a, b) => (a.day === b.day ? 0 : a.day < b.day ? -1 : 1));
}

export function serializeProgress(progress: GamesProgress): string {
  return JSON.stringify({ v: 1, results: progress.results, endless: progress.endless, runs: progress.runs });
}

/** Apunta la partida de hoy de un reto (sustituye a la anterior). Devuelve el mismo objeto si no cambia nada. */
export function addRun(progress: GamesProgress, game: ChallengeId, open: OpenRun): GamesProgress {
  const clean = sanitizeRuns({ [game]: open })[game];
  const prev = progress.runs[game];
  if (!clean || (prev?.day === clean.day && prev.run === clean.run)) return progress;
  return { ...progress, runs: { ...progress.runs, [game]: clean } };
}

/** La partida de ese reto y ese día, si la hay. */
export const openRun = (progress: GamesProgress, game: ChallengeId, day: string): string | null => {
  const open = progress.runs[game];
  return open?.day === day ? open.run : null;
};

/**
 * Apunta un resultado. Un reto se juega una vez al día: si ya estaba, se queda el primero (los puntos solo suman,
 * pero nunca dos veces por lo mismo). Devuelve el mismo objeto si no cambia nada.
 */
export function addResult(progress: GamesProgress, result: ChallengeResult): GamesProgress {
  const clean = sanitizeResult(result);
  if (!clean || progress.results.some((r) => r.day === clean.day && r.game === clean.game)) return progress;
  return { ...progress, results: normalize([...progress.results, clean]) };
}

/** Apunta una racha del modo infinito si bate el récord. Devuelve el mismo objeto si no cambia nada. */
export function addEndless(progress: GamesProgress, streak: number): GamesProgress {
  return isEndless(streak) && streak > progress.endless ? { ...progress, endless: streak } : progress;
}

/**
 * Apunta el par de un resultado que aún no lo tenía (el primero que se supo: no cambia después, así que el ELO
 * de un día no se mueve por la noche). Devuelve el mismo objeto si no cambia nada.
 */
export function addPar(progress: GamesProgress, day: string, game: ChallengeId, par: number): GamesProgress {
  const index = progress.results.findIndex((r) => r.day === day && r.game === game);
  if (index < 0 || progress.results[index].par !== undefined || !isPar(par)) return progress;
  const results = [...progress.results];
  results[index] = { ...results[index], par };
  return { ...progress, results };
}

/** Quita los recibos ya mandados a la cuenta (Tarea 8.5): estén o no en ella, no se vuelven a mandar. */
export function dropReceipts(progress: GamesProgress, sent: ReadonlySet<string>): GamesProgress {
  if (!progress.results.some((r) => r.receipt && sent.has(r.receipt))) return progress;
  return {
    ...progress,
    results: progress.results.map((r) => {
      if (!r.receipt || !sent.has(r.receipt)) return r;
      const rest = { ...r };
      delete rest.receipt;
      return rest;
    }),
  };
}

/** Los resultados de los últimos días que aún no tienen par (el servidor solo lo sabe dos días). */
export const missingPars = (progress: GamesProgress, today: string): ChallengeResult[] =>
  progress.results.filter((r) => r.par === undefined && r.day <= today && r.day >= addDays(today, -1));

export const totalPoints = (progress: GamesProgress): number => progress.results.reduce((sum, r) => sum + r.points, 0);

export const resultsOfDay = (progress: GamesProgress, day: string): ChallengeResult[] => progress.results.filter((r) => r.day === day);

// ---------------------------------------------------------------------------------------------------------
// Racha con escudo

/** Cada 7 días jugados seguidos, un escudo; como mucho 2 guardados. */
export const SHIELD_EVERY = 7;
export const MAX_SHIELDS = 2;

export type Streak = {
  /** Días jugados de la racha actual (los que salvó un escudo no suman). */
  days: number;
  /** Escudos disponibles: cada uno salva un día sin jugar. */
  shields: number;
  best: number;
  playedToday: boolean;
  /** Días de la racha actual que salvó un escudo. */
  saved: string[];
};

/**
 * Racha a partir de los días jugados (cualquier reto cuenta). Un día sin jugar gasta un escudo si lo hay; si no,
 * la racha vuelve a cero. Hoy no rompe nada: hay hasta las 7:00 de mañana. Sale entera de lo jugado, así que no
 * hay contadores que se desajusten. Lo que diga ser de un día futuro (reloj adelantado) no cuenta.
 */
export function streakOf(playedDays: Iterable<string>, today: string): Streak {
  const played = new Set([...playedDays].filter((d) => isDay(d) && d <= today));
  const first = [...played].sort()[0];
  const streak: Streak = { days: 0, shields: 0, best: 0, playedToday: played.has(today), saved: [] };
  if (!first) return streak;

  for (let day = first; day <= today; day = addDays(day, 1)) {
    if (played.has(day)) {
      streak.days += 1;
      if (streak.days % SHIELD_EVERY === 0 && streak.shields < MAX_SHIELDS) streak.shields += 1;
      streak.best = Math.max(streak.best, streak.days);
    } else if (day === today || streak.days === 0) {
      // Hoy aún se puede jugar; y sin racha no hay nada que salvar
    } else if (streak.shields > 0) {
      streak.shields -= 1;
      streak.saved.push(day);
    } else {
      streak.days = 0;
      streak.saved = [];
    }
  }
  return streak;
}

export const playedDays = (progress: GamesProgress): string[] => progress.results.map((r) => r.day);

// ---------------------------------------------------------------------------------------------------------
// Resultado en emojis para compartir

const EMOJI: Record<Mark, string> = { o: "🟩", c: "🟨", x: "🟥" };

export const marksToEmoji = (row: string): string => [...row].map((m) => EMOJI[m as Mark] ?? "").join("");

const points = (n: number) => `${n.toLocaleString("es-ES")} ${n === 1 ? "punto" : "puntos"}`;

/**
 * Texto para compartir el día: cada reto jugado con sus marcas y sus puntos, la racha y el enlace.
 * Sin la solución (nunca nombra al jugador ni las cifras), así que no destripa el reto a quien aún no ha jugado.
 */
export function shareText({ day, results, streakDays, url }: { day: string; results: readonly ChallengeResult[]; streakDays: number; url: string }): string {
  const played = CHALLENGES.flatMap((c) => results.filter((r) => r.game === c.id).slice(0, 1).map((r) => ({ challenge: c, result: r })));
  const lines = [`Hoopmeter · ${challengeTitle(day)} ${formatDayMonth(day, "short")}`];
  for (const { challenge, result } of played) {
    lines.push("", `${challenge.name} · ${result.points}/${challenge.maxPoints}`, ...result.rows.map(marksToEmoji));
  }
  const total = played.reduce((sum, p) => sum + p.result.points, 0);
  lines.push("", [points(total), streakDays > 0 ? `🔥 ${streakDays} ${streakDays === 1 ? "día" : "días"}` : null].filter(Boolean).join(" · "), url);
  return lines.join("\n");
}
