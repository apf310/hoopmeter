import { Suspense, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FormStrip, PointDiff, Streak } from "@/components/standings/TeamForm";
import { BRAND } from "@/lib/brand";
import { getTeamRoster, getTeams, getUpcomingGames, type UpcomingGame } from "@/lib/queries";
import { playerHeadshotUrl, teamLogoUrl } from "@/lib/nba-cdn";
import { formatDraft } from "@/lib/player-profile";
import { teamAccent } from "@/lib/team-colors";
import type { Player, Team } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const CONFERENCE_LABEL: Record<string, string> = { East: "Este", West: "Oeste" };

// Horarios siempre en hora de España (incluye cambio de horario verano/invierno).
const TZ = "Europe/Madrid";
const dayFormat = new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short", timeZone: TZ });
const timeFormat = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: TZ });

const TH = "px-2 py-3 font-display text-xs font-semibold uppercase tracking-wider text-slate-300";

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

  const [roster, upcoming] = await Promise.all([getTeamRoster(teamId), getUpcomingGames(teamId)]);
  const teamsById = new Map(teams.map((t) => [t.id, t]));
  const accent = teamAccent(team);

  return (
    <>
      <title>{`${team.name} · ${BRAND.name}`}</title>
      <TeamHero team={team} />
      <div className="mt-8 grid gap-10 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <SectionTitle accent={accent} count={roster.length}>
            Plantilla
          </SectionTitle>
          <RosterTable roster={roster} accent={accent} />
        </section>
        <section>
          <SectionTitle accent={accent}>Próximos partidos</SectionTitle>
          <UpcomingGames teamId={teamId} games={upcoming} teamsById={teamsById} />
        </section>
      </div>
    </>
  );
}

function TeamHero({ team }: { team: Team }) {
  const primary = team.primary_color ?? "#334155";
  const conference = team.conference ? CONFERENCE_LABEL[team.conference] : null;
  const extra = team.standings_extra ?? {};
  const form = extra.form ?? [];

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

        <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-5">
          <HeroStat label="Balance">
            {team.wins}-{team.losses}
          </HeroStat>
          {team.conf_rank && conference && (
            <HeroStat label="Posición">
              <Link href="/standings" className="hover:text-orange-300">
                {team.conf_rank}º <span className="text-xl text-white/75">{conference}</span>
              </Link>
            </HeroStat>
          )}
          <HeroStat label="Racha">
            <Streak streak={extra.streak} />
          </HeroStat>
          <HeroStat label={form.length < 10 ? `Últimos ${form.length}` : "Últimos 10"}>
            <span className="flex h-9 items-center gap-3">
              <FormStrip form={form} size="lg" />
              {extra.l10 && <span className="text-2xl">{extra.l10}</span>}
            </span>
          </HeroStat>
          <HeroStat label="Casa">{extra.home ?? "–"}</HeroStat>
          <HeroStat label="Fuera">{extra.road ?? "–"}</HeroStat>
          <HeroStat label="Dif. puntos">
            <PointDiff value={extra.diff_ppg} />
          </HeroStat>
        </dl>
      </div>
      {/* Franja inferior con el color secundario de la franquicia */}
      <div className="relative h-1" style={{ background: team.secondary_color ?? primary }} aria-hidden />
    </header>
  );
}

function HeroStat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="font-display text-[11px] font-semibold uppercase tracking-[0.25em] text-white/70">{label}</dt>
      <dd className="font-display text-4xl font-bold leading-tight text-white tabular-nums">{children}</dd>
    </div>
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

function RosterTable({ roster, accent }: { roster: Player[]; accent: string }) {
  if (roster.length === 0) return <p className="py-4 text-sm text-slate-400">Sin jugadores registrados.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-800">
          <tr>
            <th className={cn(TH, "pl-0 text-left")}>Jugador</th>
            <th className={cn(TH, "text-left")}>Pos.</th>
            <th className={cn(TH, "hidden text-left sm:table-cell")}>Altura</th>
            <th className={cn(TH, "hidden text-left sm:table-cell")}>Peso</th>
            <th className={cn(TH, "hidden text-left md:table-cell")}>País</th>
            <th className={cn(TH, "hidden pr-0 text-left md:table-cell")}>Draft</th>
          </tr>
        </thead>
        <tbody>
          {roster.map((player) => (
            <tr key={player.id} className="border-b border-slate-800/80 transition-colors hover:bg-slate-900">
              <td className="py-1.5 pr-2">
                <Link href={`/players/${player.id}`} className="group flex items-center gap-3">
                  {/* Fondo teñido con el color del equipo detrás de la foto */}
                  <span className="flex h-11 w-[60px] shrink-0 items-end overflow-hidden" style={{ background: `${accent}26` }}>
                    <Image
                      src={playerHeadshotUrl(player.id)}
                      alt=""
                      width={60}
                      height={44}
                      className="h-11 w-[60px] object-cover object-top"
                    />
                  </span>
                  <span className="font-semibold text-white group-hover:text-orange-400">{player.full_name}</span>
                </Link>
              </td>
              <td className="px-2 font-display text-base font-semibold uppercase text-slate-200">{player.position ?? "–"}</td>
              <td className="hidden px-2 text-slate-300 tabular-nums sm:table-cell">{player.height ?? "–"}</td>
              <td className="hidden px-2 text-slate-300 tabular-nums sm:table-cell">{player.weight ?? "–"}</td>
              <td className="hidden px-2 text-slate-300 md:table-cell">{player.country ?? "–"}</td>
              <td className="hidden pl-2 text-slate-300 tabular-nums md:table-cell">{formatDraft(player)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UpcomingGames({
  teamId,
  games,
  teamsById,
}: {
  teamId: number;
  games: UpcomingGame[];
  teamsById: Map<number, Team>;
}) {
  if (games.length === 0) return <p className="py-4 text-sm text-slate-400">No hay partidos programados.</p>;

  return (
    <ul>
      {games.map((game) => {
        const isHome = game.home_team_id === teamId;
        const rival = teamsById.get(isHome ? game.away_team_id : game.home_team_id);
        const date = new Date(game.game_datetime_utc);
        return (
          <li key={game.id} className="flex items-center gap-4 border-b border-slate-800/80 py-3">
            <time dateTime={game.game_datetime_utc} className="w-20 shrink-0 font-display uppercase leading-tight">
              <span className="block text-sm font-semibold text-slate-300">{dayFormat.format(date)}</span>
              <span className="block text-xl font-bold text-white">{timeFormat.format(date)}</span>
            </time>
            <span className="w-6 text-center font-display text-sm font-bold uppercase text-slate-400">
              {isHome ? "vs" : "@"}
            </span>
            {rival && (
              <Link href={`/teams/${rival.id}`} className="flex min-w-0 items-center gap-2 font-semibold text-white hover:text-orange-400">
                <Image src={teamLogoUrl(rival.id)} alt="" width={28} height={28} unoptimized className="size-7 shrink-0" />
                <span className="truncate">{rival.name}</span>
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function TeamSkeleton() {
  return (
    <div className="animate-pulse" aria-busy>
      <div className="-mx-4 -mt-4 h-72 bg-slate-900 md:-mx-8 md:-mt-8" />
      <div className="mt-8 grid gap-10 lg:grid-cols-3">
        <div className="h-96 bg-slate-900/60 lg:col-span-2" />
        <div className="h-48 bg-slate-900/60" />
      </div>
    </div>
  );
}
