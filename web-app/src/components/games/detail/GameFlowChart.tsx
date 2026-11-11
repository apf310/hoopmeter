"use client";

import { useId, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Swatch } from "@/components/games/detail/ui";
import type { FlowPoint, GameDetail } from "@/lib/game-detail";
import { clockAt, periodChip, periodName, periodStarts, type MatchupTeam } from "@/lib/game-format";
import { cn } from "@/lib/utils";

// Unidades internas del SVG: se estira a lo ancho (las líneas mantienen 2 px con non-scaling-stroke)
const W = 1000;
const H = 240;
const MID = H / 2;

/** Último punto del marcador en el instante `seconds` (el marcador cambia a saltos). */
function indexAt(flow: FlowPoint[], seconds: number): number {
  let lo = 0;
  let hi = flow.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (flow[mid][0] <= seconds) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Diferencia en el marcador a lo largo del partido: por encima de la línea manda el visitante,
 * por debajo el local. Cruceta con el marcador exacto en cada momento (ratón, dedo o flechas).
 */
export function GameFlowChart({ detail, away, home }: { detail: GameDetail; away: MatchupTeam; home: MatchupTeam }) {
  const { flow, length, elapsed, regulationPeriods: regulation } = detail;
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [hover, setHover] = useState<number | null>(null);

  const maxLead = Math.max(...flow.map(([, a, h]) => Math.abs(a - h)));
  const top = Math.max(5, Math.ceil(maxLead / 5) * 5);
  const x = (seconds: number) => (Math.min(seconds, length) / length) * W;
  const y = (diff: number) => MID - (diff / top) * (MID - 6);

  let line = `M0 ${MID}`;
  for (const [seconds, a, h] of flow.slice(1)) line += ` H${x(seconds)} V${y(a - h)}`;
  line += ` H${x(elapsed)}`;
  const area = `${line} V${MID} Z`;

  // Mayor ventaja de cada equipo: único punto con etiqueta directa
  const peaks = (["away", "home"] as const).flatMap((side) => {
    let best: FlowPoint | null = null;
    for (const point of flow) {
      const lead = side === "away" ? point[1] - point[2] : point[2] - point[1];
      if (lead > 0 && (!best || lead > (side === "away" ? best[1] - best[2] : best[2] - best[1]))) best = point;
    }
    return best ? [{ side, point: best, lead: Math.abs(best[1] - best[2]) }] : [];
  });

  const starts = periodStarts(length, regulation);
  const bounds = [0, ...starts, length];
  const index = indexAt(flow, hover ?? elapsed);
  const [, scoreAway, scoreHome] = flow[index];
  const moment = hover !== null ? clockAt(hover, regulation) : null;

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    setHover(Math.min(fraction * length, elapsed));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = hover === null ? flow.length - 1 : indexAt(flow, hover);
    const next =
      event.key === "ArrowRight" ? current + 1 : event.key === "ArrowLeft" ? current - 1 : event.key === "Home" ? 0 : event.key === "End" ? flow.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    setHover(flow[Math.min(flow.length - 1, Math.max(0, next))][0]);
  }

  const leadText =
    scoreAway === scoreHome ? "Empate" : scoreAway > scoreHome ? `${away.abbreviation} +${scoreAway - scoreHome}` : `${home.abbreviation} +${scoreHome - scoreAway}`;

  return (
    <div>
      {/* Leyenda + lectura del momento (sin hover: el marcador actual o final) */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-300">
          <li className="flex items-center gap-2">
            <Swatch color={away.accent} />
            {away.abbreviation} por delante (arriba)
          </li>
          <li className="flex items-center gap-2">
            <Swatch color={home.accent} />
            {home.abbreviation} por delante (abajo)
          </li>
        </ul>
        <p aria-live="polite" className="font-display text-sm font-bold uppercase tracking-wide text-slate-300 tabular-nums">
          <span className="text-slate-400">
            {moment ? `${periodName(moment.period, regulation)} · ${moment.clock}` : detail.status === "Final" ? "Final" : "Ahora"}
          </span>
          <span className="mx-2 text-white">
            {away.abbreviation} {scoreAway} – {scoreHome} {home.abbreviation}
          </span>
          <span className="text-white">{leadText}</span>
        </p>
      </div>

      <div
        role="group"
        aria-roledescription="gráfico"
        tabIndex={0}
        aria-label={`Diferencia en el marcador a lo largo del partido. Mayor ventaja: ${peaks.map((p) => `${p.side === "away" ? away.abbreviation : home.abbreviation} ${p.lead}`).join(", ") || "ninguna"}. Usa las flechas para recorrer el marcador.`}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerMove}
        // Con el dedo la lectura se queda al soltar (se quita al tocar fuera)
        onPointerLeave={(event) => event.pointerType === "mouse" && setHover(null)}
        onKeyDown={onKeyDown}
        onBlur={() => setHover(null)}
        className="relative mt-3 h-56 touch-pan-y select-none outline-none focus-visible:ring-2 focus-visible:ring-orange-400 md:h-64"
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
          <defs>
            <clipPath id={`${id}-top`}>
              <rect x={0} y={-10} width={W} height={MID + 10} />
            </clipPath>
            <clipPath id={`${id}-bottom`}>
              <rect x={0} y={MID} width={W} height={MID + 10} />
            </clipPath>
          </defs>

          {/* Rejilla: ventaja máxima y media, divisiones por periodo (filetes sólidos, recesivos) */}
          {[top, top / 2, -top / 2, -top].map((v) => (
            <line key={v} x1={0} x2={W} y1={y(v)} y2={y(v)} stroke="#1e293b" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          {starts.map((s) => (
            <line key={s} x1={x(s)} x2={x(s)} y1={0} y2={H} stroke="#334155" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}

          <path d={area} fill={away.accent} fillOpacity={0.2} clipPath={`url(#${id}-top)`} />
          <path d={area} fill={home.accent} fillOpacity={0.2} clipPath={`url(#${id}-bottom)`} />
          <line x1={0} x2={W} y1={MID} y2={MID} stroke="#64748b" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <path d={line} fill="none" stroke={away.accent} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" clipPath={`url(#${id}-top)`} />
          <path d={line} fill="none" stroke={home.accent} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" clipPath={`url(#${id}-bottom)`} />

          {hover !== null && (
            <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} stroke="#e2e8f0" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          )}
        </svg>

        {/* Puntos y etiquetas en HTML: no se deforman al estirar el SVG */}
        {peaks.map(({ side, point, lead }) => {
          const height = y(point[1] - point[2]) / H;
          // La etiqueta va hacia fuera de la línea central, salvo pegada al borde del gráfico
          const below = side === "home" ? height < 0.85 : height < 0.12;
          return (
            <Marker key={side} left={x(point[0]) / W} top={height} color={side === "away" ? away.accent : home.accent} label={`+${lead}`} below={below} />
          );
        })}
        {hover !== null && (
          <Marker left={x(hover) / W} top={y(scoreAway - scoreHome) / H} color={scoreAway >= scoreHome ? away.accent : home.accent} />
        )}

        <span className="pointer-events-none absolute left-1 top-0 font-display text-[11px] font-semibold uppercase tracking-wider text-slate-400 tabular-nums">
          {away.abbreviation} +{top}
        </span>
        <span className="pointer-events-none absolute bottom-0 left-1 font-display text-[11px] font-semibold uppercase tracking-wider text-slate-400 tabular-nums">
          {home.abbreviation} +{top}
        </span>
      </div>

      {/* Eje de periodos */}
      <div className="relative mt-1.5 h-4">
        {bounds.slice(0, -1).map((start, i) => (
          <span
            key={start}
            className="absolute -translate-x-1/2 font-display text-xs font-semibold uppercase tracking-wider text-slate-400"
            style={{ left: `${(((start + bounds[i + 1]) / 2) / length) * 100}%` }}
          >
            {i < regulation ? `${periodChip(i + 1, regulation)}.º` : periodChip(i + 1, regulation)}
          </span>
        ))}
      </div>
    </div>
  );
}

function Marker({ left, top, color, label, below }: { left: number; top: number; color: string; label?: string; below?: boolean }) {
  return (
    <span className="pointer-events-none absolute" style={{ left: `${left * 100}%`, top: `${top * 100}%` }}>
      {/* Punto con anillo del color del fondo: se lee aunque cruce la línea */}
      <span className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-slate-950" style={{ background: color }} />
      {label && (
        <span
          className={cn(
            "absolute -translate-x-1/2 whitespace-nowrap font-display text-xs font-bold text-white tabular-nums",
            below ? "top-2" : "bottom-2"
          )}
        >
          {label}
        </span>
      )}
    </span>
  );
}
