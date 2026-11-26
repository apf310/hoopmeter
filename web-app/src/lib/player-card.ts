// Fichas 3D de jugador (Tarea 7.4): nivel, textos y tamaños. Puro y sin dependencias: se prueba con `npm test`.
// El nivel sale de la media (solo cambia en el job diario), así que se ve en los tres niveles de spoilers.
import { ratingLevel } from "./player-rating.ts";

/** Material de la ficha: oro, refractor, onda esmeralda, zafiro o cartón con parquet. */
export type CardTier = "legend" | "elite" | "great" | "good" | "base";

/**
 * Mismos cortes que `tierOf` (`ratingLevel`, Tarea 7.10): 84+ refractor, 70-83 esmeralda, 55-69 zafiro y
 * menos de 55 cartón, igual que quien aún no ha jugado esta temporada (sin media).
 */
export function cardTier(isActive: boolean, overall: number | null): CardTier {
  if (!isActive) return "legend";
  if (overall === null) return "base";
  const level = ratingLevel(overall);
  return level === "low" ? "base" : level;
}

/** Premios que caben en la ficha de una leyenda: claves de `trophyCounts` (components/trophies/trophy-catalog.ts). */
export const LEGEND_AWARDS = {
  champion: "NBA Champion",
  mvp: "NBA Most Valuable Player",
  fmvp: "NBA Finals Most Valuable Player",
  allstar: "NBA All-Star",
} as const;

type LegendAward = keyof typeof LEGEND_AWARDS;
/** Además, para su huella (Tarea 7.11): quintetos All-NBA y Defensivos ("All-NBA 1st Team"...). */
export const LEGEND_TEAM_AWARDS = { allnba: "All-NBA", alldef: "All-Defensive" } as const;
export type LegendCounts = Partial<Record<LegendAward | keyof typeof LEGEND_TEAM_AWARDS, number>>;

const LEGEND_LABEL: Record<LegendAward, [one: string, many: string]> = {
  champion: ["anillo", "anillos"],
  mvp: ["MVP", "MVP"],
  fmvp: ["MVP de Finales", "MVP de Finales"],
  allstar: ["All-Star", "All-Star"],
};

/** Sus dos mayores logros: "6 anillos · 5 MVP". Vacío si no tiene ninguno de los cuatro. */
export function legendLine(counts: LegendCounts): string {
  return (Object.keys(LEGEND_LABEL) as LegendAward[])
    .filter((key) => counts[key])
    .slice(0, 2)
    .map((key) => `${counts[key]} ${LEGEND_LABEL[key][counts[key] === 1 ? 0 : 1]}`)
    .join(" · ");
}

/** Orden de la tira de leyendas: primero los más laureados. */
export function legendWeight(counts: LegendCounts): number {
  return (counts.mvp ?? 0) * 4 + (counts.fmvp ?? 0) * 2 + (counts.champion ?? 0) * 2 + (counts.allstar ?? 0);
}

export function splitName(fullName: string): { first: string; last: string } {
  const [first, ...rest] = fullName.trim().split(/\s+/);
  return rest.length ? { first, last: rest.join(" ") } : { first: "", last: first };
}

/** Letra del apellido, en % del ancho de la ficha, para que quepa en una línea (Barlow Condensed ≈ 0,49 em por letra). */
export function surnameSize(surname: string, tier: CardTier): number {
  const [max, width] = tier === "legend" ? [16.5, 78] : tier === "base" ? [14.6, 82] : [14.6, 65];
  return Math.round(Math.min(max, width / (surname.length * 0.49)) * 10) / 10;
}

// ---------------------------------------------------------------- sellos (Tarea 7.11)

/**
 * Sellos de la carta: solo hechos conocidos que no dependen de ningún partido (premios cargados a mano, draft,
 * país). Rookie con "RC" y el año, Los Nuestros, MVP vigente, campeón y All-Star (con cuántas veces).
 */
export type CardSeal =
  | { kind: "rookie"; year: number }
  | { kind: "spain" }
  | { kind: "mvp"; count: number }
  | { kind: "ring"; count: number }
  | { kind: "star"; count: number };

export const SEAL_LABEL: Record<CardSeal["kind"], string> = {
  rookie: "Rookie",
  spain: "Los Nuestros",
  mvp: "MVP",
  ring: "Campeón",
  star: "All-Star",
};

/** Más no caben en el lateral de la carta sin tapar la foto. */
export const MAX_SEALS = 3;

const AWARD = { mvp: "NBA Most Valuable Player", champion: "NBA Champion", allstar: "NBA All-Star" } as const;

type SealInput = {
  active: boolean;
  /** Año de su temporada de rookie (2026 = 2026-27), o null si no lo es. */
  rookieYear: number | null;
  spanish: boolean;
  awards: readonly { award_name: string; season: string | null }[];
  /** Temporada del último MVP entregado en toda la liga ("2025-26"): el "vigente". */
  latestMvpSeason: string | null;
};

/**
 * Sellos en orden (RC, Los Nuestros, MVP, campeón, All-Star) y como mucho `MAX_SEALS`. En activo, el de MVP solo
 * lo lleva el MVP vigente (con todos los que tiene dentro); en las leyendas, cualquiera que lo ganara.
 */
