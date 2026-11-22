// Tarea 6.22: explorador de jugadores (`/players`). Filtros combinables, cualquier estadística ordenable
// por partido, en totales o por 36 minutos, líderes y el estado entero en la URL para compartirlo.
// Puro y sin dependencias (lo usan el servidor, el cliente y `npm test`).
//
// Sin spoilers: son estadísticas de temporada, que cambian una vez al día (job diario), igual que los
// promedios de la ficha del jugador. Nada de aquí depende de un partido concreto.

import { countryLabel } from "./places.ts";

/** Totales exactos de la temporada regular (`player_season_stats.totals`); `min` = minutos totales. */
export type ExplorerTotals = {
  gp: number;
  gs: number | null;
  min: number | null;
  pts: number | null;
  reb: number | null;
  oreb: number | null;
  dreb: number | null;
  ast: number | null;
  stl: number | null;
  blk: number | null;
  tov: number | null;
  pf: number | null;
  fgm: number | null;
  fga: number | null;
  fg3m: number | null;
  fg3a: number | null;
  ftm: number | null;
  fta: number | null;
};

/** Un jugador en una temporada. */
export type ExplorerRow = {
  id: number;
  name: string;
  position: string | null;
  /** Equipo que se enseña: el actual en la temporada en curso; el último de esa temporada en las anteriores. */
  teamId: number | null;
  /** Todos los equipos de esa temporada (traspasos) y el actual: el filtro por equipo los cuenta todos. */
  teamIds: number[];
  /** Tal como lo guarda la NBA, en inglés ("Spain"). */
  country: string | null;
  /** Edad en esa temporada. */
  age: number | null;
  rookie: boolean;
  /** Salario de la temporada del GM: null si no hay cifra (nunca inventada). */
  salary: number | null;
  salaryStatus: "confirmed" | "approx" | "pending" | null;
  /** Media de la ficha (Tarea 6.19): solo si su radar es de esta temporada y entra en la escala. */
  overall: number | null;
  /** Fracciones 0-1 calculadas con los boxscores (solo la temporada en curso). */
  usgPct: number | null;
  astPct: number | null;
  rebPct: number | null;
  totals: ExplorerTotals;
};

/** Lo que el servidor manda de una temporada. */
export type ExplorerSeason = {
  season: string;
  /** La temporada en curso (las anteriores solo tienen a los jugadores que siguen en la base de datos). */
  current: boolean;
  rows: ExplorerRow[];
};

// ---------- Modos, vistas y estadísticas ----------

export type ExplorerMode = "game" | "total" | "per36";
export const EXPLORER_MODES: { id: ExplorerMode; label: string; param: string | null; suffix: string }[] = [
  { id: "game", label: "Por partido", param: null, suffix: "por partido" },
  { id: "total", label: "Totales", param: "totales", suffix: "en total" },
  { id: "per36", label: "Por 36 min", param: "por36", suffix: "por 36 minutos" },
];

export type ExplorerView = "general" | "shooting" | "advanced";

export type StatKey =
  | "gp" | "gs" | "min" | "pts" | "reb" | "oreb" | "dreb" | "ast" | "stl" | "blk" | "tov" | "pf"
  | "fgm" | "fga" | "fg_pct" | "fg3m" | "fg3a" | "fg3_pct" | "ftm" | "fta" | "ft_pct"
  | "ts_pct" | "efg_pct" | "usg_pct" | "ast_pct" | "reb_pct" | "ast_tov" | "overall" | "salary";

/**
 * count = se divide según el modo · games = partidos, siempre enteros · minutes = por partido (o totales)
 * pct = fracción 0-1 · ratio = cociente con 2 decimales · rating = media 0-99 · money = salario.
 */
type StatKind = "count" | "games" | "minutes" | "pct" | "ratio" | "rating" | "money";

export type StatDef = {
  key: StatKey;
  label: string;
  /** Nombre largo, sin el modo ("Puntos"). */
  name: string;
  /** Explicación para el que no la conoce (tooltip y leyenda de la tabla). */
  hint?: string;
  kind: StatKind;
};

