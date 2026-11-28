// ¿Más o menos? (Tarea 8.2): preguntas, dificultad y partida. Puro y sin dependencias (tests con `node --test`).
//
// Reto del día: 30 preguntas contrarreloj, distintas en cada partida pero con la misma dificultad para todos (el mismo
// orden de categorías y la misma banda de diferencia en cada posición). La solución y el reloj viven en el servidor
// (`mas-o-menos-store.ts` y `/api/juegos/mas-o-menos`): el cliente recibe la cifra escondida solo al responder, y
// volver a mandar una respuesta devuelve la que ya contó. Así no hay solución que copiar.
// Modo infinito: sin puntos ni reloj, hasta el primer fallo; ahí sí viajan las cifras y las comprueba el cliente.
//
// Datos: salario de la temporada del GM (solo contratos `confirmed` con cifra exacta), media de 40 a 99 y promedios de
// la temporada, todo del job diario. Nada depende del último partido: es igual en los tres niveles de spoilers.
import { SEASON } from "./trade-rules.ts";

export type Category = "salario" | "media" | "puntos" | "rebotes" | "asistencias";
export type Level = "facil" | "media" | "dificil";
export type Choice = "mas" | "menos";

export const CATEGORY_ORDER: readonly Category[] = ["salario", "media", "puntos", "rebotes", "asistencias"];

type CategoryInfo = {
  /** Qué se compara, en grande en la cabecera de la pregunta ("Salario")... */
  title: string;
  /** ...y debajo, en pequeño ("Temporada 2026-27"). */
  detail: (season: string) => string;
  /** En el repaso de la partida. */
  short: string;
  /** "¿Reaves cobra más o menos que Aldama?", "¿… promedia más o menos puntos que …?". */
  verb: string;
  noun: string;
  /** Cómo se mide la diferencia: proporción (salarios) o resta. */
  gap: "ratio" | "diff";
  /** Diferencia mínima (más cerca sería lanzar una moneda), y desde dónde es "media" y "fácil". */
  bands: readonly [min: number, medium: number, easy: number];
};

/**
 * Bandas medidas con la temporada 2026-27 (241 jugadores de rotación, noviembre): en cada categoría, "difícil" es un
 * par cercano pero claro, "media" la distancia típica entre dos jugadores y "fácil" una figura frente a un suplente.
 */
export const CATEGORIES: Readonly<Record<Category, CategoryInfo>> = {
  salario: { title: "Salario", detail: () => `Temporada ${SEASON}`, short: "Salario", verb: "cobra", noun: "", gap: "ratio", bands: [1.25, 1.7, 3] },
  media: { title: "Media Hoopmeter", detail: () => "De 40 a 99", short: "Media", verb: "tiene", noun: "media", gap: "diff", bands: [3, 8, 14] },
  puntos: { title: "Puntos", detail: (s) => `Por partido · ${s}`, short: "Puntos", verb: "promedia", noun: "puntos", gap: "diff", bands: [2, 5, 9] },
  rebotes: { title: "Rebotes", detail: (s) => `Por partido · ${s}`, short: "Rebotes", verb: "promedia", noun: "rebotes", gap: "diff", bands: [1, 2, 4] },
  asistencias: { title: "Asistencias", detail: (s) => `Por partido · ${s}`, short: "Asistencias", verb: "promedia", noun: "asistencias", gap: "diff", bands: [1, 2, 4] },
};

/** Apellido para la pregunta ("Michael Porter Jr." → "Porter Jr."; los paneles llevan el nombre entero). */
export function surname(name: string): string {
  const [, ...rest] = name.trim().split(/\s+/);
  return rest.length > 0 ? rest.join(" ") : name.trim();
}

