"use client";

import { useRef, useState, type PointerEvent } from "react";
import { Segmented, TeamToggle } from "@/components/games/detail/ui";
import type { GameDetail, Shot, ShotZone } from "@/lib/game-detail";
import { LEAGUE_ZONE_PCT, pct, periodChip, periodName, SHOT_ZONES, teamOf, type MatchupTeam } from "@/lib/game-format";
import { cn } from "@/lib/utils";

// Media pista en décimas de pie con el aro en (0, 0): fondo arriba y medio campo abajo
const VIEW = { x: -250, y: -52.5, width: 500, height: 475 };
const COURT_BG = "#0f172a";
const LINE = "#475569";
const ARC_Y = 89.48; // Donde la línea de triple deja de ser recta (esquina) y empieza el arco
const MAX_Y = 418; // Tiros desde campo propio: se pintan pegados al medio campo

type Mode = "shots" | "zones";
type ZoneStat = { made: number; attempts: number };

function zoneStats(shots: Shot[], filter: (shot: Shot) => boolean = () => true): Record<ShotZone, ZoneStat> {
  const stats = Object.fromEntries(SHOT_ZONES.map(({ zone }) => [zone, { made: 0, attempts: 0 }])) as Record<ShotZone, ZoneStat>;
  for (const shot of shots) {
    if (!filter(shot)) continue;
    stats[shot.zone].attempts++;
    if (shot.made) stats[shot.zone].made++;
  }
  return stats;
}

// Escala divergente: azul (peor que la media de la liga) · gris (en la media) · rojo (mejor)
const COLD = [59, 130, 246];
const NEUTRAL = [71, 85, 105];
const HOT = [239, 68, 68];
const BG = [15, 23, 42];

const mix = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgb = (c: number[]) => `rgb(${c.join(" ")})`;

/** Color opaco de la zona (se pintan unas sobre otras). Muestras pequeñas: se acercan a la media antes de colorear. */
function zoneFill(stat: ZoneStat, league: number): string {
  if (stat.attempts === 0) return COURT_BG;
  const shrunk = (stat.made + 3 * league) / (stat.attempts + 3);
  const t = Math.max(-1, Math.min(1, (shrunk - league) / 0.12));
  return rgb(mix(BG, mix(NEUTRAL, t > 0 ? HOT : COLD, Math.abs(t)), 0.75));
}

function summary(shots: Shot[]) {
  const made = shots.filter((s) => s.made);
  const threes = shots.filter((s) => s.three);
  const madeThrees = threes.filter((s) => s.made).length;
  return {
    fgm: made.length,
    fga: shots.length,
    fg3m: madeThrees,
    fg3a: threes.length,
    efg: shots.length ? (made.length + 0.5 * madeThrees) / shots.length : null,
    points: 2 * (made.length - madeThrees) + 3 * madeThrees,
  };
}

