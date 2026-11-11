import { Suspense, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { cacheLife } from "next/cache";
import { notFound } from "next/navigation";
import { Swords } from "lucide-react";
import { CareerTable } from "@/components/players/CareerTable";
import { PlayerRadarChart } from "@/components/players/PlayerRadarChart";
import { PlayerCardExport } from "@/components/share/PlayerShareCard";
import { CareerHighs, TrophyCabinet } from "@/components/players/TrophyCabinet";
import { BRAND } from "@/lib/brand";
import { getPlayer, getPlayerAwards, getPlayerCareer, getTeams } from "@/lib/queries";
import { playerHeadshotUrl, teamLogoUrl } from "@/lib/nba-cdn";
import {
  ageFrom,
  archetypeOf,
  avg,
  formatDraft,
  getRadar,
  overallRating,
  pct,
  positionLabel,
  RADAR_LABEL,
  tierOf,
} from "@/lib/player-profile";
import { teamAccent } from "@/lib/team-colors";
import { RADAR_CATEGORIES, type Player, type PlayerSeasonStats, type RadarAttributes, type Team } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "atributos", label: "Atributos" },
  { id: "palmares", label: "Palmarés" },
  { id: "trayectoria", label: "Trayectoria" },
];

/** La edad depende de la fecha actual: se cachea para no romper el prerenderizado. */
async function currentAge(birthDate: string | null): Promise<number | null> {
  "use cache";
  cacheLife("hours");
  return ageFrom(birthDate);
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
  const playerId = Number(id);
  if (!Number.isInteger(playerId)) notFound();

  const [player, teams, career, awards] = await Promise.all([
    getPlayer(playerId),
    getTeams(),
    getPlayerCareer(playerId),
    getPlayerAwards(playerId),
  ]);
  if (!player) notFound();

  const age = await currentAge(player.birth_date);
  const team = teams.find((t) => t.id === player.team_id) ?? null;
  const accent = team ? teamAccent(team) : "#f97316";
  const radar = getRadar(player);
  const regular = career.filter((r) => r.season_type === "Regular Season");
  const careerRow = regular.find((r) => r.season_id === "Career") ?? null;
  // De un retirado interesa su carrera, no su última temporada
  const latest = player.is_active ? (regular.filter((r) => r.season_id !== "Career").at(-1) ?? null) : careerRow;
  const highs = careerRow?.advanced_stats.career_highs;

  return (
    <>
      <title>{`${player.full_name} · ${BRAND.name}`}</title>
      <PlayerHero player={player} age={age} team={team} radar={radar} season={latest} />
      {latest && <SeasonBand season={latest} />}
      <SectionNav />

      <section id="atributos" className="scroll-mt-32 pt-8 md:scroll-mt-16">
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

      <section id="palmares" className="scroll-mt-32 pt-10 md:scroll-mt-16">
        <SectionTitle accent={accent} count={awards.length || undefined}>
          Vitrina de trofeos
        </SectionTitle>
        <div className="pt-4">
          <TrophyCabinet awards={awards} />
        </div>
        <h3 className="pb-3 pt-8 font-display text-lg font-bold uppercase tracking-wide text-slate-300">Récords personales en un partido</h3>
        <CareerHighs highs={highs} />
      </section>

      <section id="trayectoria" className="scroll-mt-32 pb-4 pt-10 md:scroll-mt-16">
        <SectionTitle accent={accent}>Trayectoria</SectionTitle>
        <div className="pt-4">
          <CareerTable rows={career} teamIds={teams.map((t) => t.id)} accent={accent} />
        </div>
      </section>
    </>
  );
}

