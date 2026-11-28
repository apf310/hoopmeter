import { RADAR_KEYS, type Radar } from "@/lib/adivina";
import { RADAR_LABEL, RATING_MIDDLE, ratingShare, tierOf } from "@/lib/player-profile";
import { cn } from "@/lib/utils";

const W = 400;
const H = 312;
const CX = W / 2;
const CY = 160;
const R = 100;
const RINGS = [0.25, 0.5, 0.75, 1];

/** Vértice del eje `i` (el primero arriba y en el sentido del reloj, como el radar de la ficha) a `share` del centro. */
function point(i: number, share: number): [number, number] {
  const angle = ((-90 + 60 * i) * Math.PI) / 180;
  return [CX + R * share * Math.cos(angle), CY + R * share * Math.sin(angle)];
}

const polygon = (shares: readonly number[]) => shares.map((s, i) => point(i, s).map((n) => n.toFixed(1)).join(",")).join(" ");

/** Dónde va la etiqueta de cada eje: arriba, a los lados o debajo del vértice. */
function labelAt(i: number): { x: number; y: number; anchor: "start" | "middle" | "end" } {
  const [x, y] = point(i, 1);
  if (i === 0) return { x, y: y - 34, anchor: "middle" };
  if (i === 3) return { x, y: y + 18, anchor: "middle" };
  return { x: x + (i < 3 ? 12 : -12), y: y - 12, anchor: i < 3 ? "start" : "end" };
}

/**
 * Adivina el jugador (Tarea 8.3): el radar del jugador del día sin nombre ni colores de equipo (todo en naranja), con
 * la misma escala que la ficha (40 en el centro, 99 en el borde) y la mitad de la rotación de referencia.
 */
export function RadarHuella({ radar, className }: { radar: Radar; className?: string }) {
  const shares = RADAR_KEYS.map((k) => ratingShare(radar[k]));
  const middle = RADAR_KEYS.map(() => ratingShare(RATING_MIDDLE));
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Radar del jugador del día: ${RADAR_KEYS.map((k) => `${RADAR_LABEL[k]} ${radar[k]}`).join(", ")}`}
      className={cn("h-auto w-full", className)}
    >
      <g fill="none" stroke="#334155" strokeOpacity={0.8}>
        {RINGS.map((ring) => (
          <polygon key={ring} points={polygon(RADAR_KEYS.map(() => ring))} />
        ))}
        {RADAR_KEYS.map((k, i) => {
          const [x, y] = point(i, 1);
          return <line key={k} x1={CX} y1={CY} x2={x} y2={y} />;
        })}
      </g>
      <polygon points={polygon(middle)} fill="none" stroke="#94a3b8" strokeDasharray="4 4" strokeWidth={1.5} />
      {/* La huella: entra creciendo desde el centro */}
      <g className="origin-[200px_160px] animate-in fade-in zoom-in-50 duration-500 ease-out motion-reduce:animate-none">
        <polygon points={polygon(shares)} fill="#f97316" fillOpacity={0.32} stroke="#fb923c" strokeWidth={2.5} strokeLinejoin="round" />
        {shares.map((s, i) => {
          const [x, y] = point(i, s);
          return <circle key={RADAR_KEYS[i]} cx={x} cy={y} r={3.5} fill="#fb923c" />;
        })}
      </g>
      {RADAR_KEYS.map((k, i) => {
        const { x, y, anchor } = labelAt(i);
        return (
          <text key={k} x={x} y={y} textAnchor={anchor} className="font-display uppercase">
            <tspan x={x} fontSize={12} fontWeight={600} letterSpacing="0.08em" fill="#cbd5e1">
              {RADAR_LABEL[k]}
            </tspan>
            <tspan x={x} dy={22} fontSize={22} fontWeight={800} fill={tierOf(radar[k]).color}>
              {radar[k]}
            </tspan>
          </text>
        );
      })}
    </svg>
  );
}