/** "¿Reaves cobra más o menos que Aldama?" (con el nombre entero si se apellidan igual). */
export function questionText(category: Category, a: { name: string }, b: { name: string }): string {
  const [nameA, nameB] = surname(a.name) === surname(b.name) ? [a.name, b.name] : [surname(a.name), surname(b.name)];
  const { verb, noun } = CATEGORIES[category];
  return `¿${nameB} ${verb} más o menos${noun ? ` ${noun}` : ""} que ${nameA}?`;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Distancia entre dos cifras de una categoría (salarios: cuántas veces cobra uno lo del otro). */
export function gapOf(category: Category, a: number, b: number): number {
  if (CATEGORIES[category].gap === "ratio") {
    const [low, high] = a < b ? [a, b] : [b, a];
    return low > 0 ? Math.round((high / low) * 100) / 100 : Infinity;
  }
  return round1(Math.abs(a - b));
}

/** Dificultad de un par; null si están tan cerca que no sería justo preguntarlo. */
export function levelOf(category: Category, a: number, b: number): Level | null {
  const [min, medium, easy] = CATEGORIES[category].bands;
  const gap = gapOf(category, a, b);
  if (gap < min) return null;
  return gap >= easy ? "facil" : gap >= medium ? "media" : "dificil";
}

const MILLION = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const DECIMAL = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** "18,4 M$", "84", "24,6". */
export function formatValue(category: Category, value: number): string {
  if (category === "salario") return `${MILLION.format(value / 1e6)} M$`;
  if (category === "media") return String(Math.round(value));
  return DECIMAL.format(value);
}

/** "52,4 s". */
export const formatSeconds = (ms: number) => `${DECIMAL.format(Math.round(ms / 100) / 10)} s`;

// ---------------------------------------------------------------------------------------------------------
// Jugadores que salen: los de la rotación (todo el mundo los conoce un poco)

/** Lo que hace falta de cada fila del explorador de jugadores (`getPlayerExplorer`). */
export type PoolRow = {
  id: number;
  name: string;
  teamId: number | null;
  salary: number | null;
  salaryStatus: "confirmed" | "approx" | "pending" | null;
  overall: number | null;
  totals: { gp: number; min: number | null; pts: number | null; reb: number | null; ast: number | null };
};

/** Abreviatura y colores del equipo (`teamBackdrop` para el fondo con texto blanco, `teamAccent` para las franjas). */
export type TeamTag = { abbr: string; color: string; accent: string };

export type PoolPlayer = { id: number; name: string; teamId: number; team: TeamTag; values: Partial<Record<Category, number>> };

export type Pool = { season: string; players: PoolPlayer[] };

/** Minutos por partido para entrar: los de la rotación. */
export const MIN_MINUTES = 18;
/** Partidos jugados para entrar (menos al empezar la temporada: una cuarta parte de los del que más lleva). */
export const MAX_MIN_GAMES = 5;

export function buildPool(rows: readonly PoolRow[], teams: ReadonlyMap<number, TeamTag>, season: string): Pool {
  const maxGames = rows.reduce((max, r) => Math.max(max, r.totals.gp), 0);
  const minGames = Math.min(MAX_MIN_GAMES, Math.max(1, Math.ceil(maxGames / 4)));
  const players = rows.flatMap((row): PoolPlayer[] => {
    const team = row.teamId === null ? undefined : teams.get(row.teamId);
    const { gp, min, pts, reb, ast } = row.totals;
    if (!team || gp < minGames || min === null || min / gp < MIN_MINUTES) return [];
    const values: Partial<Record<Category, number>> = {};
    // Solo cifras exactas: ni pendientes ni aproximadas (Tarea 4.4)
    if (row.salaryStatus === "confirmed" && row.salary !== null && row.salary > 0) values.salario = row.salary;
    if (typeof row.overall === "number") values.media = Math.round(row.overall);
    if (pts !== null) values.puntos = round1(pts / gp);
    if (reb !== null) values.rebotes = round1(reb / gp);
    if (ast !== null) values.asistencias = round1(ast / gp);
    return [{ id: row.id, name: row.name, teamId: row.teamId!, team, values }];
  });
  return { season, players };
}

// ---------------------------------------------------------------------------------------------------------
// Preguntas

export type Side = { id: number; name: string; teamId: number; team: TeamTag; value: number };
export type HiddenSide = Omit<Side, "value">;
export type Question = { category: Category; season: string; level: Level; a: Side; b: Side };
/** Lo que ve el cliente antes de responder: sin la cifra del segundo. */
export type AskedQuestion = { index: number; total: number; category: Category; season: string; a: Side; b: HiddenSide };

export const correctChoice = (q: Pick<Question, "a" | "b">): Choice => (q.b.value > q.a.value ? "mas" : "menos");

export type Rng = () => number;

/** Generador con semilla (mulberry32): la misma semilla da las mismas preguntas (tests). */
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

const pick = <T>(list: readonly T[], rng: Rng): T => list[Math.floor(rng() * list.length)];

export type Slot = { category: Category; level: Level };

const ATTEMPTS = 40;

/** Un par de esa categoría y esa dificultad, sin repetir jugadores si se puede. */
function pickQuestion(pool: Pool, slot: Slot, rng: Rng, used: ReadonlySet<number>): Question | null {
  const { category, level } = slot;
  const withValue = pool.players.filter((p) => p.values[category] !== undefined);
  for (const fresh of [true, false]) {
    const candidates = fresh ? withValue.filter((p) => !used.has(p.id)) : withValue;
    if (candidates.length < 2) continue;
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const a = pick(candidates, rng);
      const value = a.values[category]!;
      const options = candidates.filter((b) => b.id !== a.id && levelOf(category, value, b.values[category]!) === level);
      if (options.length === 0) continue;
      const b = pick(options, rng);
      const side = (p: PoolPlayer): Side => ({ id: p.id, name: p.name, teamId: p.teamId, team: p.team, value: p.values[category]! });
      return { category, season: pool.season, level, a: side(a), b: side(b) };
    }
  }
  return null;
}

