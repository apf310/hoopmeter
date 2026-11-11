import type { Team } from "@/lib/supabase";

const FALLBACK_ACCENT = "#94a3b8";

/** Luminancia relativa (WCAG) de un color `#RRGGBB`. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

type TeamColors = Pick<Team, "primary_color" | "secondary_color">;

/** Colores de la franquicia que se ven sobre fondo oscuro, por orden de preferencia. */
function visibleColors(team: TeamColors): string[] {
  return [team.primary_color, team.secondary_color].filter(
    (c): c is string => !!c && /^#[0-9a-f]{6}$/i.test(c) && luminance(c) > 0.06
  );
}

/**
 * Color del equipo que se distingue sobre fondo oscuro (franjas, acentos):
 * el primario si es visible; si no (negro, azul marino…), el secundario.
 */
export function teamAccent(team: TeamColors): string {
  return visibleColors(team)[0] ?? FALLBACK_ACCENT;
}

/** `#RRGGBB` → OKLab, el espacio donde la distancia entre dos colores es la que percibe el ojo. */
function oklab(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Diferencia perceptual (ΔE OKLab × 100): por debajo de 15 dos colores se confunden. */
function deltaE(a: string, b: string): number {
  const [l1, a1, b1] = oklab(a);
  const [l2, a2, b2] = oklab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2) * 100;
}

const MIN_DELTA_E = 15;
// Último recurso si ningún color de franquicia se distingue: blanco y, si el local ya es claro, el naranja de la app
const FALLBACK_OPTIONS = ["#e2e8f0", "#f97316"];

/**
 * Acentos de los dos equipos de un partido (gráficos, barras, mapa de tiro). Si se confunden
 * (p. ej. dos azules), el visitante usa su otro color de franquicia o, si tampoco basta, uno neutro.
 */
export function matchupAccents(away: TeamColors, home: TeamColors): { away: string; home: string } {
  const homeAccent = teamAccent(home);
  const options = [...visibleColors(away), ...FALLBACK_OPTIONS];
  return { away: options.find((c) => deltaE(c, homeAccent) >= MIN_DELTA_E) ?? FALLBACK_OPTIONS[1], home: homeAccent };
}