const STAT_LIST: StatDef[] = [
  { key: "gp", label: "PJ", name: "Partidos jugados", kind: "games" },
  { key: "gs", label: "TIT", name: "Partidos de titular", kind: "games" },
  { key: "min", label: "MIN", name: "Minutos", kind: "minutes" },
  { key: "pts", label: "PTS", name: "Puntos", kind: "count" },
  { key: "reb", label: "REB", name: "Rebotes", kind: "count" },
  { key: "oreb", label: "RO", name: "Rebotes ofensivos", kind: "count" },
  { key: "dreb", label: "RD", name: "Rebotes defensivos", kind: "count" },
  { key: "ast", label: "AST", name: "Asistencias", kind: "count" },
  { key: "stl", label: "ROB", name: "Robos", kind: "count" },
  { key: "blk", label: "TAP", name: "Tapones", kind: "count" },
  { key: "tov", label: "PÉR", name: "Pérdidas", kind: "count" },
  { key: "pf", label: "FP", name: "Faltas personales", kind: "count" },
  { key: "fgm", label: "TC", name: "Tiros de campo anotados", kind: "count" },
  { key: "fga", label: "TCI", name: "Tiros de campo intentados", kind: "count" },
  { key: "fg_pct", label: "%TC", name: "Porcentaje de tiros de campo", kind: "pct" },
  { key: "fg3m", label: "T3", name: "Triples anotados", kind: "count" },
  { key: "fg3a", label: "T3I", name: "Triples intentados", kind: "count" },
  { key: "fg3_pct", label: "%T3", name: "Porcentaje de triples", kind: "pct" },
  { key: "ftm", label: "TL", name: "Tiros libres anotados", kind: "count" },
  { key: "fta", label: "TLI", name: "Tiros libres intentados", kind: "count" },
  { key: "ft_pct", label: "%TL", name: "Porcentaje de tiros libres", kind: "pct" },
  { key: "ts_pct", label: "TS%", name: "Acierto real (TS%)", hint: "cuenta triples y tiros libres", kind: "pct" },
  { key: "efg_pct", label: "eFG%", name: "Acierto efectivo (eFG%)", hint: "un triple vale como 1,5 tiros de dos", kind: "pct" },
  { key: "usg_pct", label: "USG%", name: "Uso (USG%)", hint: "% de jugadas del equipo que termina él mientras está en pista", kind: "pct" },
  { key: "ast_pct", label: "AST%", name: "Asistencias (AST%)", hint: "% de canastas de sus compañeros que asiste él mientras está en pista", kind: "pct" },
  { key: "reb_pct", label: "REB%", name: "Rebotes (REB%)", hint: "% de los rebotes que coge él mientras está en pista", kind: "pct" },
  { key: "ast_tov", label: "AST/PÉR", name: "Asistencias por pérdida", kind: "ratio" },
  { key: "overall", label: "MEDIA", name: "Media Hoopmeter", hint: "la de su ficha, frente a los jugadores de rotación", kind: "rating" },
  { key: "salary", label: "M$", name: "Salario", kind: "money" },
];

export const STATS: Record<StatKey, StatDef> = Object.fromEntries(STAT_LIST.map((s) => [s.key, s])) as Record<StatKey, StatDef>;

export function isStatKey(value: unknown): value is StatKey {
  return typeof value === "string" && Object.hasOwn(STATS, value);
}

/** Columnas de cada vista, en orden: las primeras son las que se ven sin desplazar en el móvil. */
export const EXPLORER_VIEWS: { id: ExplorerView; label: string; param: string | null; columns: StatKey[] }[] = [
  { id: "general", label: "General", param: null, columns: ["gp", "min", "pts", "reb", "ast", "stl", "blk", "tov", "oreb", "dreb", "pf", "gs", "overall", "salary"] },
  { id: "shooting", label: "Tiro", param: "tiro", columns: ["pts", "fg_pct", "fg3_pct", "ft_pct", "ts_pct", "efg_pct", "fgm", "fga", "fg3m", "fg3a", "ftm", "fta"] },
  { id: "advanced", label: "Avanzadas", param: "avanzadas", columns: ["overall", "usg_pct", "ts_pct", "efg_pct", "ast_pct", "reb_pct", "ast_tov", "min", "gp"] },
];

