import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { cacheLife } from "next/cache";
import { notFound } from "next/navigation";
import { Swords } from "lucide-react";
import { FavoriteButton } from "@/components/favorites/FavoriteButton";
import { JsonLd } from "@/components/layout/JsonLd";
import { SharedLanding } from "@/components/layout/SharedLink";
import { CareerTable } from "@/components/players/CareerTable";
import { ContractTable } from "@/components/players/ContractTable";
import { PlayerCard3D } from "@/components/players/PlayerCard3D";
import { PlayerCardSkeleton } from "@/components/players/PlayerCardSkeleton";
import { PlayerRadarChart } from "@/components/players/PlayerRadarChart";
import { PlayerCardExport } from "@/components/share/PlayerShareCard";
import { LevelHighs } from "@/components/players/LevelHighs";
import { trophyCounts } from "@/components/trophies/trophy-catalog";
import { TrophyShowcase } from "@/components/trophies/TrophyShowcase";
import type { RivalLite } from "@/components/teams/TeamGameRow";
import { TeamRecentGames } from "@/components/teams/TeamRecentGames";
import type { GameMatchup } from "@/lib/game-day";
import { buildContractView } from "@/lib/player-contract";
import { getPlayer, getPlayerAwards, getPlayerCareer, getPlayerContract, getPlayerHighsBefore, getRecentMatchups, getTeams } from "@/lib/queries";
import { teamLogoUrl } from "@/lib/nba-cdn";
import { cardTier, legendLine, splitName } from "@/lib/player-card";
import {
  ageFrom,
  archetypeOf,
  avg,
  formatDraft,
  getRadar,
  OVERALL_EXPLAINED,
  overallRating,
  pct,
  positionLabel,
  RADAR_LABEL,
  sampleNote,
  shotPct,
  tierOf,
} from "@/lib/player-profile";
import { countryLabel } from "@/lib/places";
import { idFromSegment, playerPath, teamPath } from "@/lib/routes";
import { pageMetadata, playerMeta } from "@/lib/seo";
import { playerJsonLd } from "@/lib/structured-data";
import { teamAccent, teamBackdrop } from "@/lib/team-colors";
import { SEASON } from "@/lib/trade-rules";
import { RADAR_CATEGORIES, type Player, type PlayerSeasonStats, type RadarAttributes, type Team } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "atributos", label: "Atributos" },
  { id: "partidos", label: "Partidos", activeOnly: true },
  { id: "contrato", label: "Contrato", activeOnly: true },
  { id: "trayectoria", label: "Trayectoria" },
  { id: "palmares", label: "Palmarés" },
];

const NO_GAMES: GameMatchup[] = [];

/** La edad depende de la fecha actual: se cachea para no romper el prerenderizado. */
async function currentAge(birthDate: string | null): Promise<number | null> {
  "use cache";
  cacheLife("hours");
  return ageFrom(birthDate);
}

/** Ficha y promedios (los del job diario, Nivel 1). La imagen sale de `opengraph-image.tsx`. */
export async function generateMetadata({ params }: PageProps<"/players/[id]">): Promise<Metadata> {
  const { id } = await params;
  const playerId = idFromSegment(id);
  const [player, teams, career] = await Promise.all([playerId ? getPlayer(playerId) : null, getTeams(), playerId ? getPlayerCareer(playerId) : []]);
  if (!player) return pageMetadata({ title: "Jugador", path: `/players/${id}`, image: null });
  const regular = career.filter((r) => r.season_type === "Regular Season");
  const row = player.is_active
    ? regular.filter((r) => r.season_id !== "Career").at(-1)
    : regular.find((r) => r.season_id === "Career");
  const line = row ? { label: row.season_id === "Career" ? "Carrera" : `Temporada ${row.season_id}`, pts: row.pts, reb: row.reb, ast: row.ast } : null;
  const team = teams.find((t) => t.id === player.team_id) ?? null;
  return pageMetadata({ ...playerMeta(player, positionLabel(player.position), team, line), path: playerPath(player.id, player.full_name), image: null });
}

