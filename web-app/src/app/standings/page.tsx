import type { Metadata } from "next";
import { StandingsCardExport, type StandingsCardTeam } from "@/components/share/StandingsShareCard";
import { ConferenceSwitch } from "@/components/standings/ConferenceSwitch";
import { StandingsTable } from "@/components/standings/StandingsTable";
import { BRAND } from "@/lib/brand";
import { getTeams } from "@/lib/queries";
import { teamAccent } from "@/lib/team-colors";

export const metadata: Metadata = {
  title: `Clasificación · ${BRAND.name}`,
};

export default async function StandingsPage() {
  const teams = await getTeams();
  // Lo justo para la imagen: no viajan al navegador nóminas ni contratos
  const cardTeams: StandingsCardTeam[] = teams.map((t) => ({
    id: t.id,
    abbreviation: t.abbreviation,
    conference: t.conference,
    wins: t.wins,
    losses: t.losses,
    conf_rank: t.conf_rank,
    accent: teamAccent(t),
    l10: t.standings_extra?.l10 ?? null,
    streak: t.standings_extra?.streak ?? null,
  }));

  return (
    // Márgenes negativos: la clasificación ocupa todo el ancho del área de contenido
    <div className="-mx-4 -mt-4 md:-mx-8 md:-mt-8">
      <header className="flex items-end justify-between gap-3 border-b border-slate-800 px-4 pb-3 pt-4 md:px-8 md:pb-5 md:pt-10">
        <div className="min-w-0">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-orange-400">NBA · Fase regular</p>
          <h1 className="font-display text-4xl font-extrabold uppercase leading-none text-white md:text-6xl">Clasificación</h1>
        </div>
        <StandingsCardExport teams={cardTeams} className="shrink-0" />
      </header>
      <ConferenceSwitch
        east={<StandingsTable teams={teams.filter((t) => t.conference === "East")} />}
        west={<StandingsTable teams={teams.filter((t) => t.conference === "West")} />}
      />
    </div>
  );
}