/** "Puntos por partido", "Rebotes en total", "Porcentaje de triples". */
export function statTitle(key: StatKey, mode: ExplorerMode): string {
  const stat = STATS[key];
  if (stat.kind === "count") return `${stat.name} ${EXPLORER_MODES.find((m) => m.id === mode)!.suffix}`;
  // En "Por 36" los minutos siguen siendo por partido: es lo que dice cuánto juega
  if (stat.kind === "minutes") return mode === "total" ? "Minutos en total" : "Minutos por partido";
  return stat.name;
}

/** ¿Cambia la cifra al pasar de por partido a totales o por 36? (Para el aviso de "Por 36" y la tarjeta). */
export function scalesWithMode(key: StatKey): boolean {
  return STATS[key].kind === "count";
}

// ---------- Valores ----------

/** Mínimos de la NBA para los líderes de porcentaje en una temporada de 82 partidos (anotados). */
const NBA_SEASON_GAMES = 82;
const NBA_MIN_MADE = { fg: 300, fg3: 82, ft: 125 } as const;

/** Anotados que exige la NBA a esta altura de la temporada (`maxGames` = lo que lleva jugado el que más). */
export function minMade(kind: keyof typeof NBA_MIN_MADE, maxGames: number): number {
  return Math.ceil((NBA_MIN_MADE[kind] * Math.min(maxGames, NBA_SEASON_GAMES)) / NBA_SEASON_GAMES);
}

/**
 * ¿Entra en la clasificación de este porcentaje? Como la NBA: sin un mínimo de anotados, un 1 de 1 en
 * triples (100 %) no puede quedar por delante de Curry. Al ordenar, los que no llegan van detrás.
 */
export function qualifiesFor(key: StatKey, totals: ExplorerTotals, maxGames: number): boolean {
  switch (key) {
    case "fg_pct":
    case "ts_pct":
    case "efg_pct":
      return (totals.fgm ?? 0) >= minMade("fg", maxGames);
    case "fg3_pct":
      return (totals.fg3m ?? 0) >= minMade("fg3", maxGames);
    case "ft_pct":
      return (totals.ftm ?? 0) >= minMade("ft", maxGames);
    default:
      return true;
  }
}

/** Qué le falta para entrar en la clasificación de un porcentaje (null si no hay mínimo). */
export function qualifyRule(key: StatKey, maxGames: number): string | null {
  if (key === "fg_pct" || key === "ts_pct" || key === "efg_pct") return `${minMade("fg", maxGames)} tiros de campo anotados`;
  if (key === "fg3_pct") return `${minMade("fg3", maxGames)} triples anotados`;
  if (key === "ft_pct") return `${minMade("ft", maxGames)} tiros libres anotados`;
  return null;
}

const ratio = (num: number | null, den: number | null) => (num == null || !den ? null : num / den);

/** Valor exacto (sin redondear) de una estadística en un modo. Null = sin dato. */
export function statValue(row: ExplorerRow, key: StatKey, mode: ExplorerMode): number | null {
  const t = row.totals;
  const stat = STATS[key];
  switch (stat.kind) {
    case "count": {
      const total = t[key as keyof ExplorerTotals];
      if (total == null) return null;
      if (mode === "total") return total;
      if (mode === "game") return ratio(total, t.gp);
      return t.min ? (total * 36) / t.min : null;
    }
    case "games":
      return t[key as "gp" | "gs"];
    case "minutes":
      return mode === "total" ? t.min : ratio(t.min, t.gp);
    case "pct":
      switch (key) {
        case "fg_pct":
          return ratio(t.fgm, t.fga);
        case "fg3_pct":
          return ratio(t.fg3m, t.fg3a);
        case "ft_pct":
          return ratio(t.ftm, t.fta);
        case "ts_pct":
          return t.pts == null || t.fga == null || t.fta == null ? null : ratio(t.pts, 2 * (t.fga + 0.44 * t.fta));
        case "efg_pct":
          return t.fgm == null || t.fg3m == null ? null : ratio(t.fgm + 0.5 * t.fg3m, t.fga);
        case "usg_pct":
          return row.usgPct;
        case "ast_pct":
          return row.astPct;
        default:
          return row.rebPct;
      }
    case "ratio":
      return ratio(t.ast, t.tov);
    case "rating":
      return row.overall;
    case "money":
      return row.salary;
  }
}

/**
 * Redondeo a la mitad hacia arriba, como la NBA (20,25 → 20,3). El margen corrige que 0,15 en coma
 * flotante sea 0,1499…: entre totales enteros, un valor que no es un empate queda mucho más lejos.
 */
