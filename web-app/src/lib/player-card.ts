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
export type LegendCounts = Partial<Record<LegendAward, number>>;

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

/** Inclinación y punto de luz para un toque en (x, y), de 0 a 1 dentro de la ficha (fuera, se queda en el borde). */
export function tiltAt(x: number, y: number): { rx: number; ry: number; mx: number; my: number; on: number } {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const [cx, cy] = [clamp(x), clamp(y)];
  return { rx: (0.5 - cy) * 22, ry: (cx - 0.5) * 26, mx: cx * 100, my: cy * 100, on: 1 };
}

/** En reposo: de frente y sin brillo. */
export const TILT_REST = { rx: 0, ry: 0, mx: 50, my: 35, on: 0 };
