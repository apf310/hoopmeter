"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight, EyeOff, Star, WifiOff } from "lucide-react";
import { PureScoreBadge } from "@/components/games/PureScoreBadge";
import { announceLevelIntent, onLevelIntent, useSpoiler } from "@/context/SpoilerContext";
import { favoriteTeamReasons } from "@/lib/favorites";
import { useFavorites, useFreshFavoritePlayerTeams } from "@/lib/favorites-store";
import { formatDayMonth, formatWeekday, gameDayOf, todayGameDay, type TeamLite } from "@/lib/game-day";
import { loadWatchList, useWatchList } from "@/lib/game-day-store";
import { teamLogoUrl } from "@/lib/nba-cdn";
import { cn } from "@/lib/utils";
import {
  WATCH_PERIODS,
  gameOfTheWeek,
  rankGames,
  watchSearch,
  type ScoredGame,
  type WatchPeriod,
  type WatchTeamFilter,
} from "@/lib/what-to-watch";

/** Partidos por tanda: la temporada entera pasa de mil. */
const PAGE_SIZE = 20;

const shortDate = (utc: string) => {
  const day = gameDayOf(utc);
  return `${formatWeekday(day)} ${formatDayMonth(day, "short")}`;
};

/** Cabecera de la página (también es el esqueleto mientras llega el resto). */
export function WhatToWatchHeader() {
  return (
    <header className="border-b border-slate-800 px-4 pb-3 pt-4 md:px-8 md:pb-5 md:pt-10">
      <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-orange-400">Por nota · Sin resultados</p>
      <h1 className="font-display text-4xl font-extrabold uppercase leading-tight text-white md:text-6xl">Qué ver</h1>
    </header>
  );
}

type WhatToWatchProps = {
  /** Los 30 equipos, por nombre. */
  teams: TeamLite[];
  initialPeriod: WatchPeriod;
  initialTeam: WatchTeamFilter;
};

/**
 * "Qué ver" (Tarea 6.11): los mejores partidos por nota con "El partidazo de la semana" arriba.
 * Nivel 1: ningún partido (el orden ya destriparía la nota). Niveles 2 y 3: emparejamiento y nota, nunca
 * el resultado. Los favoritos solo destacan sus partidos o filtran la lista: no enseñan más.
 */
