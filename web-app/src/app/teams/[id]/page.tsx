import { Suspense, type ReactNode } from "react";
import Image from "next/image";
import { notFound } from "next/navigation";
import { FavoriteButton } from "@/components/favorites/FavoriteButton";
import type { TeamCardData } from "@/components/share/TeamShareCard";
import { TeamRecordStats } from "@/components/standings/TeamRecordStats";
import { BRAND } from "@/lib/brand";
import { RosterTable } from "@/components/teams/RosterTable";
import { TeamGameRow, type RivalLite } from "@/components/teams/TeamGameRow";
import { TeamRecentGames } from "@/components/teams/TeamRecentGames";
import { getRecentMatchups, getStandingsBefore, getTeamRosterStats, getTeams, getUpcomingGames } from "@/lib/queries";
import { teamLogoUrl } from "@/lib/nba-cdn";
import type { StandingsBefore } from "@/lib/standings";
import { teamAccent } from "@/lib/team-colors";
import type { Team } from "@/lib/supabase";
import { SEASON } from "@/lib/trade-rules";

const CONFERENCE_LABEL: Record<string, string> = { East: "Este", West: "Oeste" };

export default function TeamPage({ params }: PageProps<"/teams/[id]">) {
  return (
    <Suspense fallback={<TeamSkeleton />}>
      <TeamContent params={params} />
    </Suspense>
  );
}

