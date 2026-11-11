import { Suspense } from "react";
import { notFound } from "next/navigation";
import { GameCenter } from "@/components/games/detail/GameCenter";
import { BRAND } from "@/lib/brand";
import { gameDayOf, isGameId, previousSeason, seasonOf } from "@/lib/game-day";
import type { MatchupTeam } from "@/lib/game-format";
import { getGameMatchup, getKeyPlayers, getTeams } from "@/lib/queries";
import type { Team } from "@/lib/supabase";
import { matchupAccents } from "@/lib/team-colors";

export default function GamePage({ params }: PageProps<"/games/[id]">) {
  return (
    // Márgenes negativos: la ficha ocupa todo el ancho del área de contenido
    <div className="-mx-4 -mt-4 md:-mx-8 md:-mt-8">
      <Suspense fallback={<GameSkeleton />}>
        <GameContent params={params} />
      </Suspense>
    </div>
  );
}

function toMatchupTeam(team: Team, accent: string): MatchupTeam {
  const primary = team.primary_color ?? "#334155";
  return {
    id: team.id,
    name: team.name,
    abbreviation: team.abbreviation,
    primary,
    secondary: team.secondary_color ?? primary,
    accent,
  };
}

async function GameContent({ params }: { params: PageProps<"/games/[id]">["params"] }) {
  const { id } = await params;
  if (!isGameId(id)) notFound();

  const [game, teams] = await Promise.all([getGameMatchup(id), getTeams()]);
  if (!game) notFound();
  const awayTeam = teams.find((t) => t.id === game.away_team_id);
  const homeTeam = teams.find((t) => t.id === game.home_team_id);
  if (!awayTeam || !homeTeam) notFound();

  const season = seasonOf(game.game_datetime_utc);
  const keyPlayers = await getKeyPlayers([awayTeam.id, homeTeam.id], season, previousSeason(season));
  const accents = matchupAccents(awayTeam, homeTeam);
  const away = toMatchupTeam(awayTeam, accents.away);
  const home = toMatchupTeam(homeTeam, accents.home);

  // Solo datos de Nivel 1 en el HTML: emparejamiento, fecha y promedios de temporada.
  // Ni balances, ni nota, ni marcador: eso lo pide el cliente según su nivel.
  return (
    <>
      <title>{`${away.abbreviation} @ ${home.abbreviation} · ${BRAND.name}`}</title>
      <GameCenter game={game} day={gameDayOf(game.game_datetime_utc)} away={away} home={home} keyPlayers={keyPlayers} />
    </>
  );
}

function GameSkeleton() {
  return (
    <div aria-busy className="animate-pulse">
      <div className="h-[19rem] border-b border-slate-800 bg-slate-900 md:h-[22rem]" />
      <div className="h-12 border-b border-slate-800" />
      <div className="grid gap-6 px-4 py-6 md:px-8 lg:grid-cols-2">
        <div className="h-64 bg-slate-900/60" />
        <div className="h-64 bg-slate-900/60" />
      </div>
    </div>
  );
}
