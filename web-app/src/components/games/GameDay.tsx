"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState, type TouchEvent } from "react";
import Link from "next/link";
import { ChevronRight, Eye, EyeOff, Star, WifiOff, type LucideIcon } from "lucide-react";
import { DayPicker } from "@/components/games/DayPicker";
import { LiveGameCard, type CardView } from "@/components/games/LiveGameCard";
import { SpanishPlayersStrip } from "@/components/games/SpanishPlayersStrip";
import { DayCardExport } from "@/components/share/DayShareCard";
import { FavoritesStrip } from "@/components/favorites/FavoritesQuickAccess";
import { PushBell } from "@/components/push/PushBell";
import { onLevelIntent, useSpoilerLevel } from "@/context/SpoilerContext";
import {
  addDays,
  formatDayMonth,
  formatWeekday,
  groupByGameDay,
  relativeDayLabel,
  toGameResult,
  type GameMatchup,
  type GameResult,
  type ScheduleTuple,
  type TeamLite,
} from "@/lib/game-day";
import {
  IDLE_MAX_AGE_MS,
  LIVE_MAX_AGE_MS,
  loadDay,
  loadLive,
  loadSchedule,
  loadSpanishLines,
  useDayLevel2,
  useDayLevel3,
  useLive,
  useSchedule,
  useSpanishLines,
} from "@/lib/game-day-store";
import { favoriteTeamReasons, sortFavoritesFirst, type Favorites } from "@/lib/favorites";
import { useFavorites, useFreshFavoritePlayerTeams } from "@/lib/favorites-store";
import { spanishPlayersOfDay, type SpanishPlayer } from "@/lib/spanish-players";
import type { SpoilerLevel } from "@/lib/spoilers";
import { cn } from "@/lib/utils";

const REFRESH_MS = 30_000;
// Un partido puede estar en juego desde 15 min antes del salto inicial hasta 6 h después
const PRE_GAME_MS = 15 * 60_000;
const IN_PROGRESS_MS = 6 * 3_600_000;
const SWIPE_PX = 60;

const NO_GAMES: GameMatchup[] = [];
const NO_RESULT: GameResult = {
  status: "Scheduled",
  periodText: null,
  home: { score: null, periods: [] },
  away: { score: null, periods: [] },
  excitementScore: null,
};

function hasGamesInProgress(games: GameMatchup[], now: number): boolean {
  return games.some((game) => {
    const start = Date.parse(game.game_datetime_utc);
    return start - now < PRE_GAME_MS && now - start < IN_PROGRESS_MS;
  });
}

/** Algún partido ha empezado ya (o está a punto): antes no hay boxscore que pedir. */
function hasStartedGames(games: GameMatchup[], now: number): boolean {
  return games.some((game) => Date.parse(game.game_datetime_utc) - now < PRE_GAME_MS);
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || !!target.closest("[role=dialog]"))
  );
}

type GameDayProps = {
  today: string;
  initialDay: string;
  teams: TeamLite[];
  /** Jornadas alrededor de la inicial, ya incluidas en el HTML: el primer pintado no espera a nada. */
  initialSchedule: ScheduleTuple[];
  initialRange: [from: string, to: string];
  /** Todas las jornadas con partidos, ordenadas (para el calendario). */
  gameDays: string[];
  /** Favoritos según la cookie: el HTML ya sale ordenado y con la franja (Tarea 6.10). */
  initialFavorites: Favorites;
  /** Españoles en activo con su equipo actual: "Los nuestros" (Tarea 6.12). */
  spanishPlayers: SpanishPlayer[];
};

/**
 * Pantalla de jornada. El calendario sin spoilers (Nivel 1) está siempre en memoria, así que cambiar
 * de día es instantáneo; la nota (Nivel 2) y los resultados (Nivel 3) solo se piden en esos niveles,
 * ya filtrados por el servidor, y se refrescan cada 30 s mientras haya partidos en juego.
 */
