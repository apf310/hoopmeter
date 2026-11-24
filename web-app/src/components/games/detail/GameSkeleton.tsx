"use client";

import Image from "next/image";
import { SharedLanding, useSharedNav } from "@/components/layout/SharedLink";
import { teamLogoUrl } from "@/lib/nba-cdn";
import { pendingTeams, sharedTarget, type SharedPart } from "@/lib/shared-nav";

/**
 * Mientras llega la ficha del partido: su forma y, si se viene de tocarlo en una lista, los dos escudos ya en su sitio
 * (Tarea 7.4). Solo el emparejamiento, que estaba en la fila (Nivel 1).
 */
export function GameSkeleton() {
  const nav = useSharedNav();
  const teams = pendingTeams(nav);
  const target = nav.target ? sharedTarget(nav.target) : null;

  const logo = (teamId: number, part: SharedPart) =>
    target?.kind === "game" && (
      <SharedLanding target={target} part={part}>
        <Image src={teamLogoUrl(teamId)} alt="" width={112} height={112} unoptimized className="size-14 drop-shadow-lg md:size-24 xl:size-28" />
      </SharedLanding>
    );

  return (
    <div aria-busy>
      <div className="h-[19rem] border-b border-slate-800 bg-slate-900 px-4 pt-[6.05rem] md:h-[22rem] md:px-8 md:pt-[8.5rem]">
        {teams && (
          <div className="grid grid-cols-[minmax(0,1fr)_11.75rem_minmax(0,1fr)] items-center gap-2 md:grid-cols-[minmax(0,1fr)_14rem_minmax(0,1fr)] md:gap-6">
            <span className="flex justify-center md:justify-start">{logo(teams.away, "away")}</span>
            <span />
            <span className="flex justify-center md:justify-end">{logo(teams.home, "home")}</span>
          </div>
        )}
      </div>
      <div className="animate-pulse">
        <div className="h-12 border-b border-slate-800" />
        <div className="grid gap-6 px-4 py-6 md:px-8 lg:grid-cols-2">
          <div className="h-64 bg-slate-900/60" />
          <div className="h-64 bg-slate-900/60" />
        </div>
      </div>
    </div>
  );
}