export function roundHalfUp(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor + 1e-7) / factor;
}

/** Cifra tal como se enseña: "27.4", "1.203", "48.9", "2.45". Sin dato, "–". */
export function formatStat(value: number | null, key: StatKey, mode: ExplorerMode): string {
  if (value == null) return "–";
  const kind = STATS[key].kind;
  switch (kind) {
    case "count":
    case "minutes":
      return mode === "total" ? String(Math.round(value)) : roundHalfUp(value, 1).toFixed(1);
    case "games":
    case "rating":
      return String(Math.round(value));
    case "pct":
      return roundHalfUp(value * 100, 1).toFixed(1);
    case "ratio":
      return roundHalfUp(value, 2).toFixed(2);
    case "money":
      return (value / 1_000_000).toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }
}

/** Lo que más ha jugado alguien esa temporada: hace de "partidos de la temporada" hasta la fecha. */
export function seasonMaxGames(rows: ExplorerRow[]): number {
  return rows.reduce((max, row) => Math.max(max, row.totals.gp), 0);
}

// ---------- Filtros ----------

export type PositionFilter = "G" | "F" | "C";
export const POSITION_FILTERS: { id: PositionFilter; label: string; plural: string; param: string }[] = [
  { id: "G", label: "Exterior", plural: "Exteriores", param: "exterior" },
  { id: "F", label: "Alero", plural: "Aleros", param: "alero" },
  { id: "C", label: "Pívot", plural: "Pívots", param: "pivot" },
];

export type Conference = "East" | "West";
export const CONFERENCE_FILTERS: { id: Conference; label: string; param: string }[] = [
  { id: "East", label: "Este", param: "este" },
  { id: "West", label: "Oeste", param: "oeste" },
];

/** Rango cerrado [min, max]; en el salario, en millones y con el máximo excluido. */
export type Range = { min: number | null; max: number | null };

export const AGE_PRESETS: { label: string; range: Range }[] = [
  { label: "23 o menos", range: { min: null, max: 23 } },
  { label: "24 a 27", range: { min: 24, max: 27 } },
  { label: "28 a 31", range: { min: 28, max: 31 } },
  { label: "32 o más", range: { min: 32, max: null } },
];

export const SALARY_PRESETS: { label: string; range: Range }[] = [
  { label: "Menos de 5 M$", range: { min: null, max: 5 } },
  { label: "De 5 a 15 M$", range: { min: 5, max: 15 } },
  { label: "De 15 a 30 M$", range: { min: 15, max: 30 } },
  { label: "30 M$ o más", range: { min: 30, max: null } },
];

/** Mínimo de partidos: "auto" = 40 % de los que lleva el que más ha jugado (la escala de la media, Tarea 6.19). */
export const AUTO_GAMES_SHARE = 0.4;
export const GAMES_PRESETS = [0, 5, 10, 20, 40, 60];
export const DEFAULT_MIN_MINUTES = 15;
export const MINUTES_PRESETS = [0, 10, 15, 20, 25, 30, 35];

export const INTERNATIONAL = "internacional";

export type ExplorerFilters = {
  position: PositionFilter | null;
  team: number | null;
  conference: Conference | null;
  /** Slug del país en español ("espana") o `INTERNATIONAL` (todos menos EE. UU.). */
  country: string | null;
  age: Range | null;
  salary: Range | null;
  rookies: boolean;
  /** Null = automático. */
  minGames: number | null;
  /** Por partido. */
  minMinutes: number;
};

export const DEFAULT_FILTERS: ExplorerFilters = {
  position: null,
  team: null,
  conference: null,
  country: null,
  age: null,
  salary: null,
  rookies: false,
  minGames: null,
  minMinutes: DEFAULT_MIN_MINUTES,
};

/** "G", "F-C", "Forward-Center", "Center" → sus posiciones (un "G-F" cuenta como exterior y como alero). */
export function positionGroups(position: string | null): Set<PositionFilter> {
  const groups = new Set<PositionFilter>();
  for (const part of (position ?? "").split("-")) {
    const letter = part.trim().charAt(0).toUpperCase();
    if (letter === "G" || letter === "F" || letter === "C") groups.add(letter);
  }
  return groups;
}