export function WhatToWatch({ teams, initialPeriod, initialTeam }: WhatToWatchProps) {
  const { spoilerLevel: level, setSpoilerLevel } = useSpoiler();
  const [period, setPeriod] = useState(initialPeriod);
  const [team, setTeam] = useState(initialTeam);
  const [shown, setShown] = useState(PAGE_SIZE);

  const teamsById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const favorites = useFavorites();
  useFreshFavoritePlayerTeams(favorites);
  const favoriteReasons = useMemo(() => favoriteTeamReasons(favorites), [favorites]);

  const entry = useWatchList(level);
  const games = entry?.data?.games;

  // Las notas solo se piden en Nivel 2 o 3, y se revalidan al volver a la pestaña
  useEffect(() => {
    if (level === 1) return;
    void loadWatchList();
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadWatchList();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [level]);

  // Al ir a cambiar de nivel se precargan sin enseñarlas: al confirmar aparecen al instante
  useEffect(
    () =>
      onLevelIntent((target) => {
        if (target !== 1) void loadWatchList();
      }),
    []
  );

  // Solo se calcula en Nivel 2 o 3, que nunca se pinta en el servidor: sin desajustes al hidratar
  const today = todayGameDay();
  const ranked = useMemo(() => {
    if (!games) return undefined;
    const filter = team === "todos" ? null : team === "favoritos" ? favoriteReasons : new Set([team]);
    return rankGames(games, { period, today, dayOf: gameDayOf, teams: filter });
  }, [games, period, team, today, favoriteReasons]);
  const best = useMemo(() => (games ? gameOfTheWeek(games, today, gameDayOf) : undefined), [games, today]);

  function update(nextPeriod: WatchPeriod, nextTeam: WatchTeamFilter) {
    setPeriod(nextPeriod);
    setTeam(nextTeam);
    setShown(PAGE_SIZE);
    // Sin navegación de Next: cambia al instante y la URL queda lista para compartir
    window.history.replaceState(null, "", `/que-ver${watchSearch(nextPeriod, nextTeam)}`);
  }

  if (level === 1) {
    return (
      <>
        <WhatToWatchHeader />
        <LockedNotice onShow={() => setSpoilerLevel(2)} />
      </>
    );
  }

  const periodInfo = WATCH_PERIODS.find((p) => p.id === period)!;
  const hasFavorites = favoriteReasons.size > 0;

  return (
    <>
      <WhatToWatchHeader />

      {best === undefined ? (
        <HeroSkeleton />
      ) : (
        best && <GameOfTheWeek game={best} away={teamsById.get(best.away_team_id)} home={teamsById.get(best.home_team_id)} />
      )}

      <div aria-live="polite" className="flex items-center gap-2 border-b border-slate-800 px-4 py-2 text-xs md:px-8">
        <Star className="size-3.5 shrink-0 text-amber-400" />
        <span className="shrink-0 whitespace-nowrap font-display text-sm font-bold uppercase tracking-wide text-amber-400">Solo nota</span>
        <span className="truncate text-slate-400">
          {level === 3 ? "Aquí nunca salen resultados, tampoco en este nivel" : "8+ partidazo · de 5 a 7,9 se deja ver · menos de 5, flojo"}
        </span>
        {entry?.error && (
          <span className="ml-auto flex shrink-0 items-center gap-1.5 text-slate-400">
            <WifiOff className="size-3.5" />
            Sin conexión
          </span>
        )}
      </div>

      <PeriodTabs period={period} onSelect={(p) => update(p, team)} />

      <div className="flex items-center gap-3 border-b border-slate-800 px-4 py-2 md:px-8">
        <label htmlFor="watch-team" className="shrink-0 font-display text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
          Equipo
        </label>
        <select
          id="watch-team"
          value={String(team)}
          onChange={(event) => {
            const value = event.target.value;
            update(period, value === "todos" || value === "favoritos" ? value : Number(value));
          }}
          className="h-9 min-w-0 flex-1 border border-slate-800 bg-slate-950 px-2 font-display text-base font-bold uppercase tracking-wide text-white transition-colors hover:border-slate-600 focus:border-orange-500 focus:outline-none md:max-w-xs"
        >
          <option value="todos">Todos los equipos</option>
          {(hasFavorites || team === "favoritos") && <option value="favoritos">★ Tus favoritos</option>}
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        {ranked && (
          <span className="ml-auto hidden shrink-0 font-display text-sm font-semibold uppercase tracking-wide text-slate-400 sm:block">
            {ranked.length === 1 ? "1 partido" : `${ranked.length} partidos`}
          </span>
        )}
      </div>

      <div className="min-h-[40vh]">
        {ranked === undefined ? (
          entry?.error ? (
            <Empty title="Las notas no están disponibles" text="Sin conexión: se reintenta al volver a la pestaña." />
          ) : (
            <ListSkeleton />
          )
        ) : ranked.length === 0 ? (
          team === "favoritos" && !hasFavorites ? (
            <Empty title="Aún no tienes favoritos" text="Márcalos con ★ en la ficha de un equipo o de un jugador." />
          ) : (
            <Empty
              title="Ningún partido con nota"
              text={`${periodInfo.hint}${team === "todos" ? "" : " · prueba con otro equipo o un periodo más largo"}.`}
            />
          )
        ) : (
          <>
            <ol aria-label={`Mejores partidos · ${periodInfo.hint}`}>
              {ranked.slice(0, shown).map((game, i) => (
                <RankedGame
                  key={game.id}
                  rank={i + 1}
                  game={game}
                  away={teamsById.get(game.away_team_id)}
                  home={teamsById.get(game.home_team_id)}
                  mine={favoriteReasons.has(game.home_team_id) || favoriteReasons.has(game.away_team_id)}
                />
              ))}
            </ol>
            {ranked.length > shown && (
              <button
                type="button"
                onClick={() => setShown((n) => n + PAGE_SIZE)}
                className="block w-full border-b border-slate-800 py-3 font-display text-base font-bold uppercase tracking-wide text-orange-400 transition-colors hover:bg-slate-900/70 hover:text-orange-300"
              >
                Ver más · {shown} de {ranked.length}
              </button>
            )}
          </>
        )}
      </div>
    </>
  );
}

/** Nivel 1: ni un partido. Un toque (como en el selector) pasa a "Solo nota". */
function LockedNotice({ onShow }: { onShow: () => void }) {
  return (
    <section className="border-b border-slate-800 px-4 py-12 text-center md:px-8 md:py-16">
      <EyeOff className="mx-auto size-8 text-emerald-400" aria-hidden />
      <h2 className="mt-3 font-display text-2xl font-extrabold uppercase text-white md:text-3xl">Los partidos se ordenan por nota</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
        Con todo oculto no te enseñamos ninguno: hasta el orden te diría qué partido fue mejor.
      </p>
      <button
        type="button"
        onClick={onShow}
        onPointerEnter={() => announceLevelIntent(2)}
        onFocus={() => announceLevelIntent(2)}
        className="mt-6 inline-flex h-11 items-center gap-2 bg-orange-500 px-5 font-display text-lg font-bold uppercase tracking-wide text-white transition-colors hover:bg-orange-400"
      >
        <Star className="size-4 fill-white" aria-hidden />
        Ver las notas
      </button>
      <p className="mt-3 text-xs text-slate-500">Aquí nunca verás resultados, solo la nota.</p>
    </section>
  );
}

function PeriodTabs({ period, onSelect }: { period: WatchPeriod; onSelect: (period: WatchPeriod) => void }) {
  const index = WATCH_PERIODS.findIndex((p) => p.id === period);
  return (
    <div role="tablist" aria-label="Periodo" className="relative grid grid-cols-4 border-b border-slate-800">
      {WATCH_PERIODS.map(({ id, label, hint }) => {
        const selected = id === period;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onSelect(id)}
            className={cn("flex flex-col items-center py-2 transition-colors md:py-3", selected ? "text-white" : "text-slate-500 hover:text-slate-300")}
          >
            {/* Cuatro pestañas a 360 px: "Temporada" cabe con text-lg */}
            <span className="font-display text-lg font-extrabold uppercase leading-none sm:text-xl md:text-3xl">{label}</span>
            <span className="mt-1 hidden font-display text-[11px] font-semibold uppercase tracking-[0.2em] md:block">{hint}</span>
          </button>
        );
      })}
      <span
        aria-hidden
        className="absolute -bottom-px left-0 h-[3px] w-1/4 bg-orange-500 transition-transform duration-300 ease-out"
        style={{ transform: `translateX(${index * 100}%)` }}
      />
    </div>
  );
}

