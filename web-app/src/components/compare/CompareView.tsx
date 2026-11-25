"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, LoaderCircle } from "lucide-react";
import { DuelRadar } from "@/components/compare/DuelRadar";
import { DuelRows } from "@/components/compare/DuelRows";
import { EraSwitch, LeagueContext } from "@/components/compare/EraAdjust";
import { PlayerPicker } from "@/components/compare/PlayerPicker";
import { PlayerPhoto } from "@/components/players/PlayerPhoto";
import { loadSearchIndex } from "@/components/search/SearchCommand";
import { Section, Segmented } from "@/components/games/detail/ui";
import { CompareCardExport } from "@/components/share/CompareShareCard";
import { CAREER, defaultSeason, FEATURED_DUELS, radarRows, score, statRows, trophyRows, type Side } from "@/lib/compare";
import type { DuelPlayer, DuelSeason } from "@/lib/compare-data";
import { adjustLine, pickReference, referenceSeasons, withRealValues, type LeagueTable } from "@/lib/era-adjust";
import { teamLogoUrl } from "@/lib/nba-cdn";
import { positionLabel, RADAR_LABEL } from "@/lib/player-profile";
import type { SearchIndex } from "@/lib/search";
import type { SeasonType } from "@/lib/supabase";
import { countryLabel } from "@/lib/places";
import { matchupAccents, teamBackdrop } from "@/lib/team-colors";
import { formatMoney, SEASON } from "@/lib/trade-rules";
import { cn } from "@/lib/utils";

const FALLBACK_COLORS = { primary_color: "#f97316", secondary_color: null };
const PHASES: { value: SeasonType; label: string }[] = [
  { value: "Regular Season", label: "Fase regular" },
  { value: "Playoffs", label: "Playoffs" },
];

/** Ajuste por épocas: encendido o no y la temporada a la que se lleva todo ("" = la última cerrada). */
type Era = { on: boolean; reference: string };

export const seasonLabel = (season: Pick<DuelSeason, "id">) => (season.id === CAREER ? "Carrera" : season.id);
/** Referencia por defecto: la última temporada cerrada, que no cambia de un día a otro. */
const LAST_CLOSED_SEASON = `${Number(SEASON.slice(0, 4)) - 1}-${SEASON.slice(2, 4)}`;
const lastName = (name: string) => name.split(" ").slice(1).join(" ") || name;
const yearsOld = (age: number | null) => (age ? `${age} años` : null);

/** Colores de los dos jugadores, garantizando que se distinguen entre sí. */
export function duelColors(a: DuelPlayer, b: DuelPlayer): [string, string] {
  const { away, home } = matchupAccents(a.team ?? FALLBACK_COLORS, b.team ?? FALLBACK_COLORS);
  return [away, home];
}

