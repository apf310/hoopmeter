import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { notFound } from "next/navigation";
import { FavoriteButton } from "@/components/favorites/FavoriteButton";
import { SharedLanding } from "@/components/layout/SharedLink";
import type { TeamCardData } from "@/components/share/TeamShareCard";
import { TeamRecordStats } from "@/components/standings/TeamRecordStats";
import { RosterTable } from "@/components/teams/RosterTable";
import { TeamGameRow, type RivalLite } from "@/components/teams/TeamGameRow";
import { TeamLogoSkeleton } from "@/components/teams/TeamLogoSkeleton";
import { TeamRecentGames } from "@/components/teams/TeamRecentGames";
import type { GmTeam } from "@/lib/gm";
import { tradeSearch } from "@/lib/gm-link";
import { getGmData, getRecentMatchups, getStandingsBefore, getTeamRosterStats, getTeams, getUpcomingGames } from "@/lib/queries";
import { teamLogoUrl } from "@/lib/nba-cdn";
import { conferenceLabel, divisionLabel } from "@/lib/places";
import { pageMetadata, teamMeta } from "@/lib/seo";
import type { StandingsBefore } from "@/lib/standings";
import { teamAccent, teamBackdrop } from "@/lib/team-colors";
import type { Team } from "@/lib/supabase";
import { formatMoney, salaryZone, SEASON, ZONE_LABEL } from "@/lib/trade-rules";

/** Sin balance ni puesto (siguen el nivel, Tarea 6.6). La imagen sale de `opengraph-image.tsx`. */
export async function generateMetadata({ params }: PageProps<"/teams/[id]">): Promise<Metadata> {
  const { id } = await params;
  const team = (await getTeams()).find((t) => t.id === Number(id));
  if (!team) return pageMetadata({ title: "Equipo", path: `/teams/${id}`, image: null });
  return pageMetadata({ ...teamMeta(team, conferenceLabel(team.conference), divisionLabel(team.division)), path: `/teams/${team.id}`, image: null });
}

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

  const [roster, recent, upcoming, standings, gm] = await Promise.all([
    getTeamRosterStats(teamId),
    getRecentMatchups(teamId),
    getUpcomingGames(teamId),
    getStandingsBefore(),
    getGmData(),
  ]);
  const payroll = gm.teams.find((t) => t.id === teamId) ?? null;
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
    primary: teamBackdrop(team.primary_color),
    secondary: team.secondary_color ?? team.primary_color ?? "#334155",
    accent,
    conference: conferenceLabel(team.conference),
    division: divisionLabel(team.division),
    upcoming: upcoming.map((g) => {
      const home = g.home_team_id === teamId;
      const rivalId = home ? g.away_team_id : g.home_team_id;
      return { id: g.id, utc: g.game_datetime_utc, home, rivalId, rival: teamsById.get(rivalId)?.abbreviation ?? "—" };
    }),
  };

  return (
    <>
      <TeamHero team={team} card={card} before={before} payroll={payroll} />
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

function TeamHero({
  team,
  card,
  before,
  payroll,
}: {
  team: Team;
  card: Omit<TeamCardData, "record" | "beforeDay">;
  before: StandingsBefore;
  payroll: GmTeam | null;
}) {
  const primary = teamBackdrop(team.primary_color);
  const conference = conferenceLabel(team.conference);
  const division = divisionLabel(team.division);

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
          <SharedLanding target={{ kind: "team", id: team.id }}>
            <Image
              src={teamLogoUrl(team.id)}
              alt={`Logo de ${team.name}`}
              width={112}
              height={112}
              unoptimized
              priority
              className="size-20 shrink-0 drop-shadow-lg md:size-28"
            />
          </SharedLanding>
          <div className="min-w-0">
            <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-white/75">
              {[conference && `Conferencia ${conference}`, division && `División ${division}`]
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
        {payroll && <PayrollLink team={payroll} />}
      </div>
      {/* Franja inferior con el color secundario de la franquicia */}
      <div className="relative h-1" style={{ background: team.secondary_color ?? primary }} aria-hidden />
    </header>
  );
}

/**
 * Resumen de la nómina con acceso al GM con el equipo ya elegido (Tarea 6.21). No depende de ningún
 * resultado: se ve en los tres niveles, como el resto del GM.
 */
function PayrollLink({ team }: { team: GmTeam }) {
  const pending = team.pendingContracts ?? 0;
  return (
    <Link
      href={`/gm-simulator${tradeSearch({ teamIds: [team.id], players: [], picks: [] })}`}
      className="group mt-6 flex max-w-md items-center gap-4 border border-white/20 bg-slate-950/50 px-4 py-2.5 outline-none transition-colors hover:border-orange-400/70 hover:bg-slate-950/70 focus-visible:ring-2 focus-visible:ring-orange-400"
    >
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[11px] font-semibold uppercase tracking-[0.25em] text-white/70">Nómina {SEASON}</span>
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-display text-2xl font-bold leading-tight tabular-nums text-white">{formatMoney(team.payroll)}</span>
          <span className="text-sm text-slate-200">{ZONE_LABEL[salaryZone(team.payroll)]}</span>
        </span>
        {pending > 0 && (
          <span className="block text-xs text-white/70">
            Sin contar {pending === 1 ? "1 contrato" : `${pending} contratos`} sin cifra pública
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-0.5 font-display text-sm font-bold uppercase tracking-wider text-orange-400 transition-colors group-hover:text-orange-300">
        Abrir en GM
        <ChevronRight className="size-4" aria-hidden />
      </span>
    </Link>
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
    <div aria-busy>
      <div className="-mx-4 -mt-4 h-72 bg-slate-900 px-4 pt-8 md:-mx-8 md:-mt-8 md:px-8 md:pt-12">
        <TeamLogoSkeleton />
      </div>
      <div className="mt-8 grid animate-pulse gap-10 lg:grid-cols-3">
        <div className="h-96 bg-slate-900/60 lg:col-span-2" />
        <div className="space-y-10">
          <div className="h-56 bg-slate-900/60" />
          <div className="h-56 bg-slate-900/60" />
        </div>
      </div>
    </div>
  );
}