async function TeamContent({ params }: { params: PageProps<"/teams/[id]">["params"] }) {
  const { id } = await params;
  const teamId = Number(id);
  if (!Number.isInteger(teamId)) notFound();

  const teams = await getTeams();
  const team = teams.find((t) => t.id === teamId);
  if (!team) notFound();

  const [roster, recent, upcoming, standings] = await Promise.all([
    getTeamRosterStats(teamId),
    getRecentMatchups(teamId),
    getUpcomingGames(teamId),
    getStandingsBefore(),
  ]);
  const teamsById = new Map(teams.map((t) => [t.id, t]));
  // Rivales de los partidos: solo lo que se pinta (al navegador no viajan balances ni nóminas)
  const rivals: Record<number, RivalLite> = Object.fromEntries(
    [...recent, ...upcoming]
      .map((g) => teamsById.get(g.home_team_id === teamId ? g.away_team_id : g.home_team_id))
      .filter((t): t is Team => t !== undefined)
      .map((t) => [t.id, { id: t.id, name: t.name, abbreviation: t.abbreviation }])
  );
  const accent = teamAccent(team);
  // Al navegador solo viaja el balance de antes de la jornada (Tarea 6.6); el de al día, desde /api/standings en Nivel 3
  const before: StandingsBefore = { day: standings.day, teams: standings.teams?.filter((t) => t.id === teamId) ?? null };
  const card: Omit<TeamCardData, "record" | "beforeDay"> = {
    id: team.id,
    name: team.name,
    primary: team.primary_color ?? "#334155",
    secondary: team.secondary_color ?? team.primary_color ?? "#334155",
    accent,
    conference: team.conference ? CONFERENCE_LABEL[team.conference] : null,
    division: team.division,
    upcoming: upcoming.map((g) => {
      const home = g.home_team_id === teamId;
      const rivalId = home ? g.away_team_id : g.home_team_id;
      return { id: g.id, utc: g.game_datetime_utc, home, rivalId, rival: teamsById.get(rivalId)?.abbreviation ?? "—" };
    }),
  };

  return (
    <>
      <title>{`${team.name} · ${BRAND.name}`}</title>
      <TeamHero team={team} card={card} before={before} />
      {/* minmax(0, 1fr): ninguna tabla ni fila ensancha la página en móvil (la plantilla se desplaza dentro) */}
      <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-3">
        <section className="min-w-0 lg:col-span-2">
          <SectionTitle accent={accent} count={roster.rows.length}>
            Plantilla
          </SectionTitle>
          <RosterTable rows={roster.rows} accent={accent} salarySeason={SEASON} />
          <p className="mt-3 text-xs text-slate-400">
            Promedios de la fase regular {roster.season} · Salario {SEASON} (≈ = aproximado) · Pulsa una columna para ordenar
          </p>
        </section>
        <div className="min-w-0 space-y-10">
          <section>
            <SectionTitle accent={accent}>Últimos partidos</SectionTitle>
            <TeamRecentGames teamId={teamId} games={recent} rivals={rivals} />
          </section>
          <section>
            <SectionTitle accent={accent}>Próximos partidos</SectionTitle>
            {upcoming.length === 0 ? (
              <p className="py-4 text-sm text-slate-400">No hay partidos programados.</p>
            ) : (
              <ul>
                {upcoming.map((game) => (
                  <TeamGameRow
                    key={game.id}
                    teamId={teamId}
                    game={game}
                    rival={rivals[game.home_team_id === teamId ? game.away_team_id : game.home_team_id]}
                  />
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function TeamHero({ team, card, before }: { team: Team; card: Omit<TeamCardData, "record" | "beforeDay">; before: StandingsBefore }) {
  const primary = team.primary_color ?? "#334155";
  const conference = team.conference ? CONFERENCE_LABEL[team.conference] : null;

  return (
    // Márgenes negativos: la cabecera ocupa todo el ancho del área de contenido
    <header
      className="relative -mx-4 -mt-4 overflow-hidden md:-mx-8 md:-mt-8"
      style={{ background: `linear-gradient(115deg, ${primary} 0%, ${primary}b3 35%, #020617 85%)` }}
    >
      {/* Oscurece colores de franquicia claros para que el texto blanco siempre se lea */}
      <div className="absolute inset-0 bg-slate-950/45" aria-hidden />
      <Image
        src={teamLogoUrl(team.id)}
        alt=""
        width={420}
        height={420}
        unoptimized
        loading="eager"
        fetchPriority="high"
        className="pointer-events-none absolute -right-20 top-1/2 size-[420px] -translate-y-1/2 opacity-15"
      />

      <div className="relative px-4 pb-7 pt-8 md:px-8 md:pt-12">
        <div className="flex items-center gap-4 md:gap-6">
          <Image
            src={teamLogoUrl(team.id)}
            alt={`Logo de ${team.name}`}
            width={112}
            height={112}
            unoptimized
            priority
            className="size-20 shrink-0 drop-shadow-lg md:size-28"
          />
          <div className="min-w-0">
            <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-white/75">
              {[conference && `Conferencia ${conference}`, team.division && `División ${team.division}`]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <h1 className="font-display text-4xl font-extrabold uppercase leading-[0.9] text-white md:text-7xl">
              {team.name}
            </h1>
          </div>
        </div>

        <TeamRecordStats
          teamId={team.id}
          conference={conference}
          before={before}
          card={card}
          actions={<FavoriteButton kind="team" team={{ id: team.id, name: team.name, abbreviation: team.abbreviation }} />}
        />
      </div>
      {/* Franja inferior con el color secundario de la franquicia */}
      <div className="relative h-1" style={{ background: team.secondary_color ?? primary }} aria-hidden />
    </header>
  );
}

function SectionTitle({ accent, count, children }: { accent: string; count?: number; children: ReactNode }) {
  return (
    <h2 className="flex items-center gap-3 border-b border-slate-800 pb-3 font-display text-2xl font-bold uppercase tracking-wide text-white">
      <span className="h-6 w-1" style={{ background: accent }} aria-hidden />
      {children}
      {count !== undefined && <span className="text-slate-500">{count}</span>}
    </h2>
  );
}

function TeamSkeleton() {
  return (
    <div className="animate-pulse" aria-busy>
      <div className="-mx-4 -mt-4 h-72 bg-slate-900 md:-mx-8 md:-mt-8" />
      <div className="mt-8 grid gap-10 lg:grid-cols-3">
        <div className="h-96 bg-slate-900/60 lg:col-span-2" />
        <div className="space-y-10">
          <div className="h-56 bg-slate-900/60" />
          <div className="h-56 bg-slate-900/60" />
        </div>
      </div>
    </div>
  );
}
