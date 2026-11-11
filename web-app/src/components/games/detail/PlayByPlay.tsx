"use client";

import { Fragment, useState } from "react";
import Image from "next/image";
import { Segmented } from "@/components/games/detail/ui";
import type { GameDetail, Play } from "@/lib/game-detail";
import { periodChip, periodName, type MatchupTeam } from "@/lib/game-format";
import { teamLogoUrl } from "@/lib/nba-cdn";
import { cn } from "@/lib/utils";

/** Jugada a jugada en español. En directo, lo último arriba; terminado, en orden cronológico. */
export function PlayByPlay({ detail, away, home }: { detail: GameDetail; away: MatchupTeam; home: MatchupTeam }) {
  const live = detail.status === "Live";
  const regulation = detail.regulationPeriods;
  const periods = [...new Set(detail.plays.map((p) => p.period))].sort((a, b) => a - b);
  const [period, setPeriod] = useState<number | null>(live ? detail.period : null);
  const [teamId, setTeamId] = useState<number | null>(null);
  const [scoringOnly, setScoringOnly] = useState(false);

  const teams = new Map([away, home].map((t) => [t.id, t]));
  const filtered = detail.plays.filter(
    (p) =>
      (period === null || p.period === period) &&
      (teamId === null || p.teamId === teamId) &&
      (!scoringOnly || p.kind === "score")
  );
  const plays = live ? [...filtered].reverse() : filtered;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 px-4 py-3 md:gap-3 md:px-8">
        <Segmented
          label="Periodo"
          value={period}
          onChange={setPeriod}
          options={[{ value: null, label: "Todo" }, ...periods.map((p) => ({ value: p, label: periodChip(p, regulation), title: periodName(p, regulation) }))]}
        />
        <Segmented
          label="Equipo"
          value={teamId}
          onChange={setTeamId}
          options={[{ value: null, label: "Ambos" }, ...[away, home].map((t) => ({ value: t.id, label: t.abbreviation, title: t.name }))]}
        />
        <Segmented
          label="Jugadas"
          value={scoringOnly}
          onChange={setScoringOnly}
          options={[
            { value: false, label: "Todas" },
            { value: true, label: "Solo canastas" },
          ]}
        />
      </div>

      {plays.length === 0 ? (
        <p className="px-4 py-12 text-center font-display text-lg font-bold uppercase text-slate-400 md:px-8">Sin jugadas con este filtro</p>
      ) : (
        <ol>
          {plays.map((play, i) => {
            // Separador al cambiar de periodo (viendo todo el partido)
            const header = period === null && (i === 0 || plays[i - 1].period !== play.period);
            return (
              <Fragment key={play.id}>
                {header && (
                  // Fijo bajo la barra de pestañas (h-12) y, en móvil, bajo la barra superior (h-14)
                  <li className="sticky top-[calc(6.5rem+env(safe-area-inset-top))] z-[1] border-b border-slate-800 bg-slate-950/95 px-4 py-2 font-display text-sm font-bold uppercase tracking-[0.2em] text-orange-400 backdrop-blur md:top-12 md:px-8">
                    {periodName(play.period, regulation)}
                  </li>
                )}
                <PlayRow play={play} team={play.teamId ? teams.get(play.teamId) : undefined} away={away} home={home} />
              </Fragment>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function PlayRow({ play, team, away, home }: { play: Play; team: MatchupTeam | undefined; away: MatchupTeam; home: MatchupTeam }) {
  if (play.kind === "period") {
    return (
      <li className="flex items-center justify-between gap-4 border-b border-slate-800 bg-slate-900/40 px-4 py-2 md:px-8">
        <span className="font-display text-sm font-bold uppercase tracking-wide text-slate-200">{play.text}</span>
        <span className="font-display text-sm font-bold text-white tabular-nums">
          {away.abbreviation} {play.away} – {play.home} {home.abbreviation}
        </span>
      </li>
    );
  }

  const scored = play.kind === "score";
  const awayScored = scored && team?.id === away.id;
  return (
    <li className={cn("grid grid-cols-[2.75rem_1.5rem_minmax(0,1fr)_auto] items-center gap-x-3 border-b border-slate-800/80 px-4 py-2 md:px-8", scored && "bg-slate-900/40")}>
      <span className="font-display text-sm font-semibold text-slate-400 tabular-nums">{play.clock}</span>
      <span className="relative flex h-6 items-center">
        {/* Franja del equipo en las canastas */}
        {scored && team && <span aria-hidden className="absolute -left-2 h-6 w-[3px]" style={{ background: team.accent }} />}
        {team && <Image src={teamLogoUrl(team.id)} alt={team.abbreviation} width={22} height={22} unoptimized className="size-[22px]" />}
      </span>
      <span className={cn("text-sm", scored ? "font-semibold text-white" : play.kind === "miss" ? "text-slate-300" : "text-slate-400")}>
        {play.text}
        {play.total !== null && <span className="ml-1.5 font-display text-xs font-bold uppercase text-slate-400">({play.total} pts)</span>}
      </span>
      <span className="text-right font-display tabular-nums">
        {scored ? (
          <span className="text-sm font-bold">
            <span className={awayScored ? "text-white" : "text-slate-400"}>{play.away}</span>
            <span className="text-slate-500"> – </span>
            <span className={awayScored ? "text-slate-400" : "text-white"}>{play.home}</span>
            <span className="ml-1.5 inline-block min-w-6 bg-slate-800 px-1 text-center text-xs text-white">+{play.points}</span>
          </span>
        ) : null}
      </span>
    </li>
  );
}