/** Preguntas de un plan. Si una categoría no da (principio de temporada), otra con la misma dificultad. */
export function buildQuestions(pool: Pool, plan: readonly Slot[], rng: Rng): Question[] {
  const used = new Set<number>();
  return plan.map((slot) => {
    for (const category of [slot.category, ...CATEGORY_ORDER.filter((c) => c !== slot.category)]) {
      const question = pickQuestion(pool, { category, level: slot.level }, rng, used);
      if (!question) continue;
      used.add(question.a.id);
      used.add(question.b.id);
      return question;
    }
    throw new Error("No hay jugadores suficientes para las preguntas");
  });
}

// ---------------------------------------------------------------------------------------------------------
// Reto del día

export const DAILY_QUESTIONS = 30;
/** 30 aciertos × 2 = 60, el tope del reto (Tarea 8.6). */
export const POINTS_PER_HIT = 2;
/** Tiempo para cada pregunta. */
export const ANSWER_MS = 15_000;
/** Margen del servidor para la red: más tarde, la respuesta no cuenta. */
export const GRACE_MS = 2_000;
/** Lo que se enseña la cifra antes de la siguiente pregunta (su reloj empieza después). */
export const REVEAL_MS = 1_400;

// Las cinco categorías repartidas igual para todos (tres de salarios y tres de media por cada diez)
const DAILY_ROTATION: readonly Category[] = ["salario", "media", "puntos", "salario", "rebotes", "media", "asistencias", "salario", "puntos", "media"];

/** Igual para todos: diez fáciles, diez medias y diez difíciles, con las categorías en el mismo orden. */
export const DAILY_PLAN: readonly Slot[] = Array.from({ length: DAILY_QUESTIONS }, (_, i) => ({
  category: DAILY_ROTATION[i % DAILY_ROTATION.length],
  level: i < 10 ? "facil" : i < 20 ? "media" : "dificil",
}));

export type Answer = {
  choice: Choice | null;
  hit: boolean;
  /** Llegó fuera de tiempo (cuenta como fallo). */
  late: boolean;
  /** Lo que tardó, medido en el servidor y como mucho `ANSWER_MS` (desempate del campeón, Tarea 8.6). */
  ms: number;
};

export type RunState = {
  v: 1;
  /** Día del reto en que empezó: cuenta para ese día aunque acabe después de las 7:00. */
  day: string;
  questions: Question[];
  answers: Answer[];
  /** Cuándo empezó a correr el reloj de la pregunta en curso (hora del servidor). */
  askedAt: number;
};

export type RunSummary = { points: number; hits: number; total: number; ms: number; rows: string[]; /** Lo añade la API (Tarea 8.5, `game-receipt.ts`): para pasar el resultado a la cuenta. */ receipt?: string };

export type AnswerOutcome = {
  index: number;
  choice: Choice | null;
  hit: boolean;
  late: boolean;
  /** La cifra del segundo jugador, ya contestada. */
  value: number;
  correct: Choice;
  /** Aciertos hasta aquí. */
  hits: number;
  next: AskedQuestion | null;
  summary: RunSummary | null;
};

export const newRun = (questions: Question[], day: string, now: number): RunState => ({ v: 1, day, questions, answers: [], askedAt: now });

export const isFinished = (state: RunState) => state.answers.length >= state.questions.length;

function asked(state: RunState, index: number): AskedQuestion | null {
  const q = state.questions[index];
  if (!q) return null;
  const b: HiddenSide = { id: q.b.id, name: q.b.name, teamId: q.b.teamId, team: q.b.team };
  return { index, total: state.questions.length, category: q.category, season: q.season, a: q.a, b };
}

/** La pregunta que toca, sin la solución; null si ya acabó. */
export const currentQuestion = (state: RunState): AskedQuestion | null => (isFinished(state) ? null : asked(state, state.answers.length));

