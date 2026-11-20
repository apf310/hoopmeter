import { Suspense } from "react";
import type { Metadata } from "next";
import { WhatToWatch, WhatToWatchHeader } from "@/components/watch/WhatToWatch";
import { BRAND } from "@/lib/brand";
import type { TeamLite } from "@/lib/game-day";
import { getTeams } from "@/lib/queries";
import { teamAccent } from "@/lib/team-colors";
import { DEFAULT_WATCH_PERIOD, isWatchPeriod, parseTeamFilter } from "@/lib/what-to-watch";

export const metadata: Metadata = {
  title: `Qué ver · ${BRAND.name}`,
  description: "Los mejores partidos de la NBA de la semana, del mes y de la temporada según su nota. Sin resultados.",
};

/**
 * "Qué ver" (Tarea 6.11). El HTML solo lleva los equipos: ni un partido, porque el orden por nota ya sería
 * un spoiler en Nivel 1. Las notas llegan de `/api/what-to-watch` cuando el usuario está en Nivel 2 o 3.
 */
export default function WhatToWatchPage({ searchParams }: PageProps<"/que-ver">) {
  return (
    // Márgenes negativos: la página ocupa todo el ancho del área de contenido
    <div className="-mx-4 -mt-4 md:-mx-8 md:-mt-8">
      <Suspense fallback={<WhatToWatchHeader />}>
        <WhatToWatchContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function WhatToWatchContent({ searchParams }: { searchParams: PageProps<"/que-ver">["searchParams"] }) {
  const [{ periodo, equipo }, teams] = await Promise.all([searchParams, getTeams()]);

  const teamsLite: TeamLite[] = teams
    .map((team) => ({ id: team.id, name: team.name, abbreviation: team.abbreviation, accent: teamAccent(team) }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  return (
    <WhatToWatch
      teams={teamsLite}
      initialPeriod={isWatchPeriod(periodo) ? periodo : DEFAULT_WATCH_PERIOD}
      initialTeam={parseTeamFilter(equipo, new Set(teams.map((team) => team.id)))}
    />
  );
}
