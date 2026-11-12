import type { Metadata } from "next";
import { PlayerDirectory } from "@/components/players/PlayerDirectory";
import { BRAND } from "@/lib/brand";
import { getPlayersDirectory } from "@/lib/queries";
import { SEASON } from "@/lib/trade-rules";

export const metadata: Metadata = {
  title: `Jugadores · ${BRAND.name}`,
  description: "Busca a cualquier jugador de la NBA, en activo o leyenda, y descubre a los mejores de la temporada.",
};

export default async function PlayersPage() {
  const { index, stars, legends } = await getPlayersDirectory();
  const active = index.players.filter((player) => player.is_active && player.team_id !== null).length;

  return (
    // Márgenes negativos: el directorio ocupa todo el ancho del área de contenido
    <div className="-mx-4 -mt-4 md:-mx-8 md:-mt-8">
      <header className="border-b border-slate-800 px-4 pb-5 pt-6 md:px-8 md:pt-10">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-orange-400">
          Temporada {SEASON} · {active} en activo · {legends.length} leyendas
        </p>
        <h1 className="font-display text-5xl font-extrabold uppercase leading-none text-white md:text-6xl">Jugadores</h1>
      </header>
      <PlayerDirectory index={index} stars={stars} legends={legends} />
    </div>
  );
}
