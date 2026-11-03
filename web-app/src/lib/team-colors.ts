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

/**
 * Color del equipo que se distingue sobre fondo oscuro (franjas, acentos):
 * el primario si es visible; si no (negro, azul marino…), el secundario.
 */
export function teamAccent(team: Pick<Team, "primary_color" | "secondary_color">): string {
  const candidates = [team.primary_color, team.secondary_color].filter(
    (c): c is string => !!c && /^#[0-9a-f]{6}$/i.test(c)
  );
  return candidates.find((c) => luminance(c) > 0.06) ?? FALLBACK_ACCENT;
}