/** Panel del mapa de tiro con filtros por equipo, jugador, periodo y vista. */
export function ShotChartPanel({
  detail,
  away,
  home,
  teamId,
  playerId,
  onTeamChange,
  onPlayerChange,
}: {
  detail: GameDetail;
  away: MatchupTeam;
  home: MatchupTeam;
  teamId: number;
  playerId: number | null;
  onTeamChange: (teamId: number) => void;
  onPlayerChange: (playerId: number | null) => void;
}) {
  const [period, setPeriod] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>("shots");

  const team = teamId === home.id ? home : away;
  const box = teamOf(detail, teamId);
  const shooters = box.players.filter((p) => p.fga > 0).sort((a, b) => b.fga - a.fga);
  const periods = [...new Set(detail.shots.map((s) => s.period))].sort((a, b) => a - b);
  const shots = detail.shots.filter(
    (s) => s.teamId === teamId && (playerId === null || s.playerId === playerId) && (period === null || s.period === period)
  );
  const totals = summary(shots);
  const zones = zoneStats(shots);

  return (
    <div>
      {/* Filtros: una sola fila sobre todo lo que filtran */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 px-4 py-3 md:gap-3 md:px-8">
        <TeamToggle away={away} home={home} value={teamId} onChange={onTeamChange} />
        <label className="sr-only" htmlFor="shot-player">
          Jugador
        </label>
        <select
          id="shot-player"
          value={playerId ?? ""}
          onChange={(e) => onPlayerChange(e.target.value ? Number(e.target.value) : null)}
          className="h-[2.375rem] max-w-56 border border-slate-700 bg-slate-950 px-2.5 font-display text-sm font-bold uppercase tracking-wide text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
        >
          <option value="">Todo el equipo</option>
          {shooters.map((p) => (
            <option key={p.id} value={p.id}>
              {p.short} · {p.fgm}/{p.fga}
            </option>
          ))}
        </select>
        <Segmented
          label="Periodo"
          value={period}
          onChange={setPeriod}
          options={[{ value: null, label: "Todo" }, ...periods.map((p) => ({ value: p, label: periodChip(p, detail.regulationPeriods), title: periodName(p, detail.regulationPeriods) }))]}
        />
        <Segmented
          label="Vista"
          value={mode}
          onChange={setMode}
          options={[
            { value: "shots", label: "Tiros" },
            { value: "zones", label: "Zonas" },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 px-4 py-6 md:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-10">
        <div className="mx-auto w-full max-w-[560px]">
          <ShotCourt shots={shots} accent={team.accent} mode={mode} regulation={detail.regulationPeriods} />
          <CourtLegend mode={mode} accent={team.accent} />
        </div>

        <div>
          <dl className="grid grid-cols-2 border-l border-t border-slate-800">
            <Tile label="Tiros de campo" value={`${totals.fgm}/${totals.fga}`} note={totals.fga ? `${pct(totals.fgm / totals.fga)} %` : "–"} />
            <Tile label="Triples" value={`${totals.fg3m}/${totals.fg3a}`} note={totals.fg3a ? `${pct(totals.fg3m / totals.fg3a)} %` : "–"} />
            <Tile label="eFG%" value={pct(totals.efg)} note="Acierto efectivo" />
            <Tile label="Puntos" value={String(totals.points)} note="En tiros de campo" />
          </dl>

          <table className="mt-6 w-full text-sm tabular-nums">
            <caption className="pb-2 text-left font-display text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Acierto por zona frente a la media de la NBA
            </caption>
            <thead className="border-b border-slate-800">
              <tr className="font-display text-xs font-semibold uppercase tracking-wider text-slate-300">
                <th scope="col" className="py-2 text-left font-semibold">
                  Zona
                </th>
                <th scope="col" className="px-2 py-2 text-right font-semibold">
                  TC
                </th>
                <th scope="col" className="px-2 py-2 text-right font-semibold">
                  %
                </th>
                <th scope="col" className="py-2 pl-2 text-right font-semibold" title="Diferencia con la media de la liga, en puntos porcentuales">
                  vs liga
                </th>
              </tr>
            </thead>
            <tbody>
              {SHOT_ZONES.map(({ zone, label, league }) => {
                const stat = zones[zone];
                const diff = stat.attempts ? (stat.made / stat.attempts - league) * 100 : null;
                return (
                  <tr key={zone} className="border-b border-slate-800/80">
                    <th scope="row" className="py-2 text-left font-normal text-slate-200">
                      <span className="flex items-center gap-2">
                        <span aria-hidden className="size-2.5 shrink-0" style={{ background: zoneFill(stat, league) }} />
                        {label}
                      </span>
                    </th>
                    <td className="px-2 py-2 text-right text-white">
                      {stat.made}/{stat.attempts}
                    </td>
                    <td className="px-2 py-2 text-right font-semibold text-white">{stat.attempts ? pct(stat.made / stat.attempts) : "–"}</td>
                    <td className="py-2 pl-2 text-right text-slate-300">
                      {diff === null ? "–" : `${diff > 0 ? "+" : ""}${diff.toFixed(1)}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-3 text-xs leading-relaxed text-slate-400">
            Media de la NBA aproximada de las últimas temporadas: {SHOT_ZONES.map((z) => `${z.label.toLowerCase()} ${pct(z.league, 0)} %`).join(" · ")}.
          </p>
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="border-b border-r border-slate-800 px-4 py-3">
      <dt className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300">{label}</dt>
      <dd className="font-display text-3xl font-extrabold text-white">{value}</dd>
      <dd className="text-xs text-slate-400">{note}</dd>
    </div>
  );
}

function CourtLegend({ mode, accent }: { mode: Mode; accent: string }) {
  if (mode === "zones") {
    return (
      <div className="mt-3 flex items-center justify-center gap-3 text-xs text-slate-300">
        <span>Peor que la media</span>
        <span aria-hidden className="h-2.5 w-28" style={{ background: `linear-gradient(90deg, ${rgb(COLD)}, ${rgb(NEUTRAL)}, ${rgb(HOT)})` }} />
        <span>Mejor que la media</span>
      </div>
    );
  }
  return (
    <ul className="mt-3 flex items-center justify-center gap-5 text-xs text-slate-300">
      <li className="flex items-center gap-2">
        <svg aria-hidden viewBox="-8 -8 16 16" className="size-3.5">
          <circle r={6} fill={accent} stroke={COURT_BG} strokeWidth={2} />
        </svg>
        Anotado
      </li>
      <li className="flex items-center gap-2">
        <svg aria-hidden viewBox="-8 -8 16 16" className="size-3.5">
          <path d="M-5 -5 L5 5 M5 -5 L-5 5" stroke="#94a3b8" strokeWidth={2.5} strokeLinecap="round" />
        </svg>
        Fallado
      </li>
    </ul>
  );
}

/**
 * Media pista con los tiros (círculo = anotado, aspa = fallado) o con las zonas coloreadas según
 * el acierto frente a la media de la liga. Al pasar el ratón o el dedo, el detalle del tiro más cercano.
 */
export function ShotCourt({
  shots,
  accent,
  mode = "shots",
  regulation = 4,
  className,
}: {
  shots: Shot[];
  accent: string;
  mode?: Mode;
  regulation?: number;
  className?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hovered, setHovered] = useState<Shot | null>(null);
  const stats = zoneStats(shots);
  const corners = { left: zoneStats(shots, (s) => s.x < 0).corner3, right: zoneStats(shots, (s) => s.x >= 0).corner3 };
  const fill = (zone: ShotZone, stat = stats[zone]) => (mode === "zones" ? zoneFill(stat, LEAGUE_ZONE_PCT[zone]) : COURT_BG);

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    if (mode !== "shots") return;
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM()?.inverse();
    if (!svg || !matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix);
    let best: Shot | null = null;
    let bestDistance = 22; // Área de acierto mayor que la marca: basta con acercarse
    for (const shot of shots) {
      const distance = Math.hypot(shot.x - point.x, Math.min(shot.y, MAX_Y) - point.y);
      if (distance < bestDistance) {
        best = shot;
        bestDistance = distance;
      }
    }
    setHovered(best);
  }

  const visibleHover = mode === "shots" && hovered && shots.includes(hovered) ? hovered : null;
  const made = shots.filter((s) => s.made);
  const missed = shots.filter((s) => !s.made);

  return (
    <div className={cn("relative", className)}>
      <svg
        ref={svgRef}
        viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.width} ${VIEW.height}`}
        className="block w-full touch-pan-y select-none"
        role="img"
        aria-label={`Mapa de tiro: ${made.length} anotados de ${shots.length} intentos`}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerMove}
        onPointerLeave={(event) => event.pointerType === "mouse" && setHovered(null)}
      >
        {/* Zonas, de fuera a dentro: cada una tapa a la anterior */}
        <rect x={-250} y={-47.5} width={500} height={470} fill={fill("above3")} />
        <rect x={-250} y={-47.5} width={30} height={140} fill={fill("corner3", corners.left)} />
        <rect x={220} y={-47.5} width={30} height={140} fill={fill("corner3", corners.right)} />
        <path d={`M -220 -47.5 L -220 ${ARC_Y} A 237.5 237.5 0 0 0 220 ${ARC_Y} L 220 -47.5 Z`} fill={fill("mid")} />
        <rect x={-80} y={-47.5} width={160} height={190} fill={fill("paint")} />
        <path d="M -40 -47.5 L -40 0 A 40 40 0 0 0 40 0 L 40 -47.5 Z" fill={fill("ra")} />

        <g fill="none" stroke={LINE} strokeWidth={2}>
          <rect x={-250} y={-47.5} width={500} height={470} />
          <path d={`M -220 -47.5 L -220 ${ARC_Y} A 237.5 237.5 0 0 0 220 ${ARC_Y} L 220 -47.5`} />
          <rect x={-80} y={-47.5} width={160} height={190} />
          <path d="M -60 142.5 A 60 60 0 0 0 60 142.5" />
          <path d="M -40 0 A 40 40 0 0 0 40 0" />
          <path d="M -60 422.5 A 60 60 0 0 1 60 422.5" />
          <line x1={-30} y1={-7.5} x2={30} y2={-7.5} />
          <circle cx={0} cy={0} r={7.5} />
        </g>

        {mode === "zones" ? (
          <g className="font-display" fill="#fff" stroke={COURT_BG} strokeWidth={4} paintOrder="stroke" textAnchor="middle" fontWeight={700}>
            <ZoneLabel x={0} y={300} stat={stats.above3} />
            <ZoneLabel x={0} y={200} stat={stats.mid} />
            <ZoneLabel x={0} y={95} stat={stats.paint} />
            {/* Zonas estrechas: en una sola línea (las esquinas, en vertical) */}
            <ZoneLabel x={0} y={31} stat={stats.ra} inline />
            <ZoneLabel x={-235} y={22} stat={corners.left} inline rotate={-90} />
            <ZoneLabel x={235} y={22} stat={corners.right} inline rotate={90} />
          </g>
        ) : (
          <>
            {missed.map((s, i) => (
              <path
                key={`m${i}`}
                transform={`translate(${s.x} ${Math.min(s.y, MAX_Y)})`}
                d="M-5 -5 L5 5 M5 -5 L-5 5"
                stroke="#94a3b8"
                strokeWidth={2.5}
                strokeLinecap="round"
              />
            ))}
            {made.map((s, i) => (
              <circle key={`a${i}`} cx={s.x} cy={Math.min(s.y, MAX_Y)} r={7} fill={accent} stroke={COURT_BG} strokeWidth={2} />
            ))}
            {visibleHover && (
              <circle cx={visibleHover.x} cy={Math.min(visibleHover.y, MAX_Y)} r={12} fill="none" stroke="#fff" strokeWidth={2} />
            )}
          </>
        )}
      </svg>

      {visibleHover && <ShotTooltip shot={visibleHover} regulation={regulation} />}
      {shots.length === 0 && (
        <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center font-display text-lg font-bold uppercase text-slate-400">
          Sin tiros con este filtro
        </p>
      )}
    </div>
  );
}

function ZoneLabel({ x, y, stat, inline, rotate }: { x: number; y: number; stat: ZoneStat; inline?: boolean; rotate?: number }) {
  const share = stat.attempts > 0 ? `${pct(stat.made / stat.attempts, 0)} %` : null;
  const transform = `translate(${x} ${y})${rotate ? ` rotate(${rotate})` : ""}`;
  if (inline) {
    return (
      <text transform={transform} fontSize={14} dominantBaseline="middle">
        {stat.made}/{stat.attempts}
        {share && ` · ${share}`}
      </text>
    );
  }
  return (
    <text transform={transform} fontSize={20}>
      <tspan x={0} dy={0}>
        {stat.made}/{stat.attempts}
      </tspan>
      {share && (
        <tspan x={0} dy={18} fontSize={16} fontWeight={600}>
          {share}
        </tspan>
      )}
    </text>
  );
}

function ShotTooltip({ shot, regulation }: { shot: Shot; regulation: number }) {
  const left = (shot.x - VIEW.x) / VIEW.width;
  const top = (Math.min(shot.y, MAX_Y) - VIEW.y) / VIEW.height;
  return (
    <div
      role="status"
      className={cn(
        "pointer-events-none absolute z-10 w-max max-w-[16rem] -translate-y-[calc(100%+14px)] border border-slate-700 bg-slate-950/95 px-3 py-2 shadow-xl",
        left < 0.3 ? "translate-x-[-12px]" : left > 0.7 ? "-translate-x-[calc(100%-12px)]" : "-translate-x-1/2"
      )}
      style={{ left: `${left * 100}%`, top: `${top * 100}%` }}
    >
      <p className={cn("font-display text-sm font-bold uppercase tracking-wide", shot.made ? "text-white" : "text-slate-300")}>
        {shot.made ? "Anotado" : "Fallado"} · {shot.three ? "Triple" : "Tiro de 2"}
      </p>
      <p className="text-xs text-slate-200">{shot.text}</p>
      <p className="mt-0.5 text-[11px] text-slate-400">
        {periodName(shot.period, regulation)} · {shot.clock}
      </p>
    </div>
  );
}