export default function PlayerPage({ params }: PageProps<"/players/[id]">) {
  return (
    <Suspense fallback={<PlayerSkeleton />}>
      <PlayerContent params={params} />
    </Suspense>
  );
}

async function PlayerContent({ params }: { params: PageProps<"/players/[id]">["params"] }) {
  const { id } = await params;
  const playerId = idFromSegment(id);
  if (!playerId) notFound();

  const [player, teams, career, awards, contract, highs] = await Promise.all([
    getPlayer(playerId),
    getTeams(),
    getPlayerCareer(playerId),
    getPlayerAwards(playerId),
    getPlayerContract(playerId),
    // Récords de antes de la última jornada (Tarea 7.6): los de al día, solo en Nivel 3
    getPlayerHighsBefore(playerId),
  ]);
  if (!player) notFound();
  // Últimos partidos de su equipo: en el HTML solo rival y fecha (Nivel 1); el resto, según el nivel
  const recent = player.team_id ? await getRecentMatchups(player.team_id) : NO_GAMES;

  const age = await currentAge(player.birth_date);
  const team = teams.find((t) => t.id === player.team_id) ?? null;
  const accent = team ? teamAccent(team) : "#f97316";
  const radar = getRadar(player);
  const regular = career.filter((r) => r.season_type === "Regular Season");
  const careerRow = regular.find((r) => r.season_id === "Career") ?? null;
  // De un retirado interesa su carrera, no su última temporada
  const latest = player.is_active ? (regular.filter((r) => r.season_id !== "Career").at(-1) ?? null) : careerRow;
  const contractView = contract && player.is_active ? buildContractView(contract, SEASON) : null;
  // El GM solo tiene a los jugadores con equipo y contrato
  const tradeHref = contract && player.team_id ? `/gm-simulator?jugador=${player.id}` : null;
  const teamsById = new Map(teams.map((t) => [t.id, t]));
  const rivals: Record<number, RivalLite> = Object.fromEntries(
    recent
      .map((g) => teamsById.get(g.home_team_id === player.team_id ? g.away_team_id : g.home_team_id))
      .filter((t): t is Team => t !== undefined)
      .map((t) => [t.id, { id: t.id, name: t.name, abbreviation: t.abbreviation }])
  );

  return (
    <>
      <JsonLd data={playerJsonLd(player, team)} />
      <PlayerHero player={player} age={age} team={team} radar={radar} season={latest} honours={player.is_active ? "" : legendLine(trophyCounts(awards))} />
      {latest && <SeasonBand season={latest} />}
      <SectionNav active={player.is_active} />

      <section id="atributos" className="scroll-mt-[calc(7rem+env(safe-area-inset-top))] pt-8 md:scroll-mt-16">
        <SectionTitle accent={accent}>Atributos</SectionTitle>
        {radar ? (
          <div className="grid items-center gap-8 pt-4 lg:grid-cols-2">
            <PlayerRadarChart radar={radar} accent={accent} />
            <AttributeBars radar={radar} />
          </div>
        ) : (
          <p className="py-4 text-sm text-slate-400">
            {player.is_active ? (
              "Aún no hay datos suficientes para calcular sus atributos."
            ) : (
              <>
                Este radar solo existe para jugadores en activo.{" "}
                <Link href={`/compare?a=${player.id}`} className="font-semibold text-orange-400 hover:text-orange-300">
                  Míralo en el comparador
                </Link>
                , donde tiene su radar histórico.
              </>
            )}
          </p>
        )}
      </section>

      {player.is_active && (
        <section id="partidos" className="scroll-mt-[calc(7rem+env(safe-area-inset-top))] pt-10 md:scroll-mt-16">
          <SectionTitle accent={accent}>Últimos partidos{team && <span className="text-slate-500">{team.abbreviation}</span>}</SectionTitle>
          {team ? (
            <TeamRecentGames teamId={team.id} games={recent} rivals={rivals} playerId={player.id} />
          ) : (
            <p className="py-4 text-sm text-slate-400">Sin equipo ahora mismo.</p>
          )}
        </section>
      )}

      {player.is_active && (
        <section id="contrato" className="scroll-mt-[calc(7rem+env(safe-area-inset-top))] pt-10 md:scroll-mt-16">
          <SectionTitle accent={accent}>Contrato</SectionTitle>
          <ContractTable view={contractView} tradeHref={tradeHref} />
        </section>
      )}

      <section id="trayectoria" className="scroll-mt-[calc(7rem+env(safe-area-inset-top))] pt-10 md:scroll-mt-16">
        <SectionTitle accent={accent}>Trayectoria</SectionTitle>
        <div className="pt-4">
          <CareerTable rows={career} teams={teams.map((t) => ({ id: t.id, name: t.name }))} accent={accent} />
        </div>
      </section>

      <section id="palmares" className="scroll-mt-[calc(7rem+env(safe-area-inset-top))] pb-4 pt-10 md:scroll-mt-16">
        <SectionTitle accent={accent} count={awards.length || undefined}>
          Vitrina de trofeos
        </SectionTitle>
        <div className="pt-4">
          <TrophyShowcase awards={awards} name={player.full_name} />
        </div>
        <LevelHighs playerId={player.id} active={player.is_active} before={highs.highs} day={highs.day} />
      </section>
    </>
  );
}