export function cardSeals({ active, rookieYear, spanish, awards, latestMvpSeason }: SealInput): CardSeal[] {
  const count = (name: string) => awards.filter((a) => a.award_name === name).length;
  const mvps = count(AWARD.mvp);
  const reigning = latestMvpSeason !== null && awards.some((a) => a.award_name === AWARD.mvp && a.season === latestMvpSeason);
  const seals: CardSeal[] = [];
  if (active && rookieYear !== null) seals.push({ kind: "rookie", year: rookieYear });
  if (spanish) seals.push({ kind: "spain" });
  if (mvps > 0 && (!active || reigning)) seals.push({ kind: "mvp", count: mvps });
  const rings = count(AWARD.champion);
  if (rings > 0) seals.push({ kind: "ring", count: rings });
  const stars = count(AWARD.allstar);
  if (stars > 0) seals.push({ kind: "star", count: stars });
  return seals.slice(0, MAX_SEALS);
}

/** "2026-27" → 2026 */
export const seasonStartYear = (season: string) => Number(season.slice(0, 4));

type CareerRow = { season_id: string; season_type: string; games_played: number | null };

/**
 * Rookie de la temporada `season`: del draft de ese verano o, si no fue elegido o llegó más tarde, sin partidos
 * antes (su carrera, que solo se escribe con el historial completo, tiene los mismos partidos que esta temporada).
 */
export function rookieYear(player: { is_active: boolean; draft_year: number | null }, career: readonly CareerRow[], season: string): number | null {
  if (!player.is_active) return null;
  const year = seasonStartYear(season);
  if (player.draft_year === year) return year;
  const regular = career.filter((r) => r.season_type === "Regular Season");
  const now = regular.find((r) => r.season_id === season);
  const total = regular.find((r) => r.season_id === "Career");
  const earlier = regular.some((r) => r.season_id !== "Career" && r.season_id < season);
  if (now?.games_played && total && !earlier && total.games_played === now.games_played) return year;
  return null;
}

// ---------------------------------------------------------------- reverso (Tarea 7.11)

/** Fila de temporadas del reverso: temporada, equipo, partidos, puntos, rebotes y asistencias. */
export type CardBackRow = [season: string, team: string, games: number, pts: number, reb: number, ast: number];

/** Lo que pinta el reverso, ya calculado en el servidor (solo cifras del job diario: nada del último partido). */
export type CardBack = {
  /** "2.03 m · 27 años · Draft 2018 · n.º 3" */
  bio: string;
  /** Radar (activos, 40-99) o palmarés (leyendas, veces): seis etiquetas y seis cifras. */
  labels: string[];
  values: number[];
  rows: CardBackRow[];
  /** Hasta tres líneas del palmarés: "6 × MVP". */
  honours: string[];
};

export const HONOUR_LABELS = ["Anillos", "MVP", "MVP Finales", "All-NBA", "All-Def.", "All-Star"];

type BackSeason = CareerRow & { team_id: number | null; pts: number | null; reb: number | null; ast: number | null; team?: string | null };

/**
 * Temporadas del reverso: en activo, las cuatro últimas; en una leyenda, sus tres mejores por puntos y la carrera.
 * `abbreviation` da las siglas del equipo de cada fila (las de traspaso, "TOT").
 */
export function backRows(career: readonly BackSeason[], active: boolean, abbreviation: (row: BackSeason) => string): CardBackRow[] {
  const regular = career.filter((r) => r.season_type === "Regular Season" && r.games_played);
  const seasons = regular.filter((r) => r.season_id !== "Career").sort((a, b) => a.season_id.localeCompare(b.season_id));
  const row = (r: BackSeason, label = r.season_id, team = abbreviation(r)): CardBackRow => [label, team, r.games_played ?? 0, r.pts ?? 0, r.reb ?? 0, r.ast ?? 0];
  if (active) return seasons.slice(-4).map((r) => row(r));
  const best = [...seasons]
    .sort((a, b) => (b.pts ?? 0) - (a.pts ?? 0))
    .slice(0, 3)
    .sort((a, b) => a.season_id.localeCompare(b.season_id));
  const total = regular.find((r) => r.season_id === "Career");
  return [...best.map((r) => row(r)), ...(total ? [row(total, "Carrera", "")] : [])];
}

/**
 * Todo lo que necesita la carta 3D (inspector, imagen y vídeo), sin Three.js: viaja en el HTML de la ficha, así que
 * solo lleva lo que se pinta y nada que cambie con un partido (atributos, promedios y premios: job diario o a mano).
 */
export type CardSpec = {
  id: number;
  tier: CardTier;
  name: string;
  /** Arquetipo, en las leyendas su palmarés y, si no hay, la posición. */
  line: string;
  position: string | null;
  /** Media de 40 a 99; null = aún sin partidos ("–"); ausente en las leyendas. */
  overall?: number | null;
  /** Colores ya preparados: `c1` de fondo (teamBackdrop) y `c2` de acento (teamAccent). */
  team: { id: number; c1: string; c2: string } | null;
  huella: number[] | null;
  seals: CardSeal[];
  back: CardBack;
};

/** Grupo del palmarés tal como lo ordena la vitrina (de más a menos prestigioso). */
type HonourGroup = { label: string; count: number };

/** "6 × Campeón de la NBA", "Rookie del Año": los tres primeros de la vitrina. */
export function backHonours(groups: readonly HonourGroup[]): string[] {
  return groups.slice(0, 3).map((g) => (g.count > 1 ? `${g.count} × ${g.label}` : g.label));
}

/** Inclinación y punto de luz para un toque en (x, y), de 0 a 1 dentro de la ficha (fuera, se queda en el borde). */
export function tiltAt(x: number, y: number): { rx: number; ry: number; mx: number; my: number; on: number } {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const [cx, cy] = [clamp(x), clamp(y)];
  return { rx: (0.5 - cy) * 22, ry: (cx - 0.5) * 26, mx: cx * 100, my: cy * 100, on: 1 };
}

/** En reposo: de frente y sin brillo. */
export const TILT_REST = { rx: 0, ry: 0, mx: 50, my: 35, on: 0 };
