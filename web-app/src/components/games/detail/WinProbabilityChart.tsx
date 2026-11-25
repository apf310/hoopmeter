"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import Image from "next/image";
import { CHART_H as H, CHART_MID as MID, CHART_W as W, ChartMarker, indexAt, PeriodAxis, PeriodLines, useTimeCursor } from "@/components/games/detail/TimeChart";
import { Eyebrow, Fact, Section, Segmented, Swatch } from "@/components/games/detail/ui";
import { PlayerPhoto } from "@/components/players/PlayerPhoto";
import type { GameDetail } from "@/lib/game-detail";
import { clockAt, minutes, periodName, type MatchupTeam } from "@/lib/game-format";
import { teamLogoUrl } from "@/lib/nba-cdn";
import { cn } from "@/lib/utils";
import { chancePair, chanceText, drawableCurve, gameWinProbability, type KeyPlay, type Moment, type WinProbability } from "@/lib/win-probability";

type PanelProps = { detail: GameDetail; away: MatchupTeam; home: MatchupTeam };

/** "Recta final": los últimos 5 min del tiempo reglamentario y lo que venga después. */
const FINAL_STRETCH_S = 300;

/** Arriba, 100 % del visitante; abajo, 100 % del local (como el gráfico de flujo). */
const y = (homeChance: number) => homeChance * H;

/**
 * Probabilidad de victoria a lo largo del partido y las jugadas que más la movieron (Tarea 7.2), con el mismo
 * modelo que la nota. Solo usa la ficha recibida: en diferido llega hasta el corte y nunca más allá.
 */