// La misma caja en la ficha y en su hueco de carga, para que nada salte
const CARD_SLOT = "mx-auto mb-3 w-[214px] shrink-0 sm:w-[250px] md:mx-0 md:mb-8 md:mr-4 lg:mr-10 lg:w-[290px]";

function PlayerHero({
  player,
  age,
  team,
  radar,
  season,
  honours,
}: {
  player: Player;
  age: number | null;
  team: Team | null;
  radar: RadarAttributes | null;
  season: PlayerSeasonStats | null;
  /** Retirados: sus mayores logros, en lugar de la media. */
  honours: string;
}) {
  const primary = teamBackdrop(team?.primary_color);
  const { first: firstName, last: lastName } = splitName(player.full_name);
  const position = positionLabel(player.position);
  const overall = radar ? overallRating(radar) : null;
  const line = radar ? archetypeOf(radar) : honours;

  return (
    // Márgenes negativos: la cabecera ocupa todo el ancho del área de contenido
    <header
      className="relative -mx-4 -mt-4 overflow-hidden md:-mx-8 md:-mt-8"
      style={{ background: `linear-gradient(115deg, ${primary} 0%, ${primary}b3 35%, #020617 85%)` }}
    >
      <div className="absolute inset-0 bg-slate-950/45" aria-hidden />
      {team && (
        <Image
          src={teamLogoUrl(team.id)}
          alt=""
          width={480}
          height={480}
          unoptimized
          className="pointer-events-none absolute -right-24 top-1/2 size-[480px] -translate-y-1/2 opacity-15"
        />
      )}
      {/* Apellido gigante de fondo, como en los grafismos de presentación de TV */}
      <span
        className="pointer-events-none absolute -bottom-3 left-2 select-none whitespace-nowrap font-display text-[26vw] font-extrabold uppercase leading-[0.75] text-white/[0.06] md:text-[13rem]"
        aria-hidden
      >
        {lastName}
      </span>

      <div className="relative flex flex-col-reverse px-4 pt-3 md:flex-row md:items-end md:justify-between md:gap-6 md:px-8 md:pt-10">
        <div className="min-w-0 pb-7 pt-2 md:pb-9">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-display text-xs font-semibold uppercase tracking-[0.3em] text-white/75">
            {team ? (
              <Link href={teamPath(team.id, team.name)} className="flex items-center gap-2 hover:text-orange-300">
                <Image src={teamLogoUrl(team.id)} alt="" width={20} height={20} unoptimized className="size-5" />
                {team.name}
              </Link>
            ) : (
              <span>{player.is_active ? "Agente libre" : "Retirado"}</span>
            )}
            {position && <span aria-hidden>·</span>}
            {position && <span>{position}</span>}
          </p>
          <h1 className="mt-2 font-display font-extrabold uppercase leading-[0.85] text-white">
            {/* El espacio no se ve: sin él, buscadores y lectores de pantalla leen "NikolaJokić" */}
            <span className="block text-2xl text-white/85 md:text-4xl">{firstName}</span>{" "}
            <span className="block text-5xl md:text-8xl">{lastName}</span>
          </h1>

          {/* La media y el perfil van en la ficha 3D; aquí, en texto, para los lectores de pantalla */}
          {line && <p className="sr-only">{overall === null ? line : `Media ${overall}: ${line}. ${OVERALL_EXPLAINED}`}</p>}

          <dl className="mt-7 flex flex-wrap gap-x-8 gap-y-4">
            <HeroStat label="Edad">{age ?? "–"}</HeroStat>
            <HeroStat label="Altura">{player.height ?? "–"}</HeroStat>
            <HeroStat label="Peso">{player.weight ?? "–"}</HeroStat>
            <HeroStat label="País">{countryLabel(player.country) ?? "–"}</HeroStat>
            <HeroStat label="Draft">{formatDraft(player)}</HeroStat>
          </dl>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <PlayerCardExport
              player={player}
              // Nunca el `Team` entero a un componente de cliente: viajaría en el HTML con la clasificación al día
              team={team && { id: team.id, name: team.name, primary_color: team.primary_color, secondary_color: team.secondary_color }}
              radar={radar}
              season={season}
              age={age}
            />
            {/* Los favoritos ordenan la portada por los partidos de su equipo: solo jugadores en activo */}
            {player.is_active && (
              <FavoriteButton kind="player" player={{ id: player.id, name: player.full_name, teamId: player.team_id ?? null }} />
            )}
            <Link
              href={`/compare?a=${player.id}`}
              className="flex items-center gap-2 bg-orange-500 px-4 py-2.5 font-display text-base font-extrabold uppercase tracking-wide text-slate-950 transition-colors hover:bg-orange-400"
            >
              <Swords className="size-5" />
              Comparar
            </Link>
          </div>
        </div>

        {/* Ficha 3D (Tarea 7.4): en lugar de la foto suelta y la insignia de la media */}
        <SharedLanding target={{ kind: "player", id: player.id }}>
          <div className={CARD_SLOT}>
            <PlayerCard3D
              id={player.id}
              name={player.full_name}
              tier={cardTier(player.is_active, overall)}
              team={team}
              overall={overall}
              line={line || position || undefined}
              note={overall === null ? ((radar && sampleNote(radar)) ?? undefined) : OVERALL_EXPLAINED}
              bare
              priority
              greet
              className="w-full"
            />
          </div>
        </SharedLanding>
      </div>
      {/* Franja inferior con el color secundario de la franquicia */}
      <div className="relative h-1" style={{ background: team?.secondary_color ?? primary }} aria-hidden />
    </header>
  );
}

