import { Suspense } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { GameDay, GameListSkeleton } from "@/components/games/GameDay";
import { JsonLd } from "@/components/layout/JsonLd";
import { addDays, gameDayOf, isGameDay, toScheduleTuple, todayGameDay, type TeamLite } from "@/lib/game-day";
import { decodeFavoritesCookie, FAVORITES_COOKIE, type Favorites } from "@/lib/favorites";
import { pageMetadata } from "@/lib/seo";
import { getSchedule, getSearchIndex, getSpanishPlayers, getTeams } from "@/lib/queries";
import { siteJsonLd } from "@/lib/structured-data";
import { teamAccent } from "@/lib/team-colors";

export const metadata: Metadata = pageMetadata({ title: "Partidos NBA hoy sin spoilers: horarios y qué ver", path: "/" });

/** Jornadas a cada lado de la inicial que ya van en el HTML (el resto llega en segundo plano). */
const INITIAL_WINDOW_DAYS = 3;

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    // Márgenes negativos: la jornada ocupa todo el ancho del área de contenido
    <div className="-mx-4 -mt-4 md:-mx-8 md:-mt-8">
      <JsonLd data={siteJsonLd()} />
      <Suspense fallback={<HomeSkeleton />}>
        <HomeContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function HomeContent({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const { fecha } = await searchParams;
  // "Hoy" depende de la hora de la petición: nunca se prerenderiza
  await connection();
  const today = todayGameDay();
  const day = isGameDay(fecha) ? fecha : today;

  // Favoritos (Tarea 6.10): la cookie lleva sus ids para pintar la jornada ya ordenada y sin saltos
  const favoriteIds = decodeFavoritesCookie((await cookies()).get(FAVORITES_COOKIE)?.value);
  const [schedule, teams, index, spanishPlayers] = await Promise.all([
    getSchedule(),
    getTeams(),
    favoriteIds.players.length > 0 ? getSearchIndex() : null,
    // Los nuestros (Tarea 6.12): solo nombre y equipo; su línea llega aparte y solo en Nivel 3
    getSpanishPlayers(),
  ]);

  // Nivel 1 en el HTML: solo emparejamiento y fecha. Ni nota ni marcador viajan nunca en la página.
  const from = addDays(day, -INITIAL_WINDOW_DAYS);
  const to = addDays(day, INITIAL_WINDOW_DAYS);
  const days = schedule.map((game) => gameDayOf(game.game_datetime_utc));
  const initialSchedule = schedule.filter((_, i) => days[i] >= from && days[i] <= to).map(toScheduleTuple);
  const gameDays = [...new Set(days)];

  const teamsLite: TeamLite[] = teams.map((team) => ({
    id: team.id,
    name: team.name,
    abbreviation: team.abbreviation,
    accent: teamAccent(team),
  }));

  const teamsById = new Map(teams.map((team) => [team.id, team]));
  const playersById = new Map(index?.players.map((player) => [player.id, player]));
  const initialFavorites: Favorites = {
    teams: favoriteIds.teams.flatMap((id) => {
      const team = teamsById.get(id);
      return team ? [{ id, name: team.name, abbreviation: team.abbreviation }] : [];
    }),
    // El equipo de hoy (por si lo traspasaron desde que se marcó)
    players: favoriteIds.players.flatMap(({ id }) => {
      const player = playersById.get(id);
      return player ? [{ id, name: player.full_name, teamId: player.team_id ?? null }] : [];
    }),
  };

  return (
    <GameDay
      initialFavorites={initialFavorites}
      today={today}
      initialDay={day}
      teams={teamsLite}
      initialSchedule={initialSchedule}
      initialRange={[from, to]}
      gameDays={gameDays}
      spanishPlayers={spanishPlayers}
    />
  );
}

function HomeSkeleton() {
  return (
    <div aria-busy>
      <div className="animate-pulse border-b border-slate-800 px-4 pb-5 pt-6 md:px-8 md:pt-10">
        <div className="h-3 w-48 rounded bg-slate-800/80" />
        <div className="mt-4 h-14 w-40 rounded bg-slate-800/80 md:h-[4.5rem]" />
        <div className="mt-3 h-5 w-56 rounded bg-slate-800/80" />
      </div>
      <div className="h-[4.25rem] animate-pulse border-b border-slate-800 bg-slate-900/40" />
      <div className="h-12 border-b border-slate-800 md:h-[2.3125rem]" />
      <GameListSkeleton />
    </div>
  );
}
