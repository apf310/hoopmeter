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

/** OKLab → `#rrggbb`, o null si el color cae fuera de sRGB. */
function fromOklab(L: number, a: number, b: number): string | null {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  if (linear.some((c) => c < -1e-4 || c > 1 + 1e-4)) return null;
  return `#${linear
    .map((c) => {
      const v = Math.min(1, Math.max(0, c));
      const encoded = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
      return Math.round(encoded * 255).toString(16).padStart(2, "0");
    })
    .join("")}`;
}

/** El color con luminosidad L y croma C (mismo tono); si no cabe en sRGB, baja el croma hasta que cabe. */
function withLightnessChroma(hex: string, L: number, C: number): string {
  const [, a, b] = oklab(hex);
  const hue = Math.atan2(b, a);
  for (let c = C; c > 0.005; c *= 0.96) {
    const color = fromOklab(L, c * Math.cos(hue), c * Math.sin(hue));
    if (color) return color;
  }
  return fromOklab(L, 0, 0) ?? hex;
}

// Acentos sobre el fondo oscuro (Tarea 6.20): con menos luz o menos color que esto, una barra
// parece vacía o desactivada (el azul grisáceo de Memphis junto al amarillo de Golden State)
const MIN_ACCENT_L = 0.6;
const MIN_ACCENT_C = 0.12;
// Por debajo de este croma el color es un gris de verdad (plata, blanco): se queda gris
const GRAY_C = 0.04;

/** Sube la luz y el color de un acento apagado sin cambiarle el tono; si ya se ve bien, lo deja igual. */
function liftForDark(hex: string): string {
  const [L, a, b] = oklab(hex);
  const C = Math.hypot(a, b);
  const targetC = C < GRAY_C ? C : Math.max(C, MIN_ACCENT_C);
  if (L >= MIN_ACCENT_L && targetC === C) return hex;
  return withLightnessChroma(hex, Math.max(L, MIN_ACCENT_L), targetC);
}

/**
 * Color del equipo que se distingue sobre fondo oscuro (franjas, acentos, barras):
 * el primario si es visible; si no (negro, azul marino…), el secundario. Si es apagado, con más luz y color.
 */
export function teamAccent(team: TeamColors): string {
  return liftForDark(visibleColors(team)[0] ?? FALLBACK_ACCENT);
}

const WHITE_TEXT_CONTRAST = 4.5;

/**
 * Color de fondo de las cabeceras con texto blanco encima (degradado del primario): un primario claro
 * (la plata de los Spurs) se oscurece, sin cambiar el tono, hasta que el blanco se lee (contraste 4,5:1).
 */
export function teamBackdrop(color: string | null | undefined, fallback = "#334155"): string {
  const hex = color && /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
  const whiteContrast = (c: string) => 1.05 / (luminance(c) + 0.05);
  if (whiteContrast(hex) >= WHITE_TEXT_CONTRAST) return hex;
  const [L, a, b] = oklab(hex);
  const C = Math.hypot(a, b);
  for (let l = L; l > 0.1; l -= 0.01) {
    const darker = withLightnessChroma(hex, l, C);
    if (whiteContrast(darker) >= WHITE_TEXT_CONTRAST) return darker;
  }
  return fallback;
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
  const options = [...visibleColors(away).map(liftForDark), ...FALLBACK_OPTIONS];
  return { away: options.find((c) => deltaE(c, homeAccent) >= MIN_DELTA_E) ?? FALLBACK_OPTIONS[1], home: homeAccent };
}