/** Comparador: los jugadores van en la URL, así que cualquier duelo se puede enlazar y compartir. */
export function CompareView({ a, b, leagues }: { a: DuelPlayer | null; b: DuelPlayer | null; leagues: LeagueTable | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [changing, setChanging] = useState<Side | null>(null);
  // Aquí y no en el duelo: al cambiar de jugador se mantiene
  const [era, setEra] = useState<Era>({ on: false, reference: "" });
  // El buscador va al lado que se quiere cambiar o, si no, al primero que esté libre
  const target = changing ?? (!a ? "a" : !b ? "b" : null);

  function choose(side: Side, playerId: number) {
    const ids = { a: a?.id, b: b?.id, [side]: playerId };
    const query = new URLSearchParams(Object.entries(ids).flatMap(([key, id]) => (id ? [[key, String(id)]] : []))).toString();
    setChanging(null);
    startTransition(() => router.replace(`/compare?${query}`, { scroll: false }));
  }

  function swap() {
    if (a && b) startTransition(() => router.replace(`/compare?a=${b.id}&b=${a.id}`, { scroll: false }));
  }

  return (
    <>
      <div className="relative grid grid-cols-2 border-b border-slate-800">
        <PlayerSide player={a} active={target === "a"} label="Primer jugador" onChange={() => setChanging(changing === "a" ? null : "a")} />
        <PlayerSide player={b} active={target === "b"} label="Segundo jugador" onChange={() => setChanging(changing === "b" ? null : "b")} align="right" />
        <SwapButton onClick={swap} disabled={!a || !b} pending={pending} ready={!!(a && b)} />
      </div>

      {target && (
        <div className="border-b border-slate-800 px-4 py-3 md:px-8">
          <PlayerPicker
            key={target}
            label={target === "a" ? "Primer jugador" : "Segundo jugador"}
            exclude={(target === "a" ? b : a)?.id ?? null}
            autoFocus={changing !== null}
            onPick={(id) => choose(target, id)}
          />
        </div>
      )}

      {a && b && leagues ? <Duel key={`${a.id}-${b.id}`} a={a} b={b} leagues={leagues} era={era} onEra={setEra} /> : <FeaturedDuels />}
    </>
  );
}

/**
 * Botón central. En móvil, más pequeño (40 px) y con las fotos sin llegar al centro, para que no tape a nadie
 * (Tarea 6.20).
 */
function SwapButton({ onClick, disabled, pending, ready }: { onClick?: () => void; disabled: boolean; pending: boolean; ready: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Intercambiar jugadores"
      className="absolute left-1/2 top-1/2 flex size-[2.875rem] -translate-x-1/2 -translate-y-1/2 items-center justify-center bg-orange-500 font-display text-xl font-extrabold text-slate-950 shadow-[0_0_0_3px_#020617] transition-colors enabled:hover:bg-orange-400 sm:size-14 sm:text-2xl sm:shadow-[0_0_0_4px_#020617] md:size-16"
    >
      {pending ? <LoaderCircle className="size-5 animate-spin sm:size-6" /> : ready ? <ArrowLeftRight className="size-5 sm:size-6" /> : "VS"}
    </button>
  );
}

/** Lo que pinta la cabecera de cada lado: el jugador completo o, mientras carga, lo del índice del buscador. */
type HeroPlayer = Pick<DuelPlayer, "id" | "active" | "position" | "team"> & { name: string | null };

function PlayerSide({
  player,
  active,
  label,
  onChange,
  align = "left",
  loading = false,
}: {
  player: HeroPlayer | null;
  active: boolean;
  label: string;
  onChange?: () => void;
  align?: "left" | "right";
  loading?: boolean;
}) {
  const primary = teamBackdrop(player?.team?.primary_color, "#1e293b");
  const right = align === "right";
  const status = player && [player.active ? player.team?.abbreviation : "Retirado", positionLabel(player.position)].filter(Boolean).join(" · ");

  return (
    <section
      className="relative min-w-0 overflow-hidden"
      aria-label={label}
      style={{ background: `linear-gradient(${right ? 245 : 115}deg, ${primary} 0%, ${primary}b3 40%, #020617 95%)` }}
    >
      <div className="absolute inset-0 bg-slate-950/45" aria-hidden />
      {player?.team && (
        <Image
          src={teamLogoUrl(player.team.id)}
          alt=""
          width={320}
          height={320}
          unoptimized
          loading="eager"
          className={cn("pointer-events-none absolute top-1/2 size-[320px] max-w-none -translate-y-1/2 opacity-15", right ? "-left-20" : "-right-20")}
        />
      )}

      <div className={cn("relative flex h-full flex-col justify-end px-3 pb-4 pt-5 md:px-8", player ? "min-h-[300px] md:min-h-[380px]" : "min-h-40", right && "items-end text-right")}>
        {player && (
          // Hasta md, la foto deja libre el centro: ahí va el botón de intercambiar
          <PlayerPhoto
            id={player.id}
            alt={player.name ?? ""}
            width={460}
            height={336}
            priority
            className={cn(
              "mb-auto h-auto w-[calc(100%-1rem)] max-w-[340px] drop-shadow-[0_10px_30px_rgba(0,0,0,0.6)] md:w-full",
              right ? "self-end" : "self-start"
            )}
          />
        )}
        {player && loading ? (
          // Cargando: nombre del índice si ya está (si no, una barra) y sin "Cambiar" hasta que llegue el duelo
          <div aria-busy className={cn("flex w-full flex-col", right && "items-end")}>
            <p className="min-h-4 font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-white/75 md:text-xs">{status}</p>
            {player.name ? (
              <p className="font-display text-3xl font-extrabold uppercase leading-[0.9] text-white md:text-5xl">{player.name}</p>
            ) : (
              <span className="mt-1 h-7 w-3/4 animate-pulse bg-white/15 md:h-11" />
            )}
            <span className="mt-2 h-5" />
          </div>
        ) : player ? (
          <>
            <p className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-white/75 md:text-xs">{status}</p>
            <Link href={`/players/${player.id}`} className="font-display text-3xl font-extrabold uppercase leading-[0.9] text-white hover:text-orange-300 md:text-5xl">
              {player.name}
            </Link>
            <button type="button" onClick={onChange} className="mt-2 w-fit font-display text-sm font-bold uppercase tracking-wider text-orange-300 hover:text-orange-200">
              {active ? "Cancelar" : "Cambiar"}
            </button>
          </>
        ) : (
          <p className={cn("font-display text-2xl font-extrabold uppercase leading-none md:text-4xl", active ? "text-white" : "text-white/50")}>{label}</p>
        )}
      </div>
    </section>
  );
}

/**
 * Carga en frío de un duelo por URL: la foto sale ya (solo depende del id) y el nombre, el equipo y sus colores, del
 * índice del buscador (ligero y en caché), mientras el servidor prepara las temporadas de los dos.
 */
export function CompareLoading({ a, b }: { a: number | null; b: number | null }) {
  const [index, setIndex] = useState<SearchIndex | null>(null);
  useEffect(() => {
    loadSearchIndex().then(setIndex, () => {});
  }, []);

  const hero = (id: number | null): HeroPlayer | null => {
    if (!id) return null;
    const found = index?.players.find((p) => p.id === id);
    const team = found?.team_id ? index?.teams.find((t) => t.id === found.team_id) : undefined;
    return {
      id,
      name: found?.full_name ?? null,
      active: found?.is_active ?? true,
      position: found?.position ?? null,
      team: team
        ? { id: team.id, name: team.name, abbreviation: team.abbreviation, primary_color: team.primary_color, secondary_color: team.secondary_color }
        : null,
    };
  };

  return (
    <>
      <div className="relative grid grid-cols-2 border-b border-slate-800">
        <PlayerSide player={hero(a)} active={false} label="Primer jugador" loading />
        <PlayerSide player={hero(b)} active={false} label="Segundo jugador" align="right" loading />
        <SwapButton disabled pending ready={false} />
      </div>
      <div className="m-4 h-96 animate-pulse bg-slate-900/60 md:m-8" aria-hidden />
    </>
  );
}

function FeaturedDuels() {
  return (
    <Section title="Duelos destacados">
      <ul className="grid gap-px bg-slate-800 sm:grid-cols-2 xl:grid-cols-3">
        {FEATURED_DUELS.map(({ a, b, title }) => (
          <li key={`${a.id}-${b.id}`} className="bg-slate-950">
            <Link href={`/compare?a=${a.id}&b=${b.id}`} className="block px-3 py-3 transition-colors hover:bg-slate-900">
              <span className="flex items-center justify-between gap-2">
                <PlayerPhoto id={a.id} width={96} height={70} className="h-[70px] w-24 object-cover object-top" />
                <span className="font-display text-xl font-extrabold text-orange-400">VS</span>
                <PlayerPhoto id={b.id} width={96} height={70} className="h-[70px] w-24 object-cover object-top" />
              </span>
              <span className="mt-2 block text-center font-display text-lg font-bold uppercase leading-tight text-white">
                {lastName(a.name)} – {lastName(b.name)}
              </span>
              <span className="block text-center text-xs text-slate-300">{title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function SeasonSelect({ player, phase, value, onChange }: { player: DuelPlayer; phase: SeasonType; value: string; onChange: (season: string) => void }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={`Temporada de ${player.name}`}
      className="w-full min-w-0 border border-slate-700 bg-slate-950 px-2 py-1.5 font-display text-base font-bold uppercase text-white outline-none focus-visible:border-orange-400"
    >
      {player.seasons
        .filter((season) => season.phase === phase)
        .map((season) => (
          <option key={season.id} value={season.id}>
            {seasonLabel(season)}
            {season.id !== CAREER && season.team ? ` · ${season.team}` : ""}
          </option>
        ))}
    </select>
  );
}

const seasonsOf = (player: DuelPlayer, phase: SeasonType) => player.seasons.filter((season) => season.phase === phase);

function pickSeason(player: DuelPlayer, phase: SeasonType, id: string): DuelSeason | null {
  const seasons = seasonsOf(player, phase);
  return seasons.find((season) => season.id === id) ?? seasons[0] ?? null;
}

function Duel({ a, b, leagues, era, onEra }: { a: DuelPlayer; b: DuelPlayer; leagues: LeagueTable; era: Era; onEra: (era: Era) => void }) {
  // Con una leyenda de por medio lo justo es carrera contra carrera; entre activos, su última temporada
  const initial = (player: DuelPlayer) => (a.active && b.active ? defaultSeason(seasonsOf(player, "Regular Season")) : CAREER);
  const [phase, setPhase] = useState<SeasonType>("Regular Season");
  const [seasonIdA, setSeasonIdA] = useState(() => initial(a));
  const [seasonIdB, setSeasonIdB] = useState(() => initial(b));

  const seasonA = pickSeason(a, phase, seasonIdA);
  const seasonB = pickSeason(b, phase, seasonIdB);
  const colors = duelColors(a, b);
  const referenceId = pickReference(era.reference || LAST_CLOSED_SEASON, phase, leagues);
  const reference = leagues[phase][referenceId];

  const controls = (
    <div className="border-b border-slate-800 px-4 py-3 md:px-8">
      <Segmented label="Fase" options={PHASES} value={phase} onChange={setPhase} className="mx-auto" />
      {seasonA && seasonB && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <SeasonSelect player={a} phase={phase} value={seasonA.id} onChange={setSeasonIdA} />
          <SeasonSelect player={b} phase={phase} value={seasonB.id} onChange={setSeasonIdB} />
        </div>
      )}
      {seasonA && seasonB && (
        <EraSwitch
          on={era.on}
          onToggle={() => onEra({ ...era, on: !era.on })}
          reference={referenceId}
          references={referenceSeasons(phase, leagues)}
          onReference={(season) => onEra({ ...era, reference: season })}
        />
      )}
    </div>
  );

  if (!seasonA || !seasonB) {
    const missing = !seasonA ? a : b;
    return (
      <>
        {controls}
        <p className="px-4 py-6 text-sm text-slate-300 md:px-8">
          {missing.name} {phase === "Playoffs" ? "no tiene partidos de playoffs." : "aún no tiene estadísticas: lo podrás comparar cuando debute."}
        </p>
      </>
    );
  }

  const radarA = era.on ? seasonA.eraRadar : seasonA.radar;
  const radarB = era.on ? seasonB.eraRadar : seasonB.radar;
  const attributes = radarRows(radarA, radarB, RADAR_LABEL);
  const realStats = statRows(seasonA.line, seasonB.line);
  const stats = era.on
    ? withRealValues(statRows(adjustLine(seasonA.line, seasonA.league, reference), adjustLine(seasonB.line, seasonB.league, reference)), realStats)
    : realStats;
  const trophies = trophyRows(a.trophies, b.trophies);
  const incomplete = [...Object.values(radarA), ...Object.values(radarB)].some((value) => value === null);
  const careerView = seasonA.id === CAREER && seasonB.id === CAREER;

  return (
    <>
      {controls}

      <Section title="Atributos" aside={<ScoreBadge a={a} b={b} rows={attributes} />}>
        <div className="grid items-center gap-6 lg:grid-cols-2">
          <figure>
            <DuelRadar a={radarA} b={radarB} colors={colors} />
            <figcaption className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-slate-300">
              <Legend color={colors[0]}>
                {a.name} · {seasonLabel(seasonA)}
              </Legend>
              <Legend color={colors[1]} dashed>
                {b.name} · {seasonLabel(seasonB)}
              </Legend>
            </figcaption>
          </figure>
          <div>
            <DuelRows rows={attributes} colors={colors} />
            <p className="mt-3 text-xs leading-relaxed text-slate-400">
              Escala histórica: percentil de 0 a 99 frente a {careerView ? "todas las carreras" : "todas las temporadas"} de la base de datos, estrellas de hoy y leyendas,{" "}
              {era.on
                ? "cada una medida contra la media de su liga en anotación, creación, rebote y eficiencia (tiro exterior y defensa, sin ajustar)."
                : "sin ajustar por época."}{" "}
              Por eso no coincide con la ficha del jugador, que lo compara solo con la liga de esta temporada.
              {incomplete && " La NBA no registró robos y tapones hasta 1973-74 ni triples hasta 1979-80."}
            </p>
          </div>
        </div>
      </Section>

      <Section title="Estadísticas" aside={<ScoreBadge a={a} b={b} rows={stats} />}>
        <DuelRows rows={stats} colors={colors} />
        {era.on && (
          <p className="mt-3 text-xs leading-relaxed text-slate-400">
            Puntos, rebotes, asistencias y tiro real llevados a la liga de {referenceId}. El resto de filas no cambia.
          </p>
        )}
      </Section>

      {era.on && <LeagueContext a={a} b={b} seasonA={seasonA} seasonB={seasonB} reference={reference} referenceId={referenceId} colors={colors} />}

      {trophies.length > 0 && (
        <Section title="Palmarés" aside={<ScoreBadge a={a} b={b} rows={trophies} />}>
          <DuelRows rows={trophies} colors={colors} />
        </Section>
      )}

      <Section title="Ficha">
        <dl className="border-t border-slate-800">
          {!careerView && <FactRow label="Edad esa temporada" a={yearsOld(seasonA.age)} b={yearsOld(seasonB.age)} />}
          <FactRow label="Edad actual" a={a.active ? yearsOld(a.age) : "Retirado"} b={b.active ? yearsOld(b.age) : "Retirado"} />
          <FactRow label="Altura" a={a.height} b={b.height} />
          <FactRow label="Peso" a={a.weight} b={b.weight} />
          <FactRow label="País" a={countryLabel(a.country)} b={countryLabel(b.country)} />
          <FactRow label="Draft" a={a.draft} b={b.draft} />
          {(a.salary !== null || b.salary !== null) && <FactRow label="Salario" a={a.salary === null ? null : formatMoney(a.salary)} b={b.salary === null ? null : formatMoney(b.salary)} />}
        </dl>
      </Section>

      <div className="px-4 py-6 md:px-8">
        <CompareCardExport
          a={a}
          b={b}
          seasonA={seasonA}
          seasonB={seasonB}
          radars={[radarA, radarB]}
          attributes={attributes}
          stats={stats}
          colors={colors}
          era={era.on ? referenceId : null}
        />
      </div>
    </>
  );
}

function Legend({ color, dashed, children }: { color: string; dashed?: boolean; children: ReactNode }) {
  return (
    <span className="flex items-center gap-2">
      <span className="w-5 border-t-[3px]" style={{ borderColor: color, borderStyle: dashed ? "dashed" : "solid" }} aria-hidden />
      {children}
    </span>
  );
}

function ScoreBadge({ a, b, rows }: { a: DuelPlayer; b: DuelPlayer; rows: ReturnType<typeof statRows> }) {
  const { a: scoreA, b: scoreB } = score(rows);
  return (
    <p className="font-display text-lg font-bold uppercase text-white tabular-nums">
      <span className="text-slate-300">{lastName(a.name)}</span> {scoreA} – {scoreB} <span className="text-slate-300">{lastName(b.name)}</span>
    </p>
  );
}

function FactRow({ label, a, b }: { label: string; a: string | null; b: string | null }) {
  return (
    <div className="grid grid-cols-3 items-baseline gap-3 border-b border-slate-800/80 py-2 font-display">
      <dd className="text-lg font-bold text-white">{a ?? "–"}</dd>
      <dt className="text-center text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-300">{label}</dt>
      <dd className="text-right text-lg font-bold text-white">{b ?? "–"}</dd>
    </div>
  );
}