/** Cabecera "El partidazo de la semana": los colores de los dos equipos y la nota en grande. */
function GameOfTheWeek({ game, away, home }: { game: ScoredGame; away: TeamLite | undefined; home: TeamLite | undefined }) {
  const tint = (color: string | undefined) => `color-mix(in srgb, ${color ?? "#334155"} 28%, transparent)`;
  return (
    <section aria-labelledby="game-of-the-week" className="border-b border-slate-800">
      <Link
        href={`/games/${game.id}`}
        className="group block px-4 py-4 transition-colors md:px-8 md:py-7"
        style={{ background: `linear-gradient(100deg, ${tint(away?.accent)} 0%, transparent 42%, transparent 58%, ${tint(home?.accent)} 100%)` }}
      >
        <h2 id="game-of-the-week" className="font-display text-xs font-semibold uppercase tracking-[0.25em] text-orange-400">
          El partidazo de la semana
        </h2>
        <div className="mt-3 flex items-center gap-3 md:gap-5">
          <HeroTeam team={away} />
          <span aria-hidden className="font-display text-xl font-bold text-slate-400 md:text-3xl">@</span>
          <span className="sr-only">en casa de</span>
          <HeroTeam team={home} />
          <PureScoreBadge score={game.excitement_score} className="ml-auto min-w-16 px-3 py-1.5 text-3xl md:min-w-24 md:text-5xl" />
        </div>
        <p className="mt-3 flex items-center gap-1 font-display text-sm font-semibold uppercase tracking-wide text-slate-300">
          {shortDate(game.game_datetime_utc)}
          <span className="text-slate-500">·</span>
          <span className="text-orange-400 group-hover:text-orange-300">Ver el partido</span>
          <ChevronRight className="size-4 text-orange-400 group-hover:text-orange-300" aria-hidden />
        </p>
      </Link>
    </section>
  );
}

