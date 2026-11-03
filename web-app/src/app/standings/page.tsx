import type { Metadata } from "next";
import { ConferenceSwitch } from "@/components/standings/ConferenceSwitch";
import { StandingsTable } from "@/components/standings/StandingsTable";
import { getTeams } from "@/lib/queries";

export const metadata: Metadata = {
  title: "Clasificación · NBA Hub",
};

export default async function StandingsPage() {
  const teams = await getTeams();

  return (
    // Márgenes negativos: la clasificación ocupa todo el ancho del área de contenido
    <div className="-mx-4 -mt-4 md:-mx-8 md:-mt-8">
      <header className="border-b border-slate-800 px-4 pb-5 pt-6 md:px-8 md:pt-10">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-orange-400">NBA · Fase regular</p>
        <h1 className="font-display text-5xl font-extrabold uppercase leading-none text-white md:text-6xl">Clasificación</h1>
      </header>
      <ConferenceSwitch
        east={<StandingsTable teams={teams.filter((t) => t.conference === "East")} />}
        west={<StandingsTable teams={teams.filter((t) => t.conference === "West")} />}
      />
    </div>
  );
}
