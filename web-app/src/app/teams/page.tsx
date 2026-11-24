import type { Metadata } from "next";
import Image from "next/image";
import { Shared, SharedLink } from "@/components/layout/SharedLink";
import { ChevronRight } from "lucide-react";
import { pageMetadata } from "@/lib/seo";
import { teamLogoUrl } from "@/lib/nba-cdn";
import { divisionLabel } from "@/lib/places";
import { getTeams } from "@/lib/queries";
import type { Team } from "@/lib/supabase";
import { teamAccent } from "@/lib/team-colors";

export const metadata: Metadata = pageMetadata({
  title: "Equipos",
  description: "Los 30 equipos de la NBA por conferencia y división: plantillas, calendario y situación salarial.",
  path: "/teams",
});

const CONFERENCES: { id: "East" | "West"; label: string }[] = [
  { id: "East", label: "Conferencia Este" },
  { id: "West", label: "Conferencia Oeste" },
];

/**
 * Los 30 equipos por conferencia y división (Tarea 6.7). Solo identidad (nombre y escudo): sin balances,
 * así que no depende del nivel de spoilers. Enlazada desde la clasificación.
 */
export default async function TeamsPage() {
  const teams = await getTeams();
  const byName = (a: Team, b: Team) => a.name.localeCompare(b.name, "es");

  return (
    // Márgenes negativos: la página ocupa todo el ancho del área de contenido
    <div className="-mx-4 -mt-4 md:-mx-8 md:-mt-8">
      <header className="border-b border-slate-800 px-4 pb-3 pt-4 md:px-8 md:pb-5 md:pt-10">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-orange-400">NBA · {teams.length} franquicias</p>
        <h1 className="font-display text-4xl font-extrabold uppercase leading-none text-white md:text-6xl">Equipos</h1>
      </header>

      {CONFERENCES.map((conference) => {
        const own = teams.filter((t) => t.conference === conference.id);
        const divisions = [...new Set(own.map((t) => t.division ?? "Sin división"))].sort((a, b) => a.localeCompare(b, "es"));
        return (
          <section key={conference.id} aria-labelledby={`conf-${conference.id}`} className="border-b border-slate-800">
            <h2
              id={`conf-${conference.id}`}
              className="border-b border-slate-800 px-4 pb-2 pt-6 font-display text-2xl font-bold uppercase tracking-wide text-white md:px-8"
            >
              {conference.label}
            </h2>
            <div className="grid md:grid-cols-3 md:divide-x md:divide-slate-800">
              {divisions.map((division) => (
                <div key={division}>
                  <h3 className="px-4 pb-1 pt-4 font-display text-xs font-semibold uppercase tracking-[0.25em] text-slate-400 md:px-8">
                    División {divisionLabel(division)}
                  </h3>
                  <ul>
                    {own
                      .filter((t) => (t.division ?? "Sin división") === division)
                      .sort(byName)
                      .map((team) => (
                        <li key={team.id} className="border-b border-slate-800/80 last:border-b-0">
                          <SharedLink
                            href={`/teams/${team.id}`}
                            className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-slate-900/70 md:px-8"
                          >
                            <span aria-hidden className="h-8 w-1 shrink-0" style={{ background: teamAccent(team) }} />
                            <Shared>
                              <Image src={teamLogoUrl(team.id)} alt="" width={36} height={36} unoptimized className="size-9 shrink-0" />
                            </Shared>
                            <span className="min-w-0 flex-1 truncate font-semibold text-white group-hover:text-orange-400">{team.name}</span>
                            <ChevronRight className="size-4 shrink-0 text-slate-600 transition-colors group-hover:text-orange-400" aria-hidden />
                          </SharedLink>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