/** "España" → "espana", "EE. UU." → "ee-uu": el país en la URL, en español y sin tildes. */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const USA = "ee-uu";

export function countrySlug(country: string | null): string | null {
  const label = countryLabel(country);
  return label ? slugify(label) : null;
}

/** Países de la temporada con cuántos jugadores tiene cada uno, de más a menos. */
export function countryOptions(rows: ExplorerRow[]): { slug: string; label: string; count: number }[] {
  const bySlug = new Map<string, { slug: string; label: string; count: number }>();
  for (const row of rows) {
    const label = countryLabel(row.country);
    if (!label) continue;
    const slug = slugify(label);
    const entry = bySlug.get(slug) ?? { slug, label, count: 0 };
    entry.count++;
    bySlug.set(slug, entry);
  }
  return [...bySlug.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "es"));
}

export function autoMinGames(maxGames: number): number {
  return Math.max(1, Math.ceil(AUTO_GAMES_SHARE * maxGames - 1e-9));
}

/** Mínimo de partidos que se aplica de verdad. */
export function effectiveMinGames(filters: ExplorerFilters, maxGames: number): number {
  return filters.minGames ?? autoMinGames(maxGames);
}

const inRange = (value: number, range: Range, maxExcluded = false) =>
  (range.min === null || value >= range.min) && (range.max === null || (maxExcluded ? value < range.max : value <= range.max));

type FilterContext = { maxGames: number; conferenceOf: (teamId: number) => string | null };

export function filterRows(rows: ExplorerRow[], filters: ExplorerFilters, { maxGames, conferenceOf }: FilterContext): ExplorerRow[] {
  const minGames = effectiveMinGames(filters, maxGames);
  return rows.filter((row) => {
    const t = row.totals;
    if (t.gp < minGames) return false;
    if (filters.minMinutes > 0 && (!t.gp || t.min == null || roundHalfUp(t.min / t.gp, 1) < filters.minMinutes)) return false;
    if (filters.position && !positionGroups(row.position).has(filters.position)) return false;
    if (filters.team !== null && !row.teamIds.includes(filters.team)) return false;
    if (filters.conference && (row.teamId === null || conferenceOf(row.teamId) !== filters.conference)) return false;
    if (filters.country) {
      const slug = countrySlug(row.country);
      if (filters.country === INTERNATIONAL ? slug === null || slug === USA : slug !== filters.country) return false;
    }
    if (filters.age && (row.age === null || !inRange(row.age, filters.age))) return false;
    if (filters.salary && (row.salary === null || !inRange(row.salary / 1_000_000, filters.salary, true))) return false;
    if (filters.rookies && !row.rookie) return false;
    return true;
  });
}

// ---------- Orden y líderes ----------

export type ExplorerSort = { key: StatKey; dir: "asc" | "desc" };
export const DEFAULT_SORT: ExplorerSort = { key: "pts", dir: "desc" };

/** Clic en una cabecera: la misma columna invierte el orden; otra empieza de mayor a menor. */
export function nextExplorerSort(current: ExplorerSort, key: StatKey): ExplorerSort {
  if (current.key === key) return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  return { key, dir: "desc" };
}

const collator = new Intl.Collator("es", { sensitivity: "base" });

/**
 * Ordena sin mutar. En cualquier sentido van al final los que no tienen dato y, en los porcentajes, los
 * que no llegan al mínimo de la NBA (`qualifiesFor`). Empates: más minutos y después el nombre.
 */
export function sortRows(rows: ExplorerRow[], { key, dir }: ExplorerSort, mode: ExplorerMode, maxGames: number): ExplorerRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return rows
    .map((row) => ({ row, value: statValue(row, key, mode), ok: qualifiesFor(key, row.totals, maxGames) }))
    .sort((a, b) => {
      if (a.ok !== b.ok) return a.ok ? -1 : 1;
      if (a.value !== b.value) {
        if (a.value === null) return 1;
        if (b.value === null) return -1;
        return sign * (a.value - b.value);
      }
      return (b.row.totals.min ?? 0) - (a.row.totals.min ?? 0) || collator.compare(a.row.name, b.row.name);
    })
    .map(({ row }) => row);
}

export const LEADER_STATS: StatKey[] = ["pts", "reb", "ast", "fg3m", "stl", "blk"];