function PlayerHero({
  player,
  age,
  team,
  radar,
  season,
}: {
  player: Player;
  age: number | null;
  team: Team | null;
  radar: RadarAttributes | null;
  season: PlayerSeasonStats | null;
}) {
  const primary = team?.primary_color ?? "#334155";
  const [firstName, ...rest] = player.full_name.split(" ");
  const lastName = rest.join(" ") || firstName;
  const position = positionLabel(player.position);

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

      <div className="relative flex flex-col-reverse px-4 pt-6 md:flex-row md:items-end md:justify-between md:gap-6 md:px-8 md:pt-10">
        <div className="min-w-0 pb-7 pt-2 md:pb-9">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-display text-xs font-semibold uppercase tracking-[0.3em] text-white/75">
            {team ? (
              <Link href={`/teams/${team.id}`} className="flex items-center gap-2 hover:text-orange-300">
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
            <span className="block text-2xl text-white/85 md:text-4xl">{rest.length ? firstName : ""}</span>
            <span className="block text-5xl md:text-8xl">{lastName}</span>
          </h1>

          {radar && <RatingBadge radar={radar} />}

          <dl className="mt-7 flex flex-wrap gap-x-8 gap-y-4">
            <HeroStat label="Edad">{age ?? "–"}</HeroStat>
            <HeroStat label="Altura">{player.height ?? "–"}</HeroStat>
            <HeroStat label="Peso">{player.weight ?? "–"}</HeroStat>
            <HeroStat label="País">{player.country ?? "–"}</HeroStat>
            <HeroStat label="Draft">{formatDraft(player)}</HeroStat>
          </dl>

          <div className="mt-7 flex flex-wrap items-end gap-x-8 gap-y-4">
            <PlayerCardExport player={player} team={team} radar={radar} season={season} age={age} />
            <Link
              href={`/compare?a=${player.id}`}
              className="flex items-center gap-2 bg-orange-500 px-4 py-2.5 font-display text-base font-extrabold uppercase tracking-wide text-slate-950 transition-colors hover:bg-orange-400"
            >
              <Swords className="size-5" />
              Comparar
            </Link>
          </div>
        </div>

        <Image
          src={playerHeadshotUrl(player.id)}
          alt={player.full_name}
          width={520}
          height={380}
          priority
          className="mx-auto h-auto w-[300px] shrink-0 drop-shadow-[0_10px_30px_rgba(0,0,0,0.6)] sm:w-[380px] md:mx-0 lg:w-[480px]"
        />
      </div>
      {/* Franja inferior con el color secundario de la franquicia */}
      <div className="relative h-1" style={{ background: team?.secondary_color ?? primary }} aria-hidden />
    </header>
  );
}

/** Insignia estilo videojuego: media global + arquetipo del jugador. */
function RatingBadge({ radar }: { radar: RadarAttributes }) {
  const overall = overallRating(radar);
  const tier = tierOf(overall);

  return (
    <div className="mt-5 flex w-fit items-stretch" title="Media de sus 4 mejores atributos (percentil 0-99)">
      <div
        className="flex flex-col items-center justify-center py-1.5 pl-4 pr-7 text-slate-950 [clip-path:polygon(0_0,100%_0,82%_100%,0_100%)]"
        style={{ background: tier.color }}
      >
        <span className="font-display text-5xl font-extrabold leading-none tabular-nums">{overall}</span>
        <span className="font-display text-[10px] font-bold uppercase tracking-[0.25em]">Media</span>
      </div>
      <div className="-ml-3 flex flex-col justify-center bg-slate-950/70 py-1.5 pl-6 pr-5 backdrop-blur-sm">
        <span className="font-display text-[10px] font-semibold uppercase tracking-[0.25em] text-white/60">Perfil · {tier.label}</span>
        <span className="font-display text-2xl font-bold uppercase leading-tight text-white">{archetypeOf(radar)}</span>
      </div>
    </div>
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
    { label: "% Tiro", value: pct(season.fg_pct) },
    { label: "% Triple", value: pct(season.fg3_pct) },
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
function SectionNav() {
  return (
    <nav
      aria-label="Secciones del jugador"
      className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-10 -mx-4 border-b border-slate-800 bg-slate-950/90 px-4 backdrop-blur md:top-0 md:-mx-8 md:px-8"
    >
      <ul className="flex gap-6">
        {SECTIONS.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className="block border-b-2 border-transparent py-3 font-display text-sm font-bold uppercase tracking-[0.15em] text-slate-400 transition-colors hover:border-orange-500 hover:text-white"
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
        Percentil frente al resto de la liga en la temporada {radar.season}: un 90 significa que supera al 90 % de los jugadores.
        La línea vertical marca la media.
        {!radar.qualified && ` Muestra reducida (${radar.games_played} partidos): valores orientativos.`}
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
    <div className="animate-pulse" aria-busy>
      <div className="-mx-4 -mt-4 h-[420px] bg-slate-900 md:-mx-8 md:-mt-8" />
      <div className="-mx-4 h-24 border-b border-slate-800 md:-mx-8" />
      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <div className="h-80 bg-slate-900/60" />
        <div className="h-80 bg-slate-900/60" />
      </div>
    </div>
  );
}
