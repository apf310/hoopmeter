// Adivina el jugador (Tarea 8.3): jugador del día, pistas e intentos. Puro y sin dependencias (tests con `node --test`).
//
// Igual para todos: un jugador al día (cambia a las 7:00 de España) entre los más conocidos, sin repetir en dos meses.
// Se ve su radar (seis atributos de 40 a 99, sin nombre ni colores de equipo) y hay 6 intentos: cada jugador que se
// dice destapa cinco pistas comparándolo con el del día (conferencia, posición, edad, altura y media), con 🟩 si
// coincide, 🟨 si se acerca y flecha hacia dónde está. La solución, el número de intento y los puntos viven en el
// servidor (`adivina-store.ts` y `/api/juegos/adivina`); como la solución es la misma para todos y se podría copiar,
// da pocos puntos (20 como mucho) y nunca premio de campeón (Tarea 8.6).
//
// Todo sale de la "foto del día" que congela el servidor al empezar el día (radar, media, edad y equipo de ese
// momento): el job diario de las 11:30 no cambia las pistas a media mañana. Nada depende del último partido: igual en
// los tres niveles de spoilers.
import type { Mark } from "./games.ts";
import { search } from "./search.ts";
import type { RadarCategory } from "./supabase.ts";

export const RADAR_KEYS: readonly RadarCategory[] = ["scoring", "shooting", "playmaking", "defense", "rebounding", "efficiency"];
export type Radar = Record<RadarCategory, number>;

export type Conference = "East" | "West";

/** Lo que se sabe de cada jugador que se puede decir (en activo y con equipo), tal como estaba al empezar el día. */
export type Suspect = {
  id: number;
  name: string;
  teamId: number;
  /** Abreviatura del equipo. */
  team: string;
  conf: Conference | null;
  /** "G", "G-F", "F-C"… (siempre en ese orden: exterior, alero, pívot). */
  pos: string | null;
  age: number | null;
  /** Altura en centímetros. */
  cm: number | null;
  /** Media de 40 a 99 de esta temporada; null si aún no ha jugado. */
  media: number | null;
};

/** Lo que viaja al buscador: sin pistas (así no se puede filtrar la lista hasta dar con él). */
export type PublicSuspect = Pick<Suspect, "id" | "name" | "teamId" | "team">;

// ---------------------------------------------------------------------------------------------------------
// Datos de cada jugador

/** "2.06 m" → 206; "6-11" (pies y pulgadas) → 211. */
export function parseHeight(text: string | null | undefined): number | null {
  const value = (text ?? "").trim();
  const feet = /^(\d)-(\d{1,2})$/.exec(value);
  if (feet) return Math.round((Number(feet[1]) * 12 + Number(feet[2])) * 2.54);
  const meters = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(meters) && meters > 1 && meters < 3 ? Math.round(meters * 100) : null;
}

const POSITION_ORDER = ["G", "F", "C"] as const;

/** "Forward-Center" → "F-C", "C-F" → "F-C", "F-G" → "G-F"; null si no se reconoce. */
export function positionKey(position: string | null | undefined): string | null {
  const groups = new Set((position ?? "").split("-").map((part) => part.trim().charAt(0).toUpperCase()));
  const key = POSITION_ORDER.filter((p) => groups.has(p)).join("-");
  return key || null;
}

const POSITION_NAME: Record<string, string> = { G: "Ext", F: "Ale", C: "Pív" };

/** "G-F" → "Ext/Ale" (exterior, alero, pívot: como el explorador de jugadores). */
export const positionLabel = (key: string | null): string => (key ? key.split("-").map((p) => POSITION_NAME[p] ?? p).join("/") : "–");

/** Años cumplidos el día del reto. */
export function ageOn(birthDate: string | null | undefined, day: string): number | null {
  const birth = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthDate ?? "");
  const today = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!birth || !today) return null;
  const [, by, bm, bd] = birth.map(Number);
  const [, ty, tm, td] = today.map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

