import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { GameDay, GameListSkeleton } from "@/components/games/GameDay";
import { addDays, gameDayOf, isGameDay, toScheduleTuple, todayGameDay, type TeamLite } from "@/lib/game-day";
import { BRAND } from "@/lib/brand";
import { getSchedule, getTeams } from "@/lib/queries";
import { teamAccent } from "@/lib/team-colors";

export const metadata: Metadata = {
  title: `Jornada · ${BRAND.name}`,
};

/** Jornadas a cada lado de la inicial que ya van en el HTML (el resto llega en segundo plano). */
const INITIAL_WINDOW_DAYS = 3;

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    // Márgenes negativos: la jornada ocupa todo el ancho del área de contenido
    <div className="-mx-4 -mt-4 md:-mx-8 md:-mt-8">
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

  const [schedule, teams] = await Promise.all([getSchedule(), getTeams()]);

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

  return (
    <GameDay
      today={today}
      initialDay={day}
      teams={teamsLite}
      initialSchedule={initialSchedule}
      initialRange={[from, to]}
      gameDays={gameDays}
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
      <div className="h-[2.0625rem] border-b border-slate-800" />
      <GameListSkeleton />
    </div>
  );
}