export function GameDay({ today, initialDay, teams, initialSchedule, initialRange, gameDays, initialFavorites, spanishPlayers }: GameDayProps) {
  const level = useSpoilerLevel();
  const [day, setDay] = useState(initialDay);

  const teamsById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const gameDaySet = useMemo(() => new Set(gameDays), [gameDays]);

  const fullSchedule = useSchedule()?.data?.games;
  const byDay = useMemo(() => groupByGameDay(fullSchedule ?? initialSchedule), [fullSchedule, initialSchedule]);
  const known = fullSchedule !== undefined || (day >= initialRange[0] && day <= initialRange[1]);
  const games = byDay.get(day) ?? (known ? NO_GAMES : undefined);

  // Favoritos: solo cambian el orden y el destacado, nunca lo que se ve (eso lo decide el nivel)
  const favorites = useFavorites(initialFavorites);
  useFreshFavoritePlayerTeams(favorites);
  const favoriteReasons = useMemo(() => favoriteTeamReasons(favorites), [favorites]);
  const orderedGames = useMemo(() => games && sortFavoritesFirst(games, favoriteReasons), [games, favoriteReasons]);

  // Los nuestros: quién juega sale del calendario (Nivel 1); su línea, solo en Nivel 3
  const spanishOfDay = useMemo(() => spanishPlayersOfDay(spanishPlayers, games ?? NO_GAMES), [spanishPlayers, games]);
  const spanishGames = useMemo(() => spanishOfDay.map((entry) => entry.game), [spanishOfDay]);
  const spanishLines = useSpanishLines(level, day);

  const level2 = useDayLevel2(level, day);
  const level3 = useDayLevel3(level, day);
  const live = useLive(level);

  const level2ById = useMemo(() => new Map(level2?.data?.games.map((g) => [g.id, g])), [level2]);
  const level3ById = useMemo(() => new Map(level3?.data?.games.map((g) => [g.id, g])), [level3]);
  const liveById = useMemo(() => new Map(live?.data?.games.map((g) => [g.id, g])), [live]);

  function selectDay(next: string) {
    setDay(next);
    // Sin navegación de Next: la jornada cambia al instante y la URL queda lista para compartir
    window.history.replaceState(null, "", next === today ? "/" : `/?fecha=${next}`);
  }

  // --- Datos por nivel: lo de esta jornada primero, después las vecinas (ir y volver sin esperas) ---

  const refresh = useEffectEvent(() => {
    if (level === 1) return;
    const inProgress = hasGamesInProgress(games ?? NO_GAMES, Date.now());
    void loadDay(level, day, inProgress ? LIVE_MAX_AGE_MS : IDLE_MAX_AGE_MS);
    if (level === 3 && inProgress) void loadLive();
    if (level === 3 && hasStartedGames(spanishGames, Date.now())) {
      void loadSpanishLines(day, hasGamesInProgress(spanishGames, Date.now()) ? LIVE_MAX_AGE_MS : IDLE_MAX_AGE_MS);
    }
  });

  useEffect(() => {
    void loadSchedule();
  }, []);

  useEffect(() => {
    if (level === 1) return;
    refresh();
    const neighbours = setTimeout(() => {
      void loadDay(level, addDays(day, -1), IDLE_MAX_AGE_MS);
      void loadDay(level, addDays(day, 1), IDLE_MAX_AGE_MS);
    }, 300);
    const tick = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const interval = setInterval(tick, REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearTimeout(neighbours);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [level, day, games]);

  // Precarga al pasar el ratón o empezar a pulsar un nivel: al confirmar, los datos ya están aquí
  const prefetchLevel = useEffectEvent((target: SpoilerLevel) => {
    if (target === 1 || target === level) return;
    void loadDay(target, day);
    if (target === 3 && hasGamesInProgress(games ?? NO_GAMES, Date.now())) void loadLive();
    if (target === 3 && hasStartedGames(spanishGames, Date.now())) void loadSpanishLines(day);
  });
  useEffect(() => onLevelIntent((target) => prefetchLevel(target)), []);

  // --- Navegación: flechas del teclado y deslizar el dedo sobre la lista ---

  const step = useEffectEvent((amount: number) => selectDay(addDays(day, amount)));
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || isTypingTarget(event.target)) return;
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "ArrowRight") step(1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (event: TouchEvent) => {
    const touch = event.touches[0];
    touchStart.current = event.touches.length === 1 ? { x: touch.clientX, y: touch.clientY } : null;
  };
  const onTouchEnd = (event: TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const dx = event.changedTouches[0].clientX - start.x;
    const dy = event.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > 2 * Math.abs(dy)) selectDay(addDays(day, dx < 0 ? 1 : -1));
  };

  // --- Qué se ve de cada partido (solo lo que permite el nivel) ---

  function viewFor(game: GameMatchup): CardView {
    if (level === 2) {
      const score = level2?.data ? (level2ById.get(game.id)?.excitement_score ?? null) : level2?.error ? null : undefined;
      // "No ha empezado" se deduce de la hora frente al momento de la descarga, sin pedir el estado
      return { level: 2, score, upcoming: Date.parse(game.game_datetime_utc) > (level2?.at ?? 0) };
    }
    if (level === 3) {
      const liveGame = liveById.get(game.id);
      const loaded = level3?.data !== undefined || liveGame !== undefined;
      const result = loaded ? (toGameResult(level3ById.get(game.id), liveGame) ?? NO_RESULT) : level3?.error ? NO_RESULT : undefined;
      return { level: 3, result };
    }
    return { level: 1 };
  }

  const relative = relativeDayLabel(day, today);
  const liveNow = level === 3 && !!games?.some((g) => (liveById.get(g.id)?.status ?? level3ById.get(g.id)?.status) === "Live");
  const offline = (level === 2 && !!level2?.error) || (level === 3 && !!level3?.error);

  return (
    <>
      {/* Móvil: una franja compacta (título y fecha a la izquierda, compartir a la derecha). Escritorio: cabecera completa */}
      <header className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-2 md:items-end md:px-8 md:pb-5 md:pt-10">
        <div className="min-w-0">
          <p className="hidden font-display text-xs font-semibold uppercase tracking-[0.3em] text-orange-400 md:block">Jornada NBA · Hora de España</p>
          {/* Interlineado holgado: los acentos de las mayúsculas (Ñ, Á…) no pisan el antetítulo */}
          <h1 className="truncate font-display text-3xl font-extrabold uppercase leading-tight text-white md:mt-3 md:text-6xl">
            {relative ?? formatWeekday(day, "long")}
          </h1>
          <p className="truncate font-display text-xs font-semibold uppercase tracking-wide text-slate-300 md:mt-1 md:text-lg">
            {relative && `${formatWeekday(day, "long")}, `}
            {formatDayMonth(day)}
            {games && <span className="text-slate-400"> · {games.length === 1 ? "1 partido" : `${games.length} partidos`}</span>}
            <span className="text-slate-500 md:hidden"> · Hora de España</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <PushBell />
          {games && games.length > 0 && (
            <DayCardExport
              day={day}
              level={level}
              games={games.map((game) => ({ game, away: teamsById.get(game.away_team_id), home: teamsById.get(game.home_team_id), view: viewFor(game) }))}
            />
          )}
        </div>
      </header>

      <FavoritesStrip favorites={favorites} className="md:hidden" />
      <DayPicker day={day} today={today} gameDays={gameDaySet} onSelect={selectDay} />
      <LevelHint level={level} live={liveNow} offline={offline} />
      <SpanishPlayersStrip entries={spanishOfDay} teamsById={teamsById} level={level} lines={spanishLines} />

      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} className="min-h-[50vh]">
        {orderedGames === undefined ? (
          <GameListSkeleton />
        ) : orderedGames.length === 0 ? (
          <EmptyDay day={day} gameDays={gameDays} onSelect={selectDay} />
        ) : (
          <ul aria-label={`Partidos de la jornada del ${formatDayMonth(day)}`}>
            {orderedGames.map((game) => (
              <LiveGameCard
                key={game.id}
                game={game}
                day={day}
                home={teamsById.get(game.home_team_id)}
                away={teamsById.get(game.away_team_id)}
                view={viewFor(game)}
                favorite={{ home: favoriteReasons.get(game.home_team_id), away: favoriteReasons.get(game.away_team_id) }}
              />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

// `short`: en el móvil, junto a "Qué ver ›" (Tarea 8.1), para que quepa en dos líneas a 360 px
const HINTS: Record<SpoilerLevel, { icon: LucideIcon; title: string; tip: string; short?: string; className: string }> = {
  // Qué es la nota, en la línea que ya existe (Tarea 7.6)
  1: {
    icon: EyeOff,
    title: "Sin spoilers",
    tip: "Toca Nota: del 1 al 10, lo emocionante que fue cada partido, sin decir quién ganó",
    short: "Toca Nota: del 1 al 10, cuánto emocionó cada partido, sin decir quién ganó",
    className: "text-emerald-400",
  },
  2: {
    icon: Star,
    title: "Solo nota",
    tip: "Emoción del 1 al 10: 8+ partidazo, menos de 5 flojo · Mantén pulsado Resultados para el marcador",
    short: "8+ partidazo, menos de 5 flojo · Mantén pulsado Resultados para el marcador",
    className: "text-amber-400",
  },
  3: { icon: Eye, title: "Resultados visibles", tip: "Marcadores, cuartos y nota del partido", className: "text-orange-400" },
};

function LevelHint({ level, live, offline }: { level: SpoilerLevel; live: boolean; offline: boolean }) {
  const { icon: Icon, title, tip, short, className } = HINTS[level];
  return (
    // En móvil, dos líneas en todos los niveles: el texto no se corta y la lista no se mueve al cambiar de nivel
    <div className="flex min-h-12 items-stretch border-b border-slate-800 text-xs md:min-h-0">
      <div aria-live="polite" className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-4 pr-2 md:py-2 md:pl-8">
        <Icon className={cn("size-3.5 shrink-0", className)} />
        {/* Título y explicación en el mismo párrafo: la segunda línea aprovecha todo el ancho */}
        <p className="min-w-0 leading-snug text-slate-400">
          <span className={cn("mr-1.5 whitespace-nowrap font-display text-sm font-bold uppercase tracking-wide", className)}>{title}</span>
          <span className={cn((live || offline) && "max-md:hidden")}>
            {short ? (
              <>
                <span className="md:hidden">{short}</span>
                <span className="max-md:hidden">{tip}</span>
              </>
            ) : (
              tip
            )}
          </span>
        </p>
        {live && (
          <span className="ml-auto flex shrink-0 items-center gap-1.5 font-display text-xs font-bold uppercase tracking-wider text-red-400">
            <span className="size-1.5 animate-pulse rounded-full bg-red-500 motion-reduce:animate-none" />
            Actualizando cada 30 s
          </span>
        )}
        {offline && (
          <span className="ml-auto flex shrink-0 items-center gap-1.5 text-slate-400">
            <WifiOff className="size-3.5" />
            Sin conexión, reintentando…
          </span>
        )}
      </div>
      {/* Qué ver (Tarea 8.1): fuera de la barra, a un toque desde Inicio y en los tres niveles. La página ya
          decide qué enseña en cada uno (en Nivel 1, ningún partido) */}
      <Link
        href="/que-ver"
        className="flex shrink-0 items-center gap-0.5 border-l border-slate-800 pl-3 pr-2.5 font-display text-sm font-bold uppercase tracking-wide text-orange-300 transition-colors hover:bg-slate-900 hover:text-orange-200 md:px-6"
      >
        Qué ver
        <ChevronRight aria-hidden className="size-4" />
      </Link>
    </div>
  );
}

function EmptyDay({ day, gameDays, onSelect }: { day: string; gameDays: string[]; onSelect: (day: string) => void }) {
  const next = gameDays.find((d) => d > day);
  const target = next ?? gameDays.findLast((d) => d < day);

  return (
    <div className="px-4 py-16 text-center md:px-8">
      <p className="font-display text-2xl font-bold uppercase text-slate-300">No hay partidos esta jornada</p>
      {target && (
        <button
          type="button"
          onClick={() => onSelect(target)}
          className="mt-4 font-display text-base font-bold uppercase tracking-wide text-orange-400 hover:text-orange-300"
        >
          {next ? "Siguiente jornada" : "Última jornada"}: {formatWeekday(target, "long")} {formatDayMonth(target)} →
        </button>
      )}
    </div>
  );
}

export function GameListSkeleton() {
  return (
    <ul aria-busy className="animate-pulse">
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="flex items-center gap-4 border-b border-slate-800 px-4 py-3 md:px-8">
          <span className="h-6 w-14 rounded bg-slate-800/80" />
          <span className="flex-1 space-y-2.5">
            <span className="block h-6 w-40 max-w-full rounded bg-slate-800/80" />
            <span className="block h-6 w-36 max-w-full rounded bg-slate-800/80" />
          </span>
        </li>
      ))}
    </ul>
  );
}
