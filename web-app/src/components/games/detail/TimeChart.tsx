"use client";

// Piezas comunes de los gráficos con el tiempo de partido en el eje (flujo y probabilidad de victoria).
import { useState, type KeyboardEvent, type PointerEvent } from "react";
import { periodChip, periodStarts } from "@/lib/game-format";
import { cn } from "@/lib/utils";

// Unidades internas del SVG: se estira a lo ancho (las líneas mantienen 2 px con non-scaling-stroke)
export const CHART_W = 1000;
export const CHART_H = 240;
export const CHART_MID = CHART_H / 2;

type TimePoint = readonly [seconds: number, ...rest: unknown[]];

/** Último punto en el instante `seconds` (los valores cambian a saltos). */
export function indexAt(points: readonly TimePoint[], seconds: number): number {
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (points[mid][0] <= seconds) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Cruceta: instante señalado con ratón, dedo o flechas (de canasta en canasta). null = ninguno. `from` = primer segundo a la vista. */
export function useTimeCursor(points: readonly TimePoint[], length: number, elapsed: number, from = 0) {
  const [hover, setHover] = useState<number | null>(null);

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    setHover(Math.min(from + fraction * (length - from), elapsed));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = hover === null ? points.length - 1 : indexAt(points, hover);
    const next =
      event.key === "ArrowRight" ? current + 1 : event.key === "ArrowLeft" ? current - 1 : event.key === "Home" ? 0 : event.key === "End" ? points.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    setHover(Math.max(from, points[Math.min(points.length - 1, Math.max(0, next))][0]));
  }

  return {
    hover,
    setHover,
    handlers: {
      onPointerMove,
      onPointerDown: onPointerMove,
      // Con el dedo la lectura se queda al soltar (se quita al tocar fuera)
      onPointerLeave: (event: PointerEvent<HTMLDivElement>) => event.pointerType === "mouse" && setHover(null),
      onKeyDown,
      onBlur: () => setHover(null),
    },
  };
}

/** Divisiones entre periodos, dentro del SVG (filetes sólidos, recesivos). */
export function PeriodLines({ length, regulation, from = 0 }: { length: number; regulation: number; from?: number }) {
  const starts = periodStarts(length, regulation).filter((s) => s > from);
  return starts.map((s) => (
    <line
      key={s}
      x1={((s - from) / (length - from)) * CHART_W}
      x2={((s - from) / (length - from)) * CHART_W}
      y1={0}
      y2={CHART_H}
      stroke="#334155"
      strokeWidth={1}
      vectorEffect="non-scaling-stroke"
    />
  ));
}

export function PeriodAxis({ length, regulation, from = 0 }: { length: number; regulation: number; from?: number }) {
  const bounds = [0, ...periodStarts(length, regulation), length];
  return (
    <div className="relative mt-1.5 h-4">
      {bounds.slice(0, -1).map(
        (start, i) =>
          bounds[i + 1] > from && (
            <span
              key={start}
              className="absolute -translate-x-1/2 font-display text-xs font-semibold uppercase tracking-wider text-slate-400"
              style={{ left: `${(((Math.max(start, from) + bounds[i + 1]) / 2 - from) / (length - from)) * 100}%` }}
            >
              {i < regulation ? `${periodChip(i + 1, regulation)}.º` : periodChip(i + 1, regulation)}
            </span>
          )
      )}
    </div>
  );
}

/** Punto sobre la línea, en HTML: no se deforma al estirar el SVG. `left` y `top` de 0 a 1. */
export function ChartMarker({
  left,
  top,
  color,
  label,
  below,
  big,
}: {
  left: number;
  top: number;
  color: string;
  label?: string;
  below?: boolean;
  big?: boolean;
}) {
  return (
    <span className="pointer-events-none absolute" style={{ left: `${left * 100}%`, top: `${top * 100}%` }}>
      {/* Punto con anillo del color del fondo: se lee aunque cruce la línea */}
      <span
        className={cn("absolute -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-slate-950", big ? "size-3.5" : "size-2.5")}
        style={{ background: color }}
      />
      {label && (
        <span
          className={cn("absolute -translate-x-1/2 whitespace-nowrap font-display text-xs font-bold text-white tabular-nums", below ? "top-2" : "bottom-2")}
        >
          {label}
        </span>
      )}
    </span>
  );
}