function HeroStat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="font-display text-[11px] font-semibold uppercase tracking-[0.25em] text-white/70">{label}</dt>
      <dd className="font-display text-2xl font-bold leading-tight text-white tabular-nums md:text-3xl">{children}</dd>
    </div>
  );
}

/** Banda de cifras de la última temporada, estilo rótulo de TV. */
function SeasonBand({ season }: { season: PlayerSeasonStats }) {
  const stats = [
    { label: "Puntos", value: avg(season.pts) },
    { label: "Rebotes", value: avg(season.reb) },
    { label: "Asistencias", value: avg(season.ast) },
    { label: "% Tiro", value: shotPct(season.fg_pct, season.totals?.fgm, season.totals?.fga) },
    { label: "% Triple", value: shotPct(season.fg3_pct, season.totals?.fg3m, season.totals?.fg3a) },
    { label: "TS%", value: pct(season.advanced_stats.ts_pct) },
  ];

  return (
    <div className="-mx-4 border-b border-slate-800 md:-mx-8">
      <p className="px-4 pt-4 font-display text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400 md:px-8">
        {season.season_id === "Career" ? "Carrera" : `Temporada ${season.season_id}`} · {season.games_played ?? 0} partidos
      </p>
      <dl className="grid grid-cols-3 md:grid-cols-6">
        {stats.map((s, i) => (
          <div key={s.label} className={cn("px-4 py-3 md:px-8", i % 3 !== 0 && "border-l border-slate-800", i === 3 && "md:border-l", i >= 3 && "border-t border-slate-800 md:border-t-0")}>
            <dt className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300">{s.label}</dt>
            <dd className="font-display text-3xl font-extrabold text-white tabular-nums md:text-4xl">{s.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Accesos rápidos a cada sección; se queda fijo al hacer scroll. */
function SectionNav({ active }: { active: boolean }) {
  return (
    <nav
      aria-label="Secciones del jugador"
      className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-10 -mx-4 border-b border-slate-800 bg-slate-950 px-4 md:top-0 md:-mx-8 md:px-8"
    >
      {/* Con 5 secciones no caben a 360 px: se desliza en horizontal */}
      <ul className="flex gap-5 overflow-x-auto [scrollbar-width:none] md:gap-6">
        {SECTIONS.filter((s) => active || !s.activeOnly).map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className="block whitespace-nowrap border-b-2 border-transparent py-3 font-display text-sm font-bold uppercase tracking-[0.15em] text-slate-400 transition-colors hover:border-orange-500 hover:text-white"
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Barras de percentil con su nivel en palabras y la marca de la media de la liga (50). */
function AttributeBars({ radar }: { radar: RadarAttributes }) {
  const note = sampleNote(radar);
  return (
    <div>
      <ul className="space-y-4">
        {RADAR_CATEGORIES.map((c) => {
          const value = radar[c];
          const tier = tierOf(value);
          return (
            <li key={c}>
              <div className="flex items-baseline justify-between">
                <span className="font-display text-base font-bold uppercase tracking-wide text-white">{RADAR_LABEL[c]}</span>
                <span className="font-display">
                  <span className={cn("mr-2 text-xs font-semibold uppercase tracking-[0.2em]", tier.textClass)}>{tier.label}</span>
                  <span className="text-2xl font-extrabold text-white tabular-nums">{value}</span>
                </span>
              </div>
              <div className="relative mt-1 h-2 bg-slate-800">
                <div className="h-full" style={{ width: `${value}%`, background: tier.color }} />
                <span className="absolute -top-1 left-1/2 h-4 w-px bg-slate-400" title="Media de la liga" aria-hidden />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-5 text-xs leading-relaxed text-slate-400">
        Percentil frente a los jugadores de rotación de la temporada {radar.season} (15 minutos o más en al menos el 40 % de los partidos):
        un 90 significa que supera al 90 % de ellos. La línea vertical marca la mitad de la tabla. La media de arriba sale de lo que aporta por
        partido (Game Score), no de estas barras.
        {note && ` ${note}`}
      </p>
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

function PlayerSkeleton() {
  return (
    <div aria-busy>
      <div className="-mx-4 -mt-4 flex min-h-[640px] flex-col bg-slate-900 px-4 pt-3 md:-mx-8 md:-mt-8 md:min-h-[480px] md:flex-row md:items-end md:justify-end md:px-8 md:pt-10">
        <PlayerCardSkeleton className={CARD_SLOT} />
      </div>
      <div className="-mx-4 h-24 border-b border-slate-800 md:-mx-8" />
      <div className="mt-8 grid animate-pulse gap-8 lg:grid-cols-2">
        <div className="h-80 bg-slate-900/60" />
        <div className="h-80 bg-slate-900/60" />
      </div>
    </div>
  );
}
