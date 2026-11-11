// Lógica del comparador: radar histórico y quién gana cada fila. Funciones puras y sin dependencias,
// igual que el motor de traspasos: se usan en el servidor, en el cliente y en los tests.
import type { RadarCategory, SeasonType } from "@/lib/supabase";

export const CAREER = "Career";

/** Promedios de una temporada o de una carrera. Null = esa época no tiene el dato. */
export type StatLine = {
  games: number | null;
  minutes: number | null;
  pts: number | null;
  reb: number | null;
  ast: number | null;
  stl: number | null;
  blk: number | null;
  tov: number | null;
  fg3m: number | null;
  fg3a: number | null;
  fgPct: number | null;
  fg3Pct: number | null;
  ftPct: number | null;
  tsPct: number | null;
};

export type Radar = Record<RadarCategory, number | null>;

// ---------- Radar histórico ----------

type Metric = { value: (line: StatLine) => number | null; weight: number };

// Con menos de 1 triple por partido, el porcentaje no dice nada: un pívot con 1 de 2 no es un tirador
const threePointAccuracy = ({ fg3a, fg3Pct }: StatLine) => (fg3a === null ? null : fg3a >= 1 ? fg3Pct : 0);

/** Solo lo que existe en todas las épocas: `player_radar_calc.py` usa métricas avanzadas que no llegan a 1996. */
const METRICS: Record<RadarCategory, Metric[]> = {
  scoring: [{ value: (s) => s.pts, weight: 1 }],
  shooting: [{ value: (s) => s.fg3m, weight: 0.5 }, { value: threePointAccuracy, weight: 0.5 }],
  playmaking: [{ value: (s) => s.ast, weight: 1 }],
  defense: [{ value: (s) => s.stl, weight: 0.5 }, { value: (s) => s.blk, weight: 0.5 }],
  rebounding: [{ value: (s) => s.reb, weight: 1 }],
  efficiency: [{ value: (s) => s.tsPct, weight: 1 }],
};

const CATEGORIES = Object.keys(METRICS) as RadarCategory[];
const CUT_POINTS = 100;

/** Cortes de percentil de una categoría: los de cada métrica y los de la nota combinada. */
type CategoryScale = { metrics: number[][]; combined: number[] };

export type RadarScale = Record<RadarCategory, CategoryScale>;

/** Una escala por combinación: las carreras se miden con carreras y los playoffs con playoffs. */
export type RadarScales = Record<string, RadarScale>;

export const scaleKey = (seasonId: string, phase: SeasonType) => `${phase}:${seasonId === CAREER ? "career" : "season"}`;

function cutPoints(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  return Array.from({ length: CUT_POINTS }, (_, i) => sorted[Math.floor((i / CUT_POINTS) * sorted.length)]);
}

/** Percentil 0-99: cuántos cortes deja por debajo. */
function percentile(value: number, cuts: number[]): number {
  let low = 0;
  let high = cuts.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (cuts[middle] <= value) low = middle + 1;
    else high = middle;
  }
  return Math.max(0, low - 1);
}

function combine(line: StatLine, metrics: Metric[], cuts: number[][]): number | null {
  let total = 0;
  for (const [i, { value, weight }] of metrics.entries()) {
    const raw = value(line);
    if (raw === null) return null;
    total += percentile(raw, cuts[i]) * weight;
  }
  return total;
}

function buildCategoryScale(lines: StatLine[], metrics: Metric[]): CategoryScale {
  const cuts = metrics.map(({ value }) => cutPoints(lines.map(value).filter((raw) => raw !== null)));
  const combined = lines.map((line) => combine(line, metrics, cuts)).filter((score) => score !== null);
  return { metrics: cuts, combined: cutPoints(combined) };
}

/** Escala de una población: se calcula una vez y deja solo los cortes, no todas las filas. */
export function buildRadarScale(lines: StatLine[]): RadarScale {
  return Object.fromEntries(CATEGORIES.map((category) => [category, buildCategoryScale(lines, METRICS[category])])) as RadarScale;
}

/** Radar 0-99 de una temporada o carrera. Null = esa época no registraba el dato. */
export function radarOf(line: StatLine, scale: RadarScale): Radar {
  return Object.fromEntries(
    CATEGORIES.map((category) => {
      const { metrics, combined } = scale[category];
      const score = combine(line, METRICS[category], metrics);
      return [category, score === null ? null : percentile(score, combined)];
    })
  ) as Radar;
}

const MIN_SEASON_GAMES = { "Regular Season": 20, Playoffs: 4 };
const MIN_CAREER_GAMES = { "Regular Season": 100, Playoffs: 20 };
const MIN_MINUTES = 15;

/** ¿Cuenta para la escala? Una temporada de 3 partidos no debe marcar el listón de nadie. */
export function isRepresentative(line: StatLine, seasonId: string, phase: SeasonType): boolean {
  const games = line.games ?? 0;
  if (seasonId === CAREER) return games >= MIN_CAREER_GAMES[phase];
  return games >= MIN_SEASON_GAMES[phase] && (line.minutes ?? MIN_MINUTES) >= MIN_MINUTES;
}

// ---------- Filas del duelo ----------

export type Side = "a" | "b";