export function WinProbabilityPanel({ detail, away, home }: PanelProps) {
  const win = useMemo(() => gameWinProbability(detail), [detail]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [zoom, setZoom] = useState(false);
  // Terminado y sin jugada a jugada: no hay curva que enseñar
  if (detail.status === "Final" && detail.flow.length < 2) return null;

  const selected = win.keyPlays.find((p) => p.id === selectedId) ?? null;
  const stretch = detail.regulationPeriods * 720 - FINAL_STRETCH_S;
  // Solo cuando lo jugado (o el corte del diferido) ya ha entrado en ella y el partido no se decidió antes
  const canZoom = detail.elapsed > stretch && (win.decidedLeft === null || detail.elapsed - win.decidedLeft > stretch);
  const from = canZoom && zoom ? stretch : 0;

  function select(play: KeyPlay) {
    setSelectedId(play.id === selectedId ? null : play.id);
    if (play.seconds < from) setZoom(false);
  }

  return (
    <Section
      title="Probabilidad de victoria"
      aside={
        canZoom && (
          <Segmented
            label="Tramo del partido"
            value={zoom}
            onChange={setZoom}
            options={[
              { value: false, label: "Partido" },
              { value: true, label: "Recta final", title: "Desde los últimos 5 minutos del 4.º cuarto" },
            ]}
          />
        )
      }
    >
      <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div>
          <Chart detail={detail} away={away} home={home} win={win} selected={selected} from={from} />
          {detail.elapsed > 0 && <Facts detail={detail} away={away} home={home} win={win} />}
        </div>
        <div>
          <Eyebrow className="text-slate-300">Las jugadas que más la movieron</Eyebrow>
          {win.keyPlays.length > 0 ? (
            <ol className="mt-2 border-t border-slate-800">
              {win.keyPlays.map((play) => (
                <KeyPlayRow
                  key={play.id}
                  play={play}
                  away={away}
                  home={home}
                  regulation={detail.regulationPeriods}
                  active={play.id === selectedId}
                  onSelect={() => select(play)}
                />
              ))}
            </ol>
          ) : (
            <p className="mt-2 border-t border-slate-800 py-4 text-sm text-slate-400">Todavía no hay canastas.</p>
          )}
        </div>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-slate-400">
        Según el marcador, el tiempo que queda y la ventaja de jugar en casa: el mismo cálculo que usa la nota. No cuenta el nivel de los
        equipos ni quién tiene el balón.
      </p>
    </Section>
  );
}

function Chart({ detail, away, home, win, selected, from }: PanelProps & { win: WinProbability; selected: KeyPlay | null; from: number }) {
  const { flow, length, elapsed, regulationPeriods: regulation } = detail;
  const { curve, winner, keyPlays } = win;
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const { hover, handlers } = useTimeCursor(flow, length, elapsed, from);
  const x = (seconds: number) => ((Math.min(seconds, length) - from) / (length - from)) * W;

  const drawn = useMemo(() => drawableCurve(curve, length), [curve, length]);
  const line = drawn
    .filter(([t]) => t >= from)
    .map(([t, p], i) => `${i === 0 ? "M" : "L"}${x(t).toFixed(1)} ${y(p).toFixed(1)}`)
    .join("");
  const area = `M0 ${MID}${line.replace("M", "L")}L${x(elapsed).toFixed(1)} ${MID}Z`;

  // Instante señalado: la cruceta o, si no, la jugada elegida en la lista
  const pointed = hover ?? selected?.seconds ?? null;
  const cursor = pointed !== null && pointed >= from ? pointed : null;
  const chance = curve[cursor === null ? curve.length - 1 : indexAt(curve, cursor)][1];
  const [, scoreAway, scoreHome] = flow[indexAt(flow, cursor ?? elapsed)];
  const moment = cursor !== null ? clockAt(cursor, regulation) : null;
  const [awayChance, homeChance] = chancePair(chance);

  return (
    <div>
      {/* Lectura del momento (sin señalar nada: ahora o el final), en la línea de un rótulo de TV */}
      <div aria-live="polite" className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-3">
        <ChanceFigure team={away} chance={awayChance} leads={chance <= 0.5} />
        <p className="pb-0.5 text-center font-display text-xs font-semibold uppercase tracking-wider text-slate-400 tabular-nums sm:text-sm">
          <span className="block">{moment ? `${periodName(moment.period, regulation)} · ${moment.clock}` : detail.status === "Final" ? "Final" : "Ahora"}</span>
          <span className="block text-base font-bold text-white">
            {scoreAway} – {scoreHome}
          </span>
        </p>
        <ChanceFigure team={home} chance={homeChance} leads={chance >= 0.5} right />
      </div>
      <div className="mt-2 flex h-1.5 gap-0.5" aria-hidden>
        {chance < 1 && <span style={{ width: `${(1 - chance) * 100}%`, background: away.accent }} />}
        {chance > 0 && <span className="flex-1" style={{ background: home.accent }} />}
      </div>

      <p className="mt-2 flex justify-between text-xs text-slate-400" aria-hidden>
        <span>Arriba, favorito {away.abbreviation}</span>
        <span>Abajo, favorito {home.abbreviation}</span>
      </p>

      <div
        role="group"
        aria-roledescription="gráfico"
        tabIndex={0}
        aria-label={`Probabilidad de victoria a lo largo del partido. ${detail.status === "Final" ? "Al final" : "Ahora"}: ${away.name} ${chancePair(curve[curve.length - 1][1])[0]}%, ${home.name} ${chancePair(curve[curve.length - 1][1])[1]}%. Usa las flechas para recorrerla canasta a canasta.`}
        {...handlers}
        className="relative mt-3 h-56 touch-pan-y select-none outline-none focus-visible:ring-2 focus-visible:ring-orange-400 md:h-72"
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

          {[0, 0.25, 0.75, 1].map((p) => (
            <line key={p} x1={0} x2={W} y1={y(p)} y2={y(p)} stroke="#1e293b" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          <PeriodLines length={length} regulation={regulation} from={from} />

          <path d={area} fill={away.accent} fillOpacity={0.2} clipPath={`url(#${id}-top)`} />
          <path d={area} fill={home.accent} fillOpacity={0.2} clipPath={`url(#${id}-bottom)`} />
          <line x1={0} x2={W} y1={MID} y2={MID} stroke="#64748b" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <path d={line} fill="none" stroke={away.accent} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" clipPath={`url(#${id}-top)`} />
          <path d={line} fill="none" stroke={home.accent} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" clipPath={`url(#${id}-bottom)`} />

          {cursor !== null && (
            <line x1={x(cursor)} x2={x(cursor)} y1={0} y2={H} stroke="#e2e8f0" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          )}
        </svg>

        {/* Jugadas clave: del color de quien anota, donde deja la probabilidad */}
        {keyPlays.filter((play) => play.seconds >= from).map((play) => (
          <ChartMarker
            key={play.id}
            left={x(play.seconds) / W}
            top={play.side === "home" ? play.after : 1 - play.after}
            color={play.side === "away" ? away.accent : home.accent}
            big={play.id === selected?.id}
          />
        ))}
        {hover !== null && cursor !== null && <ChartMarker left={x(hover) / W} top={chance} color="#f8fafc" />}
        {winner === null && hover === null && <ChartMarker left={x(elapsed) / W} top={curve[curve.length - 1][1]} color="#f8fafc" />}

        <span className="pointer-events-none absolute right-1 top-1/2 -translate-y-full font-display text-[11px] font-semibold text-slate-400 tabular-nums">
          50%
        </span>
      </div>
      <PeriodAxis length={length} regulation={regulation} from={from} />
    </div>
  );
}

function ChanceFigure({ team, chance, leads, right }: { team: MatchupTeam; chance: string; leads: boolean; right?: boolean }) {
  return (
    <p className={cn("flex min-w-0 items-center gap-2 sm:gap-3", right && "flex-row-reverse text-right")}>
      <Image src={teamLogoUrl(team.id)} alt="" width={40} height={40} unoptimized className="size-9 shrink-0 sm:size-10" />
      <span className="min-w-0 font-display">
        <span className={cn("flex items-center gap-1.5 text-xs font-bold uppercase text-slate-300", right && "justify-end")}>
          <Swatch color={team.accent} className="size-2" />
          {team.abbreviation}
        </span>
        <span className={cn("block text-3xl font-extrabold leading-none tabular-nums sm:text-4xl", leads ? "text-white" : "text-slate-400")}>
          {chance}
          <span className="text-lg sm:text-xl">%</span>
        </span>
      </span>
    </p>
  );
}

function KeyPlayRow({
  play,
  away,
  home,
  regulation,
  active,
  onSelect,
}: {
  play: KeyPlay;
  away: MatchupTeam;
  home: MatchupTeam;
  regulation: number;
  active: boolean;
  onSelect: () => void;
}) {
  const team = play.side === "away" ? away : home;
  // El vuelco, con las mismas cifras redondeadas que se enseñan debajo
  const swing = Math.round(play.after * 100) - Math.round(play.before * 100);
  return (
    <li className="border-b border-slate-800/80">
      <button
        type="button"
        aria-pressed={active}
        title="Ver en el gráfico"
        onClick={onSelect}
        className={cn(
          "grid w-full grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-3 py-2.5 pr-1 text-left outline-none transition-colors hover:bg-slate-900/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-400",
          active && "bg-slate-900 hover:bg-slate-900"
        )}
        style={{ boxShadow: `inset 3px 0 ${team.accent}` }}
      >
        <span className="flex h-10 w-14 items-end justify-center overflow-hidden pl-[3px]" style={{ background: `${team.accent}26` }}>
          {play.playerId !== null ? (
            <PlayerPhoto id={play.playerId} width={56} height={40} className="h-10 w-14 object-cover object-top" />
          ) : (
            <Image src={teamLogoUrl(team.id)} alt="" width={32} height={32} unoptimized className="size-8 self-center" />
          )}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold leading-snug text-white">{play.text}</span>
          <span className="mt-0.5 block text-xs text-slate-400 tabular-nums">
            {periodName(play.period, regulation)} · {play.clock} · {away.abbreviation} {play.away} – {play.home} {home.abbreviation}
          </span>
        </span>
        <span className="text-right font-display tabular-nums">
          <span className="block text-2xl font-extrabold leading-none text-white">
            +{swing}
            <span className="text-base">%</span>
          </span>
          <span className="mt-0.5 block whitespace-nowrap text-xs font-semibold text-slate-400">
            {team.abbreviation} {chanceText(play.before)} → {chanceText(play.after)}
          </span>
        </span>
      </button>
    </li>
  );
}

/** Terminado: el susto del ganador y cuándo se decidió. Sin terminar (o en diferido): el tope de cada equipo hasta ahora. */
function Facts({ detail, away, home, win }: PanelProps & { win: WinProbability }) {
  const { winner, best, decidedLeft } = win;
  const regulation = detail.regulationPeriods;
  const when = ({ seconds }: Moment) => {
    const { period, clock } = clockAt(seconds, regulation);
    return `${periodName(period, regulation)} · ${clock}`;
  };

  return (
    <dl className="mt-5 grid grid-cols-2 border-l border-t border-slate-800">
      {winner && decidedLeft !== null ? (
        <>
          <Fact label="Peor momento del ganador">
            <TeamChance team={winner === "away" ? away : home} chance={1 - best[winner === "away" ? "home" : "away"].chance} />
            <FactNote>{when(best[winner === "away" ? "home" : "away"])}</FactNote>
          </Fact>
          <Fact label={decidedLeft < 1 ? "Se decidió" : "Se decidió a falta de"}>
            <span className="mt-1 block text-2xl">{decidedLeft < 1 ? "Al final" : minutes(decidedLeft)}</span>
            <FactNote>
              {decidedLeft < 1
                ? "En la última jugada"
                : `${(winner === "away" ? home : away).abbreviation} ya no volvió al 10%`}
            </FactNote>
          </Fact>
        </>
      ) : (
        (["away", "home"] as const).map((side) => (
          <Fact key={side} label="Su mejor momento">
            <TeamChance team={side === "away" ? away : home} chance={best[side].chance} />
            <FactNote>{when(best[side])}</FactNote>
          </Fact>
        ))
      )}
    </dl>
  );
}

function TeamChance({ team, chance }: { team: MatchupTeam; chance: number }) {
  return (
    <span className="mt-1 flex items-baseline gap-2">
      <span className="flex items-center gap-1.5 font-display text-xs font-bold uppercase text-slate-300">
        <Swatch color={team.accent} className="size-2" />
        {team.abbreviation}
      </span>
      <span className="text-2xl">{chanceText(chance)}%</span>
    </span>
  );
}

function FactNote({ children }: { children: ReactNode }) {
  return <span className="mt-1 block font-sans text-xs font-normal leading-snug text-slate-400">{children}</span>;
}
