"use client";

import { useMemo } from "react";
import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { StandingsCardExport, type StandingsCardTeam } from "@/components/share/StandingsShareCard";
import { teamAccent } from "@/lib/team-colors";
import type { StandingsBefore } from "@/lib/standings";
import { ConferenceSwitch } from "./ConferenceSwitch";
import { BeforeDayNote, useLevelStandings } from "./LevelStandings";
import { StandingsTable, type StandingsTeam, type TeamIdentity } from "./StandingsTable";

/** Clasificación según el nivel de spoilers (Tarea 6.6): tabla, tarjeta para compartir y aviso de la jornada. */
export function StandingsBoard({ teams, before }: { teams: TeamIdentity[]; before: StandingsBefore }) {
  const standings = useLevelStandings(before);

  const rows = useMemo<StandingsTeam[] | null>(() => {
    if (!standings.teams) return null;
    const byId = new Map(standings.teams.map((row) => [row.id, row]));
    return teams.flatMap((team) => {
      const row = byId.get(team.id);
      return row ? [{ ...team, ...row }] : [];
    });
  }, [teams, standings.teams]);

  // Lo justo para la imagen
  const cardTeams = useMemo<StandingsCardTeam[] | null>(
    () =>
      rows?.map((t) => ({
        id: t.id,
        abbreviation: t.abbreviation,
        conference: t.conference,
        wins: t.wins,
        losses: t.losses,
        conf_rank: t.conf_rank,
        accent: teamAccent(t),
        l10: t.standings_extra.l10 ?? null,
        streak: t.standings_extra.streak ?? null,
      })) ?? null,
    [rows]
  );

  return (
    // Márgenes negativos: la clasificación ocupa todo el ancho del área de contenido
    <div className="-mx-4 -mt-4 md:-mx-8 md:-mt-8">
      <header className="flex items-end justify-between gap-3 border-b border-slate-800 px-4 pb-3 pt-4 md:px-8 md:pb-5 md:pt-10">
        <div className="min-w-0">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-orange-400">NBA · Fase regular</p>
          <h1 className="font-display text-4xl font-extrabold uppercase leading-none text-white md:text-6xl">Clasificación</h1>
        </div>
        <div className="flex shrink-0 items-center gap-3 md:gap-4">
          {/* Los 30 equipos por conferencia y división (Tarea 6.7) */}
          <Link
            href="/teams"
            className="flex items-center gap-1.5 font-display text-sm font-bold uppercase tracking-wider text-slate-300 transition-colors hover:text-orange-400"
          >
            <LayoutGrid className="size-4" aria-hidden />
            Equipos
          </Link>
          {cardTeams && (
            <StandingsCardExport
              teams={cardTeams}
              beforeDay={standings.current ? null : before.day}
              spoiler={standings.spoiler}
            />
          )}
        </div>
      </header>
      <BeforeDayNote standings={standings} day={before.day} className="border-b border-slate-800 px-4 py-2 md:px-8" />
      {rows && (
        <ConferenceSwitch
          east={<StandingsTable teams={rows.filter((t) => t.conference === "East")} />}
          west={<StandingsTable teams={rows.filter((t) => t.conference === "West")} />}
          league={<StandingsTable teams={rows} league />}
        />
      )}
    </div>
  );
}
