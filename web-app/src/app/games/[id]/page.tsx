import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { GameSkeleton } from "@/components/games/detail/GameSkeleton";
import { GameCenter } from "@/components/games/detail/GameCenter";
import { JsonLd } from "@/components/layout/JsonLd";
import { gameDayOf, isGameId, previousSeason, seasonOf } from "@/lib/game-day";
import type { MatchupTeam } from "@/lib/game-format";
import { getGameMatchup, getKeyPlayers, getTeams } from "@/lib/queries";
import { gameMeta, pageMetadata } from "@/lib/seo";
import { gameJsonLd } from "@/lib/structured-data";
import type { Team } from "@/lib/supabase";
import { matchupAccents, teamBackdrop } from "@/lib/team-colors";

/** Solo Nivel 1 (Tarea 6.25): emparejamiento, jornada y hora. La imagen sale de `opengraph-image.tsx`. */
export async function generateMetadata({ params }: PageProps<"/games/[id]">): Promise<Metadata> {
  const { id } = await params;
  const [game, teams] = await Promise.all([isGameId(id) ? getGameMatchup(id) : null, getTeams()]);
  const away = teams.find((t) => t.id === game?.away_team_id);
  const home = teams.find((t) => t.id === game?.home_team_id);
  if (!game || !away || !home) return pageMetadata({ title: "Partido", path: `/games/${id}`, image: null });
  return pageMetadata({ ...gameMeta(game, away, home), path: `/games/${id}`, image: null });
}

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
  const primary = teamBackdrop(team.primary_color);
  return {
    id: team.id,
    name: team.name,
    abbreviation: team.abbreviation,
    primary,
    secondary: team.secondary_color ?? team.primary_color ?? "#334155",
    accent,
  };
}

/** Hora del servidor frente a la del calendario (fuera del componente: es por petición, tras `connection()`). */
function hasKickedOff(utc: string): boolean {
  return Date.now() >= Date.parse(utc);
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
  // Solo la hora del calendario (como en Nivel 1): decide "aún no ha empezado" sin saltos al hidratar
  await connection();
  const kickedOffAtRender = hasKickedOff(game.game_datetime_utc);
  const accents = matchupAccents(awayTeam, homeTeam);
  const away = toMatchupTeam(awayTeam, accents.away);
  const home = toMatchupTeam(homeTeam, accents.home);

  // Solo datos de Nivel 1 en el HTML: emparejamiento, fecha y promedios de temporada.
  // Ni balances, ni nota, ni marcador: eso lo pide el cliente según su nivel.
  return (
    <>
      <JsonLd data={gameJsonLd(game, awayTeam, homeTeam)} />
      <GameCenter
        game={game}
        day={gameDayOf(game.game_datetime_utc)}
        away={away}
        home={home}
        keyPlayers={keyPlayers}
        kickedOffAtRender={kickedOffAtRender}
      />
    </>
  );
}