function HeroTeam({ team }: { team: TeamLite | undefined }) {
  return (
    <span className="flex min-w-0 flex-col items-center gap-1 md:flex-row md:gap-3">
      {team && <Image src={teamLogoUrl(team.id)} alt="" width={64} height={64} unoptimized className="size-12 shrink-0 md:size-16" />}
      <span className="font-display text-lg font-extrabold uppercase leading-none text-white md:text-3xl">
        <span className="lg:hidden">{team?.abbreviation ?? "—"}</span>
        <span className="hidden lg:inline">{team?.name ?? "—"}</span>
      </span>
    </span>
  );
}

function RankedGame({
  rank,
  game,
  away,
  home,
  mine,
}: {
  rank: number;
  game: ScoredGame;
  away: TeamLite | undefined;
  home: TeamLite | undefined;
  mine: boolean;
}) {
  return (
    <li className={cn("relative border-b border-slate-800", mine && "bg-orange-500/[0.05]")}>
      {/* Partido de tus favoritos: franja naranja a la izquierda, como en la portada */}
      {mine && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-orange-500" />}
      <Link
        href={`/games/${game.id}`}
        className="group grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-2.5 transition-colors hover:bg-slate-900/70 md:grid-cols-[2.5rem_minmax(0,1fr)_auto_1rem] md:gap-x-5 md:px-8"
      >
        <span className="text-right font-display text-xl font-extrabold text-slate-500 tabular-nums md:text-2xl">{rank}</span>
        <span className="min-w-0">
          <span className="flex min-w-0 items-center gap-2 font-semibold text-white group-hover:text-orange-400">
            <MatchupTeam team={away} />
            <span aria-hidden className="font-display text-sm font-bold text-slate-400">@</span>
            <span className="sr-only">en casa de</span>
            <MatchupTeam team={home} />
          </span>
          <span className="mt-0.5 block font-display text-xs font-semibold uppercase tracking-wide text-slate-400">
            {shortDate(game.game_datetime_utc)}
          </span>
        </span>
        <PureScoreBadge score={game.excitement_score} />
        <ChevronRight className="hidden size-4 text-slate-600 transition-colors group-hover:text-orange-400 md:block" aria-hidden />
      </Link>
    </li>
  );
}

function MatchupTeam({ team }: { team: TeamLite | undefined }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {team && <Image src={teamLogoUrl(team.id)} alt="" width={28} height={28} unoptimized className="size-7 shrink-0" />}
      {/* Nombre completo solo donde cabe; en móvil, la abreviatura */}
      <span className="truncate">
        <span className="whitespace-nowrap md:hidden">{team?.abbreviation ?? "—"}</span>
        <span className="hidden md:inline">{team?.name ?? "—"}</span>
      </span>
    </span>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="px-4 py-16 text-center md:px-8">
      <p className="font-display text-2xl font-bold uppercase text-slate-300">{title}</p>
      <p className="mt-2 text-sm text-slate-400">{text}</p>
    </div>
  );
}

function HeroSkeleton() {
  return (
    <div aria-hidden className="animate-pulse border-b border-slate-800 px-4 py-4 md:px-8 md:py-7">
      <div className="h-3 w-44 rounded bg-slate-800/80" />
      <div className="mt-3 h-[4.25rem] w-full max-w-md rounded bg-slate-800/80 md:h-16" />
      <div className="mt-3 h-4 w-40 rounded bg-slate-800/80" />
    </div>
  );
}

function ListSkeleton() {
  return (
    <ul aria-busy className="animate-pulse">
      {Array.from({ length: 8 }, (_, i) => (
        <li key={i} className="flex items-center gap-3 border-b border-slate-800 px-4 py-3 md:px-8">
          <span className="h-6 w-6 rounded bg-slate-800/80" />
          <span className="flex-1 space-y-2">
            <span className="block h-5 w-44 max-w-full rounded bg-slate-800/80" />
            <span className="block h-3 w-20 rounded bg-slate-800/80" />
          </span>
          <span className="h-9 w-12 rounded-lg bg-slate-800/80" />
        </li>
      ))}
    </ul>
  );
}