export type DuelRow = {
  key: string;
  label: string;
  a: number | null;
  b: number | null;
  aText: string;
  bText: string;
  /** null = empate, falta el dato o la fila no puntúa. */
  winner: Side | null;
  /** Lo que ocupa cada lado en la barra, de 0 a 1. */
  share: number;
};

type Format = "average" | "percent" | "integer";

function formatValue(value: number | null, format: Format): string {
  if (value === null) return "–";
  if (format === "percent") return (value * 100).toFixed(1);
  return format === "integer" ? String(Math.round(value)) : value.toFixed(1);
}

function buildRow(
  key: string,
  label: string,
  a: number | null,
  b: number | null,
  { format = "average", lowerIsBetter = false, scored = true }: { format?: Format; lowerIsBetter?: boolean; scored?: boolean } = {}
): DuelRow {
  const comparable = scored && a !== null && b !== null && a !== b;
  const aAhead = comparable && (lowerIsBetter ? a < b : a > b);
  const total = (a ?? 0) + (b ?? 0);
  return {
    key,
    label,
    a,
    b,
    aText: formatValue(a, format),
    bText: formatValue(b, format),
    winner: comparable ? (aAhead ? "a" : "b") : null,
    share: total > 0 ? (a ?? 0) / total : 0.5,
  };
}

export function statRows(a: StatLine, b: StatLine): DuelRow[] {
  const bothShoot = (a.fg3a ?? 0) >= 1 && (b.fg3a ?? 0) >= 1;
  return [
    buildRow("pts", "Puntos", a.pts, b.pts),
    buildRow("reb", "Rebotes", a.reb, b.reb),
    buildRow("ast", "Asistencias", a.ast, b.ast),
    buildRow("stl", "Robos", a.stl, b.stl),
    buildRow("blk", "Tapones", a.blk, b.blk),
    buildRow("tsPct", "Tiro real (TS%)", a.tsPct, b.tsPct, { format: "percent" }),
    buildRow("fgPct", "% Tiro", a.fgPct, b.fgPct, { format: "percent" }),
    buildRow("fg3Pct", "% Triple", a.fg3Pct, b.fg3Pct, { format: "percent", scored: bothShoot }),
    buildRow("ftPct", "% Tiro libre", a.ftPct, b.ftPct, { format: "percent" }),
    buildRow("tov", "Pérdidas", a.tov, b.tov, { lowerIsBetter: true }),
    buildRow("minutes", "Minutos", a.minutes, b.minutes, { scored: false }),
    buildRow("games", "Partidos", a.games, b.games, { format: "integer", scored: false }),
  ];
}

export function radarRows(a: Radar, b: Radar, labels: Record<RadarCategory, string>): DuelRow[] {
  return CATEGORIES.map((category) => buildRow(category, labels[category], a[category], b[category], { format: "integer" }));
}

/** Premios que se comparan, por orden de prestigio (claves de `TrophyCabinet`). */
const TROPHY_ROWS = [
  ["champion", "Anillos"],
  ["mvp", "MVP"],
  ["fmvp", "MVP de las Finales"],
  ["dpoy", "Mejor Defensor"],
  ["allnba", "All-NBA"],
  ["alldef", "Quinteto Defensivo"],
  ["allstar", "All-Star"],
] as const;

export function trophyRows(a: Record<string, number>, b: Record<string, number>): DuelRow[] {
  return TROPHY_ROWS.filter(([key]) => (a[key] ?? 0) + (b[key] ?? 0) > 0).map(([key, label]) => buildRow(key, label, a[key] ?? 0, b[key] ?? 0, { format: "integer" }));
}

/** Filas ganadas por cada lado. */
export function score(rows: DuelRow[]): Record<Side, number> {
  return { a: rows.filter((row) => row.winner === "a").length, b: rows.filter((row) => row.winner === "b").length };
}

// ---------- Selección de temporada ----------

const MIN_GAMES_FOR_DEFAULT = 10;

/** Temporada por defecto: la última con partidos suficientes para no comparar muestras pequeñas. */
export function defaultSeason(seasons: { id: string; line: StatLine }[]): string {
  const played = seasons.filter(({ id }) => id !== CAREER);
  return played.find(({ line }) => (line.games ?? 0) >= MIN_GAMES_FOR_DEFAULT)?.id ?? played[0]?.id ?? CAREER;
}

const MICHAEL_JORDAN = { id: 893, name: "Michael Jordan" };

/** Duelos para entrar con un toque. */
export const FEATURED_DUELS = [
  { a: MICHAEL_JORDAN, b: { id: 2544, name: "LeBron James" }, title: "El debate eterno" },
  { a: { id: 977, name: "Kobe Bryant" }, b: MICHAEL_JORDAN, title: "El alumno y el maestro" },
  { a: { id: 77142, name: "Magic Johnson" }, b: { id: 1449, name: "Larry Bird" }, title: "La rivalidad que salvó la liga" },
  { a: { id: 2200, name: "Pau Gasol" }, b: { id: 1717, name: "Dirk Nowitzki" }, title: "Dos europeos con anillo" },
  { a: { id: 203999, name: "Nikola Jokić" }, b: { id: 1641705, name: "Victor Wembanyama" }, title: "El presente de los pívots" },
  { a: { id: 1628983, name: "Shai Gilgeous-Alexander" }, b: { id: 1629029, name: "Luka Dončić" }, title: "Los mejores bases de hoy" },
];