const ROW_LENGTH = 10;

/** Marcas para compartir (🟩/🟥) en filas de diez. */
export function answerRows(answers: readonly Pick<Answer, "hit">[]): string[] {
  const marks = answers.map((a) => (a.hit ? "o" : "x")).join("");
  const rows: string[] = [];
  for (let i = 0; i < marks.length; i += ROW_LENGTH) rows.push(marks.slice(i, i + ROW_LENGTH));
  return rows;
}

export function runSummary(state: RunState): RunSummary {
  const hits = state.answers.filter((a) => a.hit).length;
  return {
    points: hits * POINTS_PER_HIT,
    hits,
    total: state.questions.length,
    ms: state.answers.reduce((sum, a) => sum + a.ms, 0),
    rows: answerRows(state.answers),
  };
}

function outcomeOf(state: RunState, index: number): AnswerOutcome {
  const answer = state.answers[index];
  const q = state.questions[index];
  return {
    index,
    choice: answer.choice,
    hit: answer.hit,
    late: answer.late,
    value: q.b.value,
    correct: correctChoice(q),
    hits: state.answers.slice(0, index + 1).filter((a) => a.hit).length,
    next: asked(state, index + 1),
    summary: isFinished(state) ? runSummary(state) : null,
  };
}

/**
 * Responde la pregunta `index` (choice null = se acabó el tiempo en el cliente). Lo decide todo el servidor con su
 * hora: fuera de tiempo es fallo. Una pregunta ya contestada devuelve lo que contó (`changed` false): ni reintentar
 * ni cambiar la respuesta. null si `index` aún no ha llegado.
 */
export function answerRun(state: RunState, index: number, choice: Choice | null, now: number): { state: RunState; outcome: AnswerOutcome; changed: boolean } | null {
  if (!Number.isInteger(index) || index < 0) return null;
  if (index < state.answers.length) return { state, outcome: outcomeOf(state, index), changed: false };
  if (index !== state.answers.length || isFinished(state)) return null;

  const elapsed = Math.max(0, now - state.askedAt);
  const late = elapsed > ANSWER_MS + GRACE_MS;
  const hit = !late && choice !== null && choice === correctChoice(state.questions[index]);
  const answer: Answer = { choice, hit, late, ms: Math.min(elapsed, ANSWER_MS) };
  const next: RunState = { ...state, answers: [...state.answers, answer], askedAt: now + REVEAL_MS };
  return { state: next, outcome: outcomeOf(next, index), changed: true };
}

export const parseChoice = (value: unknown): Choice | null | undefined =>
  value === "mas" || value === "menos" ? value : value === null ? null : undefined;

const isSide = (s: unknown): s is Side => {
  const side = s as Side | null;
  return !!side && Number.isInteger(side.id) && typeof side.name === "string" && Number.isInteger(side.teamId) && typeof side.value === "number" && !!side.team;
};

/** Lo que vuelve de la base de datos, sin fiarse de la forma. */
export function isRunState(value: unknown): value is RunState {
  const state = value as RunState | null;
  return (
    !!state &&
    state.v === 1 &&
    typeof state.day === "string" &&
    typeof state.askedAt === "number" &&
    Array.isArray(state.questions) &&
    state.questions.length > 0 &&
    state.questions.every((q) => CATEGORY_ORDER.includes(q?.category) && isSide(q.a) && isSide(q.b)) &&
    Array.isArray(state.answers) &&
    state.answers.length <= state.questions.length
  );
}

// ---------------------------------------------------------------------------------------------------------
// Modo infinito: sin puntos ni reloj, hasta el primer fallo

/** Empieza fácil y se pone difícil: 5 fáciles, 10 medias y el resto difíciles. */
export const endlessLevel = (index: number): Level => (index < 5 ? "facil" : index < 15 ? "media" : "dificil");

export const ENDLESS_BATCH = 20;

/** Una tanda de preguntas desde la posición `from`, de categorías al azar. Viajan con la solución. */
export function endlessBatch(pool: Pool, from: number, count: number, rng: Rng): Question[] {
  const available = CATEGORY_ORDER.filter((c) => pool.players.filter((p) => p.values[c] !== undefined).length >= 2);
  if (available.length === 0) throw new Error("No hay jugadores suficientes para las preguntas");
  const plan = Array.from({ length: count }, (_, i): Slot => ({ category: pick(available, rng), level: endlessLevel(from + i) }));
  return buildQuestions(pool, plan, rng);
}
