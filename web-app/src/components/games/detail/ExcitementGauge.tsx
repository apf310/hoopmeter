"use client";

import { useEffect, useRef, useState } from "react";
import {
  GAUGE_CENTER,
  GAUGE_MAX,
  GAUGE_MIN,
  GAUGE_RADIUS,
  GAUGE_TONE_COLORS,
  GAUGE_VIEWBOX,
  GAUGE_ZONES,
  arcPath,
  clampScore,
  filledZones,
  gaugeFrame,
  gaugeLashes,
  needleRotation,
} from "@/lib/excitement-gauge";
import { formatExcitementScore, getExcitementTone } from "@/lib/spoilers";
import { cn } from "@/lib/utils";

const { x: CX, y: CY } = GAUGE_CENTER;
const LASHES = gaugeLashes(GAUGE_RADIUS + 13, GAUGE_RADIUS + 24);
const TRACK = GAUGE_ZONES.map((zone) => ({ tone: zone.tone, d: arcPath(zone.from, zone.to) }));
/** Aguja apuntando al 1,0 (a la izquierda); se gira alrededor del balón. */
const NEEDLE = `M${CX - GAUGE_RADIUS + 8} ${CY}L${CX - 2} ${CY - 4.5}L${CX + 14} ${CY - 2}L${CX + 14} ${CY + 2}L${CX - 2} ${CY + 4.5}Z`;
/** El balón del logo (radio 70 en `assets/logo.svg`) a la escala del eje. */
const BALL_SCALE = 15 / 70;

const SIZES = {
  lg: { svg: "w-48 md:w-72", number: "text-5xl md:text-7xl", gap: "-mt-1 md:-mt-2" },
  sm: { svg: "w-32 md:w-40", number: "text-3xl md:text-4xl", gap: "-mt-0.5" },
} as const;

type ExcitementGaugeProps = {
  /** Solo la nota, nunca el partido: así el velocímetro no puede delatar nada más. */
  score: number | null;
  size?: keyof typeof SIZES;
  className?: string;
};

/**
 * Velocímetro de la nota (Tarea 7.1): el arco con las pestañas del logo como marcas, el balón como eje y una
 * aguja que sube hasta la nota en un tiempo fijo (el mismo para cualquier nota). Para las listas, `PureScoreBadge`.
 */
export function ExcitementGauge({ score, size = "lg", className }: ExcitementGaugeProps) {
  const { needle, label } = useGaugeAnimation(score);
  const pending = score === null || Number.isNaN(score);
  const finalTone = getExcitementTone(score);
  const glow = GAUGE_TONE_COLORS[finalTone];
  const labelTone = pending ? "pending" : getExcitementTone(label);
  const rotation = needleRotation(needle);
  const sizes = SIZES[size];

  return (
    <div
      role="img"
      aria-label={pending ? "Nota pendiente" : `Nota del partido: ${formatExcitementScore(score)} sobre 10`}
      className={cn("flex flex-col items-center", className)}
    >
      <svg aria-hidden viewBox={`0 0 ${GAUGE_VIEWBOX.width} ${GAUGE_VIEWBOX.height}`} className={cn("h-auto overflow-visible", sizes.svg)}>
        {/* Escala completa, apagada (sobre un fondo oscuro para que se lea encima de cualquier escudo) */}
        <path d={arcPath(GAUGE_MIN, GAUGE_MAX)} fill="none" stroke="#020617" strokeOpacity="0.55" strokeWidth="18" />
        <g fill="none" strokeWidth="12" opacity="0.3">
          {TRACK.map((zone) => (
            <path key={zone.tone} d={zone.d} stroke={GAUGE_TONE_COLORS[zone.tone]} />
          ))}
        </g>
        {/* Lo recorrido por la aguja, encendido */}
        {!pending && (
          <g fill="none" strokeWidth="12" style={{ filter: `drop-shadow(0 0 6px ${glow}99)` }}>
            {filledZones(needle).map((zone) => (
              <path key={zone.tone} d={zone.d} stroke={GAUGE_TONE_COLORS[zone.tone]} />
            ))}
          </g>
        )}
        {/* Pestañas del logo: se encienden al pasar la aguja */}
        <g strokeLinecap="round" strokeWidth="6">
          {LASHES.map((lash) => {
            const lit = !pending && needle >= lash.value - 1e-6;
            return (
              <line
                key={lash.value}
                x1={lash.x1}
                y1={lash.y1}
                x2={lash.x2}
                y2={lash.y2}
                stroke={lit ? GAUGE_TONE_COLORS[lash.tone] : "#475569"}
              />
            );
          })}
        </g>
        <g className="font-display" fontSize="12" fontWeight="700" fill="#cbd5e1" textAnchor="middle">
          <text x={CX - GAUGE_RADIUS} y={CY + 16}>1</text>
          <text x={CX + GAUGE_RADIUS} y={CY + 16}>10</text>
        </g>
        {/* Aguja y balón, que gira con ella */}
        <g transform={`rotate(${rotation} ${CX} ${CY})`}>
          <path d={NEEDLE} fill={pending ? "#64748b" : "#f8fafc"} style={{ filter: "drop-shadow(0 1px 2px rgb(0 0 0 / 0.6))" }} />
          <g transform={`translate(${CX} ${CY}) scale(${BALL_SCALE}) translate(-256 -172)`}>
            <circle cx="256" cy="172" r="70" fill={pending ? "#64748b" : "#f97316"} />
            <g fill="none" stroke="#020617" strokeWidth="8.4" strokeLinecap="round">
              <path d="M186 172h140" />
              <path d="M256 102v140" />
              <path d="M212.6 117.4c18.2 15.4 26.6 33.6 26.6 54.6s-8.4 39.2-26.6 54.6" />
              <path d="M299.4 117.4c-18.2 15.4-26.6 33.6-26.6 54.6s8.4 39.2 26.6 54.6" />
            </g>
          </g>
        </g>
      </svg>
      <span
        aria-hidden
        className={cn("font-display font-extrabold leading-none tabular-nums", sizes.number, sizes.gap)}
        style={{ color: pending ? "#64748b" : GAUGE_TONE_COLORS[labelTone] }}
      >
        {pending ? "–" : formatExcitementScore(label)}
      </span>
    </div>
  );
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Sube la aguja y la cifra desde donde estén (al montar, desde el 1,0) hasta la nota. */
function useGaugeAnimation(score: number | null): { needle: number; label: number } {
  const [frame, setFrame] = useState({ needle: GAUGE_MIN, label: GAUGE_MIN });
  const current = useRef(frame);

  useEffect(() => {
    const show = (next: { needle: number; label: number }) => {
      current.current = next;
      setFrame(next);
    };
    if (score === null || Number.isNaN(score)) {
      show({ needle: GAUGE_MIN, label: GAUGE_MIN });
      return;
    }
    const target = clampScore(score);
    if (prefersReducedMotion()) {
      show({ needle: target, label: target });
      return;
    }
    const from = current.current.label;
    let raf = 0;
    let start: number | null = null;
    const step = (now: number) => {
      start ??= now;
      const next = gaugeFrame(from, target, now - start);
      show({ needle: next.needle, label: next.label });
      if (!next.done) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [score]);

  return frame;
}