// ---------------------------------------------------------------------------------------------------------
// Foto del día

/** Lo que hace falta de cada jugador para la foto del día (`players` con su radar). */
export type SuspectRow = {
  id: number;
  name: string;
  position: string | null;
  height: string | null;
  birthDate: string | null;
  teamId: number | null;
  /** Salario de esta temporada (para saber quién es una figura); null sin contrato o sin cifra. */
  salary: number | null;
  radar: {
    season?: unknown;
    overall?: unknown;
    qualified?: unknown;
    games_played?: unknown;
    minutes?: unknown;
  } & Partial<Record<RadarCategory, unknown>>;
};

export type TeamInfo = { abbr: string; conf: Conference | null };

export type DayPuzzle = {
  v: 1;
  day: string;
  season: string;
  /** El jugador del día: nunca sale del servidor hasta acabar la partida. */
  target: number;
  radar: Radar;
  suspects: Suspect[];
};

/** Lo que ve el cliente antes de jugar: el radar y a quién se puede decir. */
export type PublicPuzzle = { day: string; season: string; radar: Radar; suspects: PublicSuspect[] };

/**
 * Quién puede ser el del día: los que conoce todo el mundo. Titulares (rotación y 24+ minutos) que sean figura por su
 * media esta temporada (80+: Wembanyama o Flagg con contrato de novato) o por su contrato (25 M$+: las estrellas y los
 * titulares de siempre aunque hoy rindan menos). Con 2026-27, unos 70; la media sola metía a suplentes de buen año.
 */
export const TARGET_MIN_MINUTES = 24;
export const STAR_MEDIA = 80;
export const STAR_SALARY = 25_000_000;
/** Tope por si un año hubiera muchos más (los de más media). */
export const TARGET_POOL = 100;
/** Partidos para entrar (menos al empezar la temporada: una cuarta parte de los del que más lleva). */
export const TARGET_MIN_GAMES = 5;
/** Días sin repetir jugador. */
export const REPEAT_DAYS = 60;

const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

/** La temporada de los radares: la más reciente que haya. */
export function radarSeason(rows: readonly SuspectRow[]): string | null {
  let season: string | null = null;
  for (const row of rows) {
    const s = row.radar?.season;
    if (typeof s === "string" && (season === null || s > season)) season = s;
  }
  return season;
}

const hasPlayed = (row: SuspectRow, season: string) => row.radar?.season === season && (num(row.radar.games_played) ?? 0) > 0;