/** Los `n` mejores de una estadística entre los filtrados (con algo que contar y, en %, con el mínimo). */
export function leaders(rows: ExplorerRow[], key: StatKey, mode: ExplorerMode, maxGames: number, n = 3): ExplorerRow[] {
  return sortRows(rows, { key, dir: "desc" }, mode, maxGames)
    .filter((row) => (statValue(row, key, mode) ?? 0) > 0 && qualifiesFor(key, row.totals, maxGames))
    .slice(0, n);
}

// ---------- Estado en la URL ----------

export type ExplorerState = {
  season: string;
  mode: ExplorerMode;
  view: ExplorerView;
  sort: ExplorerSort;
  filters: ExplorerFilters;
};

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

function param(params: Params, name: string): string | undefined {
  const value = params instanceof URLSearchParams ? (params.get(name) ?? undefined) : params[name];
  return Array.isArray(value) ? value[0] : value;
}

function parseInteger(value: string | undefined, min: number, max: number): number | null {
  if (value === undefined || !/^\d{1,3}$/.test(value)) return null;
  const n = Number(value);
  return n >= min && n <= max ? n : null;
}

/** "24-27", "-23" (hasta 23), "30-" (30 o más). Lo que no se entiende, sin filtro. */
export function parseRange(value: string | undefined, max: number): Range | null {
  const match = value?.match(/^(\d{0,3})-(\d{0,3})$/);
  if (!match || (match[1] === "" && match[2] === "")) return null;
  const lo = match[1] === "" ? null : Number(match[1]);
  const hi = match[2] === "" ? null : Number(match[2]);
  if ((lo !== null && lo > max) || (hi !== null && hi > max) || (lo !== null && hi !== null && lo > hi)) return null;
  return { min: lo, max: hi };
}

export function rangeParam(range: Range): string {
  return `${range.min ?? ""}-${range.max ?? ""}`;
}

export function sameRange(a: Range | null, b: Range | null): boolean {
  return a === b || (a !== null && b !== null && a.min === b.min && a.max === b.max);
}

/**
 * Estado del explorador desde la URL (`?temporada=2025-26&modo=por36&posicion=pivot&orden=reb`).
 * Cualquier valor desconocido se ignora: un enlace viejo o mal copiado abre el explorador igual.
 */
export function parseExplorerState(params: Params, { seasons, teamIds }: { seasons: string[]; teamIds: Set<number> }): ExplorerState {
  const season = param(params, "temporada");
  const mode = EXPLORER_MODES.find((m) => m.param !== null && m.param === param(params, "modo"))?.id ?? "game";
  const view = EXPLORER_VIEWS.find((v) => v.param !== null && v.param === param(params, "vista"))?.id ?? "general";
  const order = param(params, "orden");
  const key = isStatKey(order) ? order : DEFAULT_SORT.key;
  const teamValue = Number(param(params, "equipo"));
  const country = param(params, "pais");

  return {
    season: season && seasons.includes(season) ? season : seasons[0],
    mode,
    view,
    sort: { key, dir: param(params, "sentido") === "asc" ? "asc" : "desc" },
    filters: {
      position: POSITION_FILTERS.find((p) => p.param === param(params, "posicion"))?.id ?? null,
      team: Number.isInteger(teamValue) && teamIds.has(teamValue) ? teamValue : null,
      conference: CONFERENCE_FILTERS.find((c) => c.param === param(params, "conferencia"))?.id ?? null,
      country: country && /^[a-z0-9-]{2,40}$/.test(country) ? country : null,
      age: parseRange(param(params, "edad"), 60),
      salary: parseRange(param(params, "salario"), 100),
      rookies: param(params, "rookies") === "1",
      minGames: parseInteger(param(params, "pj"), 0, 82),
      minMinutes: parseInteger(param(params, "min"), 0, 48) ?? DEFAULT_MIN_MINUTES,
    },
  };
}

