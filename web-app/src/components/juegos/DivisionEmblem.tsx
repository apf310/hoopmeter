import { useId } from "react";
import { cn } from "@/lib/utils";

/** Colores de cada división (claro y oscuro del degradado): de cartón a púrpura, como los materiales de las cartas. */
export const DIVISION_COLORS: Record<string, { light: string; dark: string; text: string }> = {
  rookie: { light: "#cbd5e1", dark: "#475569", text: "text-slate-300" },
  "sexto-hombre": { light: "#f0a868", dark: "#8a4a1c", text: "text-orange-300" },
  titular: { light: "#f1f5f9", dark: "#7c8ba1", text: "text-slate-100" },
  "all-star": { light: "#fde68a", dark: "#b7791f", text: "text-amber-300" },
  mvp: { light: "#a5f3fc", dark: "#0e7490", text: "text-cyan-300" },
  "hall-of-fame": { light: "#e9d5ff", dark: "#7e22ce", text: "text-purple-300" },
};

/**
 * Insignia de una división (Juegos): escudo hexagonal propio con un balón y tantas marcas como su puesto (1 Rookie …
 * 6 Hall of Fame). Sin logos ni marcas de nadie. `dim`: aún no alcanzada.
 */
export function DivisionEmblem({ id, rank, className, dim = false }: { id: string; rank: number; className?: string; dim?: boolean }) {
  const uid = useId().replace(/:/g, "");
  const color = DIVISION_COLORS[id] ?? DIVISION_COLORS.rookie;
  const fill = `url(#g${uid})`;
  // Marcas del puesto, centradas bajo el balón
  const pips = Array.from({ length: rank }, (_, i) => 50 + (i - (rank - 1) / 2) * 8.5);
  return (
    <svg viewBox="0 0 100 112" aria-hidden className={cn("shrink-0", dim && "opacity-30 grayscale", className)}>
      <defs>
        <linearGradient id={`g${uid}`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor={color.light} />
          <stop offset="1" stopColor={color.dark} />
        </linearGradient>
      </defs>
      <polygon points="50,3 95,28 95,84 50,109 5,84 5,28" fill={fill} />
      <polygon points="50,12 87,33 87,79 50,100 13,79 13,33" fill="#020617" fillOpacity="0.82" />
      {/* Hall of Fame: corona de tres puntas encima */}
      {id === "hall-of-fame" && <path d="M34 20 L40 9 L50 17 L60 9 L66 20 Z" fill={fill} />}
      <circle cx="50" cy="51" r="21" fill={fill} />
      <g fill="none" stroke="#020617" strokeWidth="2.4" strokeLinecap="round" opacity="0.75">
        <path d="M29 51 H71" />
        <path d="M50 30 V72" />
        <path d="M35 36 Q46 51 35 66" />
        <path d="M65 36 Q54 51 65 66" />
      </g>
      {pips.map((x, i) => (
        <rect key={i} x={x - 2.6} y="80" width="5.2" height="5.2" transform={`rotate(45 ${x} 82.6)`} fill={fill} />
      ))}
    </svg>
  );
}