/** Todos los que se pueden decir (en activo con equipo), por orden alfabético. */
export function buildSuspects(rows: readonly SuspectRow[], teams: ReadonlyMap<number, TeamInfo>, day: string, season: string): Suspect[] {
  return rows
    .flatMap((row): Suspect[] => {
      const team = row.teamId === null ? undefined : teams.get(row.teamId);
      if (!team) return [];
      const overall = hasPlayed(row, season) ? num(row.radar.overall) : null;
      return [
        {
          id: row.id,
          name: row.name,
          teamId: row.teamId!,
          team: team.abbr,
          conf: team.conf,
          pos: positionKey(row.position),
          age: ageOn(row.birthDate, day),
          cm: parseHeight(row.height),
          media: overall === null ? null : Math.round(overall),
        },
      ];
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es") || a.id - b.id);
}

/** Candidatos a jugador del día, de más a menos media: titulares con radar de esta temporada que sean figura. */
export function targetCandidates(rows: readonly SuspectRow[], season: string): SuspectRow[] {
  const games = (row: SuspectRow) => num(row.radar?.games_played) ?? 0;
  const maxGames = rows.reduce((max, row) => Math.max(max, row.radar?.season === season ? games(row) : 0), 0);
  const minGames = Math.min(TARGET_MIN_GAMES, Math.max(1, Math.ceil(maxGames / 4)));
  return rows
    .filter((row) => {
      const gp = games(row);
      const minutes = num(row.radar?.minutes);
      return (
        row.teamId !== null &&
        hasPlayed(row, season) &&
        row.radar.qualified === true &&
        gp >= minGames &&
        minutes !== null &&
        minutes / gp >= TARGET_MIN_MINUTES &&
        num(row.radar.overall) !== null &&
        (num(row.radar.overall)! >= STAR_MEDIA || (row.salary ?? 0) >= STAR_SALARY) &&
        RADAR_KEYS.every((k) => num(row.radar[k]) !== null)
      );
    })
    .sort((a, b) => num(b.radar.overall)! - num(a.radar.overall)! || a.id - b.id)
    .slice(0, TARGET_POOL);
}

export type Rng = () => number;

/** Generador con semilla (mulberry32): sin la clave de la base de datos, la semilla es el día y todas las instancias coinciden. */
export function seededRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Semilla a partir de un texto ("2026-11-27"). */
export function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Foto del día: el jugador (al azar entre los candidatos que no han salido en `REPEAT_DAYS` días; si ya han salido
 * todos, entre todos), su radar y las pistas de todos los que se pueden decir. null si no hay candidatos.
 */
export function buildPuzzle(rows: readonly SuspectRow[], teams: ReadonlyMap<number, TeamInfo>, day: string, recent: ReadonlySet<number>, rng: Rng): DayPuzzle | null {
  const season = radarSeason(rows);
  if (!season) return null;
  const candidates = targetCandidates(rows, season).filter((row) => teams.has(row.teamId!));
  const fresh = candidates.filter((row) => !recent.has(row.id));
  const pool = fresh.length > 0 ? fresh : candidates;
  if (pool.length === 0) return null;
  const target = pool[Math.floor(rng() * pool.length)];
  const radar = Object.fromEntries(RADAR_KEYS.map((k) => [k, Math.round(num(target.radar[k])!)])) as Radar;
  return { v: 1, day, season, target: target.id, radar, suspects: buildSuspects(rows, teams, day, season) };
}

export const publicPuzzle = (puzzle: DayPuzzle): PublicPuzzle => ({
  day: puzzle.day,
  season: puzzle.season,
  radar: puzzle.radar,
  suspects: puzzle.suspects.map(({ id, name, teamId, team }) => ({ id, name, teamId, team })),
});

const isSuspect = (s: unknown): s is Suspect => {
  const x = s as Suspect | null;
  return !!x && Number.isInteger(x.id) && typeof x.name === "string" && Number.isInteger(x.teamId) && typeof x.team === "string";
};

/** Lo que vuelve de la base de datos, sin fiarse de la forma. */
export function isDayPuzzle(value: unknown): value is DayPuzzle {
  const p = value as DayPuzzle | null;
  return (
    !!p &&
    p.v === 1 &&
    typeof p.day === "string" &&
    typeof p.season === "string" &&
    Number.isInteger(p.target) &&
    !!p.radar &&
    RADAR_KEYS.every((k) => typeof p.radar[k] === "number") &&
    Array.isArray(p.suspects) &&
    p.suspects.every(isSuspect) &&
    p.suspects.some((s) => s.id === p.target)
  );
}

// ---------------------------------------------------------------------------------------------------------
// Pistas

export type ClueKey = "conf" | "pos" | "age" | "height" | "media";
export const CLUE_ORDER: readonly ClueKey[] = ["conf", "pos", "age", "height", "media"];

export const CLUE_LABEL: Record<ClueKey, string> = { conf: "Conf.", pos: "Pos.", age: "Edad", height: "Altura", media: "Media" };

/** Hasta dónde una pista numérica está "cerca" (🟨): 2 años, 5 cm (dos pulgadas) y 3 de media. */
export const NEAR: Readonly<Record<"age" | "height" | "media", number>> = { age: 2, height: 5, media: 3 };

/** Hacia dónde está el del día: "up" = es mayor, más alto o tiene más media que el que has dicho. */
export type Direction = "up" | "down";
export type Clue = { mark: Mark; dir: Direction | null };

function compareNumber(guess: number | null, target: number | null, near: number): Clue {
  if (guess === null || target === null) return { mark: "x", dir: null };
  if (guess === target) return { mark: "o", dir: null };
  return { mark: Math.abs(guess - target) <= near ? "c" : "x", dir: target > guess ? "up" : "down" };
}

/** Exterior/alero/pívot: 🟩 las mismas, 🟨 alguna en común ("G-F" frente a "F"). */
function comparePosition(guess: string | null, target: string | null): Clue {
  if (!guess || !target) return { mark: "x", dir: null };
  if (guess === target) return { mark: "o", dir: null };
  const mine = new Set(guess.split("-"));
  return { mark: target.split("-").some((p) => mine.has(p)) ? "c" : "x", dir: null };
}

export function compareSuspects(guess: Suspect, target: Suspect): Record<ClueKey, Clue> {
  return {
    conf: { mark: guess.conf !== null && guess.conf === target.conf ? "o" : "x", dir: null },
    pos: comparePosition(guess.pos, target.pos),
    age: compareNumber(guess.age, target.age, NEAR.age),
    height: compareNumber(guess.cm, target.cm, NEAR.height),
    media: compareNumber(guess.media, target.media, NEAR.media),
  };
}

const CONFERENCE_NAME: Record<Conference, string> = { East: "Este", West: "Oeste" };
const METERS = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Cada pista como se pinta en su casilla: "Oeste", "Ext/Ale", "27", "2,06", "84". */
export function clueText(key: ClueKey, s: Pick<Suspect, "conf" | "pos" | "age" | "cm" | "media">): string {
  switch (key) {
    case "conf":
      return s.conf ? CONFERENCE_NAME[s.conf] : "–";
    case "pos":
      return positionLabel(s.pos);
    case "age":
      return s.age === null ? "–" : String(s.age);
    case "height":
      return s.cm === null ? "–" : METERS.format(s.cm / 100);
    case "media":
      return s.media === null ? "–" : String(s.media);
  }
}

// ---------------------------------------------------------------------------------------------------------
// Partida

export const MAX_GUESSES = 6;
/** Puntos según el intento en que se acierta (20 como mucho: Tarea 8.6). Sin acertar, 0, pero cuenta para la racha. */
export const POINTS_BY_GUESS: readonly number[] = [20, 17, 14, 11, 8, 5];

export const pointsFor = (attempts: number, solved: boolean): number => (solved ? (POINTS_BY_GUESS[attempts - 1] ?? 0) : 0);

/**
 * La partida en el servidor (nunca sale tal cual): el jugador del día y los ids que se han dicho. Las pistas salen
 * siempre de la foto del día.
 */
export type AdivinaRun = { v: 1; day: string; target: number; answers: number[] };

export const newRun = (puzzle: Pick<DayPuzzle, "day" | "target">): AdivinaRun => ({ v: 1, day: puzzle.day, target: puzzle.target, answers: [] });

export function isAdivinaRun(value: unknown): value is AdivinaRun {
  const run = value as AdivinaRun | null;
  return (
    !!run &&
    run.v === 1 &&
    typeof run.day === "string" &&
    Number.isInteger(run.target) &&
    Array.isArray(run.answers) &&
    run.answers.length <= MAX_GUESSES &&
    run.answers.every((id) => Number.isInteger(id))
  );
}

/** Cómo va: si ha acertado, en qué intento, si ha acabado y sus puntos. */
export function runScore(run: AdivinaRun): { solved: boolean; attempts: number; finished: boolean; points: number } {
  const hit = run.answers.indexOf(run.target);
  const solved = hit >= 0;
  const attempts = solved ? hit + 1 : run.answers.length;
  return { solved, attempts, finished: solved || attempts >= MAX_GUESSES, points: pointsFor(attempts, solved) };
}

/** Un intento ya contestado: el jugador que se dijo, sus datos y las cinco pistas. */
export type GuessRow = PublicSuspect & Pick<Suspect, "conf" | "pos" | "age" | "cm" | "media"> & { clues: Record<ClueKey, Clue>; hit: boolean };

export type RunSummary = { points: number; attempts: number; solved: boolean; rows: string[]; /** Lo añade la API (Tarea 8.5, `game-receipt.ts`): para pasar el resultado a la cuenta. */ receipt?: string };

export type RunView = {
  day: string;
  guesses: GuessRow[];
  solved: boolean;
  finished: boolean;
  /** El jugador del día, solo al acabar. */
  answer: Suspect | null;
  summary: RunSummary | null;
};

/** Marcas para compartir (🟩🟨🟥): una fila por intento con sus cinco pistas. */
export const rowMarks = (row: Pick<GuessRow, "clues">): string => CLUE_ORDER.map((k) => row.clues[k].mark).join("");

export function viewRun(run: AdivinaRun, puzzle: DayPuzzle): RunView {
  const byId = new Map(puzzle.suspects.map((s) => [s.id, s]));
  const target = byId.get(run.target) ?? byId.get(puzzle.target)!;
  const guesses = run.answers.flatMap((id): GuessRow[] => {
    const s = byId.get(id);
    if (!s) return [];
    const hit = id === target.id;
    const clues = compareSuspects(s, target);
    // El acierto, todo en verde (aunque otro jugador pudiera coincidir en las cinco pistas)
    if (hit) for (const k of CLUE_ORDER) clues[k] = { mark: "o", dir: null };
    return [{ id: s.id, name: s.name, teamId: s.teamId, team: s.team, conf: s.conf, pos: s.pos, age: s.age, cm: s.cm, media: s.media, clues, hit }];
  });
  const { solved, attempts, finished, points } = runScore(run);
  return {
    day: run.day,
    guesses,
    solved,
    finished,
    answer: finished ? target : null,
    summary: finished ? { points, attempts, solved, rows: guesses.map(rowMarks) } : null,
  };
}

export type GuessError = "out-of-order" | "unknown-player" | "repeated";

/**
 * Intento `index` diciendo `playerId`. Lo decide el servidor: un intento ya contestado devuelve lo que contó
 * (`changed` false), y ni un jugador que no está en la lista ni uno ya dicho gastan intento.
 */
export function guessRun(
  run: AdivinaRun,
  puzzle: DayPuzzle,
  index: number,
  playerId: number
): { state: AdivinaRun; outcome: RunView; changed: boolean } | { error: GuessError } {
  if (!Number.isInteger(index) || index < 0) return { error: "out-of-order" };
  if (index < run.answers.length) return { state: run, outcome: viewRun(run, puzzle), changed: false };
  if (index !== run.answers.length || runScore(run).finished) return { error: "out-of-order" };
  if (!puzzle.suspects.some((s) => s.id === playerId)) return { error: "unknown-player" };
  if (run.answers.includes(playerId)) return { error: "repeated" };
  const state: AdivinaRun = { ...run, answers: [...run.answers, playerId] };
  return { state, outcome: viewRun(state, puzzle), changed: true };
}

// ---------------------------------------------------------------------------------------------------------
// Buscador

/**
 * Los que encajan con lo escrito (como el buscador de la app: apellido, iniciales, sin tildes), sin los ya dichos.
 * También para Carrera oculta (Tarea 8.4), donde un retirado no tiene equipo.
 */
export function findSuspects<T extends { id: number; name: string; teamId: number | null }>(suspects: readonly T[], query: string, exclude: ReadonlySet<number>, limit = 6): T[] {
  const left = suspects.filter((s) => !exclude.has(s.id));
  const byId = new Map(left.map((s) => [s.id, s]));
  const index = { teams: [], players: left.map((s) => ({ id: s.id, full_name: s.name, position: null, team_id: s.teamId, is_active: true })) };
  return search(index, query, { teams: 0, players: limit }).players.map((p) => byId.get(p.id)!);
}