/** La URL del estado, sin lo que está por defecto: `?modo=totales&orden=reb` (o "" si todo está por defecto). */
export function explorerSearch(state: ExplorerState, currentSeason: string): string {
  const out = new URLSearchParams();
  const { filters: f } = state;
  if (state.season !== currentSeason) out.set("temporada", state.season);
  const mode = EXPLORER_MODES.find((m) => m.id === state.mode)!.param;
  if (mode) out.set("modo", mode);
  const view = EXPLORER_VIEWS.find((v) => v.id === state.view)!.param;
  if (view) out.set("vista", view);
  if (state.sort.key !== DEFAULT_SORT.key) out.set("orden", state.sort.key);
  if (state.sort.dir === "asc") out.set("sentido", "asc");
  if (f.position) out.set("posicion", POSITION_FILTERS.find((p) => p.id === f.position)!.param);
  if (f.team !== null) out.set("equipo", String(f.team));
  if (f.conference) out.set("conferencia", CONFERENCE_FILTERS.find((c) => c.id === f.conference)!.param);
  if (f.country) out.set("pais", f.country);
  if (f.age) out.set("edad", rangeParam(f.age));
  if (f.salary) out.set("salario", rangeParam(f.salary));
  if (f.rookies) out.set("rookies", "1");
  if (f.minGames !== null) out.set("pj", String(f.minGames));
  if (f.minMinutes !== DEFAULT_MIN_MINUTES) out.set("min", String(f.minMinutes));
  const query = out.toString();
  return query ? `?${query}` : "";
}

// ---------- Textos ----------

/** "23 o menos", "24 a 27", "32 o más" (también para rangos escritos a mano en la URL). */
export function ageLabel(range: Range): string {
  if (range.min === null) return `${range.max} años o menos`;
  if (range.max === null) return `${range.min} años o más`;
  return range.min === range.max ? `${range.min} años` : `De ${range.min} a ${range.max} años`;
}

export function salaryLabel(range: Range): string {
  if (range.min === null) return `Menos de ${range.max} M$`;
  if (range.max === null) return `${range.min} M$ o más`;
  return `De ${range.min} a ${range.max} M$`;
}

/**
 * Los filtros activos en palabras, sin los mínimos ("Pívots · Lakers · España · Rookies"): resumen en el
 * móvil y subtítulo de la tarjeta para redes.
 */
export function filterLabels(
  filters: ExplorerFilters,
  { teamName, countryName }: { teamName: (id: number) => string | undefined; countryName: (slug: string) => string | undefined }
): string[] {
  const out: string[] = [];
  if (filters.position) out.push(POSITION_FILTERS.find((p) => p.id === filters.position)!.plural);
  if (filters.team !== null) out.push(teamName(filters.team) ?? "Un equipo");
  if (filters.conference) out.push(`Conferencia ${CONFERENCE_FILTERS.find((c) => c.id === filters.conference)!.label}`);
  if (filters.country === INTERNATIONAL) out.push("Internacionales");
  else if (filters.country) out.push(countryName(filters.country) ?? slugLabel(filters.country));
  if (filters.rookies) out.push("Rookies");
  if (filters.age) out.push(ageLabel(filters.age));
  if (filters.salary) out.push(`Salario: ${salaryLabel(filters.salary).replace(/^./, (c) => c.toLowerCase())}`);
  return out;
}

/** "Mín. 7 partidos y 15 min por partido" / "Todos los jugadores". */
export function minimumLabel(filters: ExplorerFilters, maxGames: number): string {
  const games = effectiveMinGames(filters, maxGames);
  const parts = [games > 1 ? `${games} partidos` : null, filters.minMinutes > 0 ? `${filters.minMinutes} min por partido` : null].filter(Boolean);
  return parts.length ? `Mín. ${parts.join(" y ")}` : "Sin mínimo de partidos ni de minutos";
}

/** Nº de filtros cambiados respecto a los de por defecto (insignia del botón "Filtros"). */
export function activeFilterCount(filters: ExplorerFilters): number {
  const d = DEFAULT_FILTERS;
  return [
    filters.position !== d.position,
    filters.team !== d.team,
    filters.conference !== d.conference,
    filters.country !== d.country,
    filters.age !== null,
    filters.salary !== null,
    filters.rookies,
    filters.minGames !== null,
    filters.minMinutes !== d.minMinutes,
  ].filter(Boolean).length;
}

/** País sin jugadores esa temporada (no está en las opciones): "bosnia-y-herzegovina" → "Bosnia y Herzegovina". */
export function slugLabel(slug: string): string {
  const words = slug.split("-");
  return words.map((w, i) => (i > 0 && (w === "y" || w === "de" || w === "del") ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
}
