import { Suspense } from "react";
import type { Metadata } from "next";
import { PlayerDirectory } from "@/components/players/PlayerDirectory";
import { PlayerExplorer } from "@/components/players/PlayerExplorer";
import { pageMetadata } from "@/lib/seo";
import { parseExplorerState } from "@/lib/player-explorer";
import { getExplorerSeasons, getPlayerExplorer, getPlayersDirectory } from "@/lib/queries";

export const metadata: Metadata = pageMetadata({
  title: "Jugadores",
  description: "Explora las estadísticas de todos los jugadores de la NBA: filtra por posición, equipo, país, edad o salario y ordena por cualquier estadística.",
  path: "/players",
});

/**
 * Jugadores (Tarea 6.22): buscador y explorador de estadísticas. Los filtros vienen en la URL
 * (`?posicion=pivot&orden=reb`), así que un enlace compartido abre exactamente la misma tabla.
 */
export default function PlayersPage({ searchParams }: PageProps<"/players">) {
  return (
    // Márgenes negativos: el directorio ocupa todo el ancho del área de contenido
    <div className="-mx-4 -mt-4 md:-mx-8 md:-mt-8">
      <Suspense fallback={<PlayersFallback />}>
        <PlayersContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function PlayersContent({ searchParams }: { searchParams: PageProps<"/players">["searchParams"] }) {
  const [params, seasons, { index, legends }] = await Promise.all([searchParams, getExplorerSeasons(), getPlayersDirectory()]);
  const state = parseExplorerState(params, { seasons, teamIds: new Set(index.teams.map((t) => t.id)) });
  const explorer = await getPlayerExplorer(state.season);
  const active = index.players.filter((player) => player.is_active && player.team_id !== null).length;

  return (
    <>
      <Header kicker={`Temporada ${seasons[0]} · ${active} en activo · ${legends.length} leyendas`} />
      <PlayerDirectory
        index={index}
        legends={legends}
        explorer={<PlayerExplorer initial={explorer} seasons={seasons} initialState={state} teams={index.teams} />}
      />
    </>
  );
}

function Header({ kicker }: { kicker: string }) {
  return (
    <header className="border-b border-slate-800 px-4 pb-3 pt-4 md:px-8 md:pb-5 md:pt-10">
      <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-orange-400">{kicker}</p>
      <h1 className="font-display text-4xl font-extrabold uppercase leading-none text-white md:text-6xl">Jugadores</h1>
    </header>
  );
}

/** Mientras llegan los datos: cabecera, buscador y tabla con su forma (sin saltos al pintar). */
function PlayersFallback() {
  return (
    <div aria-busy className="animate-pulse">
      <Header kicker="Estadísticas de la temporada" />
      <div className="border-b border-slate-800 px-4 py-3 md:px-8">
        <div className="h-12 bg-slate-900" />
      </div>
      <div className="h-[3.25rem] border-b border-slate-800" />
      <div className="grid grid-cols-2 gap-px bg-slate-800 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-32 bg-slate-950" />
        ))}
      </div>
      <div className="space-y-px">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="h-12 border-b border-slate-800/80" />
        ))}
      </div>
    </div>
  );
}
