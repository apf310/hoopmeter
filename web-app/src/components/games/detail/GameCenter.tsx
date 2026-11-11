"use client";

import { useEffect, useEffectEvent, useRef, useState, type KeyboardEvent } from "react";
import { WifiOff } from "lucide-react";
import { BoxScoreTable } from "@/components/games/detail/BoxScoreTable";
import { GameHero, type HeroView } from "@/components/games/detail/GameHero";
import { KeyPlayers, LockedStats, NotStarted } from "@/components/games/detail/GamePreview";
import { GameSummary } from "@/components/games/detail/GameSummary";
import { PlayByPlay } from "@/components/games/detail/PlayByPlay";
import { PlayerGameSheet } from "@/components/games/detail/PlayerGameSheet";
import { ShotChartPanel } from "@/components/games/detail/ShotChart";
import { Placeholder } from "@/components/games/detail/ui";
import { GameCardExport, type GameShareView, type ShareStar } from "@/components/share/GameShareCard";
import { onLevelIntent, useSpoilerLevel } from "@/context/SpoilerContext";
import type { GameDetail } from "@/lib/game-detail";
import { toGameResult, type GameMatchup, type GameResult } from "@/lib/game-day";
import {
  IDLE_MAX_AGE_MS,
  LIVE_MAX_AGE_MS,
  loadDay,
  loadGameDetail,
  useDayLevel2,
  useDayLevel3,
  useGameDetail,
} from "@/lib/game-day-store";
import { decimal, playerOfTheGame, shooting, type MatchupTeam } from "@/lib/game-format";
import type { KeyPlayer } from "@/lib/queries";
import type { GameLevel3, SpoilerLevel } from "@/lib/spoilers";
import { cn } from "@/lib/utils";

const REFRESH_MS = 30_000;
// Un partido puede estar en juego desde 15 min antes del salto inicial hasta 6 h después
const PRE_GAME_MS = 15 * 60_000;
const IN_PROGRESS_MS = 6 * 3_600_000;

type Tab = "resumen" | "boxscore" | "tiros" | "jugadas";

const TABS: { id: Tab; label: string }[] = [
  { id: "resumen", label: "Resumen" },
  { id: "boxscore", label: "Boxscore" },
  { id: "tiros", label: "Tiros" },
  { id: "jugadas", label: "Jugadas" },
];

/** Resultado de la cabecera: el de la ficha (el más reciente), salvo que Supabase ya lo dé por terminado. */
function resultOf(detail: GameDetail | null | undefined, row: GameLevel3 | undefined): GameResult | undefined {
  if (!detail || (row?.status === "Final" && detail.status === "Live")) return toGameResult(row, undefined);
  return {
    status: detail.status,
    periodText: detail.periodText,
    away: { score: detail.away.score, periods: detail.away.periods },
    home: { score: detail.home.score, periods: detail.home.periods },
    excitementScore: row?.excitement_score ?? null,
  };
}

function shareStar(detail: GameDetail | null | undefined): ShareStar | null {
  const best = detail ? playerOfTheGame(detail) : null;
  if (!best) return null;
  const p = best.player;
  return {
    id: p.id,
    name: p.name,
    teamId: best.team.id,
    stats: `${p.pts} pts · ${p.reb} reb · ${p.ast} ast`,
    line: `Tiros ${shooting(p.fgm, p.fga)} · Triples ${shooting(p.fg3m, p.fg3a)} · Valoración ${decimal(p.gameScore)}`,
  };
}

type GameCenterProps = {
  game: GameMatchup;
  day: string;
  away: MatchupTeam;
  home: MatchupTeam;
  keyPlayers: KeyPlayer[];
};

/**
 * Ficha del partido. El HTML solo trae el emparejamiento (Nivel 1); la nota (Nivel 2) y la ficha
 * completa (Nivel 3) se piden únicamente en su nivel, se precargan en cuanto el usuario empieza
 * a cambiarlo y se refrescan cada 30 s mientras se juega.
 */
export function GameCenter({ game, day, away, home, keyPlayers }: GameCenterProps) {
  const level = useSpoilerLevel();
  const level2 = useDayLevel2(level, day);
  const level3 = useDayLevel3(level, day);
  const detailEntry = useGameDetail(level, game.id);

  const [tab, setTab] = useState<Tab>("resumen");
  const [sheetPlayer, setSheetPlayer] = useState<number | null>(null);
  const [shotTeam, setShotTeam] = useState(away.id);
  const [shotPlayer, setShotPlayer] = useState<number | null>(null);
  const tabsAnchor = useRef<HTMLDivElement>(null);
  const tabsBar = useRef<HTMLDivElement>(null);

  const row2 = level2?.data?.games.find((g) => g.id === game.id);
  const row3 = level3?.data?.games.find((g) => g.id === game.id);
  // undefined = cargando · null = aún no ha empezado
  const detail = detailEntry?.data?.detail;
  const result = level === 3 ? resultOf(detail, row3) : undefined;

  // --- Datos por nivel ---

  const refresh = useEffectEvent(() => {
    if (level === 1) return;
    const start = Date.parse(game.game_datetime_utc);
    const now = Date.now();
    const inProgress = start - now < PRE_GAME_MS && now - start < IN_PROGRESS_MS;
    void loadDay(level, day, inProgress ? LIVE_MAX_AGE_MS : IDLE_MAX_AGE_MS);
    if (level === 3) {
      const live = detail?.status === "Live" || (detail?.status !== "Final" && inProgress);
      void loadGameDetail(game.id, live ? LIVE_MAX_AGE_MS : IDLE_MAX_AGE_MS);
    }
  });

  useEffect(() => {
    if (level === 1) return;
    refresh();
    const tick = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const interval = setInterval(tick, REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [level]);

  // Precarga al pasar el ratón o empezar a pulsar un nivel: al confirmar, los datos ya están aquí
  const prefetchLevel = useEffectEvent((target: SpoilerLevel) => {
    if (target === 1 || target === level) return;
    void loadDay(target, day);
    if (target === 3) void loadGameDetail(game.id);
  });
  useEffect(() => onLevelIntent((target) => prefetchLevel(target)), []);

  // --- Navegación ---

  function selectTab(next: Tab) {
    setTab(next);
    // Si la barra de pestañas ya está fijada arriba, la nueva pestaña empieza justo debajo
    const anchor = tabsAnchor.current;
    const bar = tabsBar.current;
    if (!anchor || !bar) return;
    const offset = Number.parseFloat(getComputedStyle(bar).top) || 0;
    const top = anchor.getBoundingClientRect().top + window.scrollY - offset;
    if (window.scrollY > top) window.scrollTo({ top });
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = TABS.findIndex((t) => t.id === tab);
    const next = event.key === "ArrowRight" ? index + 1 : event.key === "ArrowLeft" ? index - 1 : null;
    if (next === null) return;
    event.preventDefault();
    const target = TABS[(next + TABS.length) % TABS.length];
    selectTab(target.id);
    document.getElementById(`tab-${target.id}`)?.focus();
  }

  function showShots(teamId: number, playerId: number | null) {
    setShotTeam(teamId);
    setShotPlayer(playerId);
    setSheetPlayer(null);
    selectTab("tiros");
  }

  // --- Qué se ve (solo lo que permite el nivel) ---

  let hero: HeroView;
  let share: GameShareView | null;
  if (level === 1) {
    hero = { level: 1 };
    share = { level: 1 };
  } else if (level === 2) {
    const score = level2?.data ? (row2?.excitement_score ?? null) : level2?.error ? null : undefined;
    // "No ha empezado" se deduce de la hora frente al momento de la descarga, sin pedir el estado
    const upcoming = Date.parse(game.game_datetime_utc) > (level2?.at ?? 0);
    hero = { level: 2, score, upcoming };
    share = score === undefined ? null : score === null && upcoming ? { level: 1 } : { level: 2, score };
  } else {
    hero = { level: 3, result, detail };
    share = !result ? null : result.status === "Scheduled" ? { level: 1 } : { level: 3, result, star: shareStar(detail) };
  }
  const featured = [away, home].flatMap((team) => keyPlayers.find((p) => p.team_id === team.id) ?? []);

  return (
    <>
      <GameHero game={game} day={day} away={away} home={home} view={hero}>
        {share && <GameCardExport game={game} day={day} away={away} home={home} view={share} featured={featured} />}
      </GameHero>

      {level !== 3 ? (
        <>
          <LockedStats level={level} />
          <KeyPlayers players={keyPlayers} away={away} home={home} />
        </>
      ) : detail ? (
        <>
          <div ref={tabsAnchor} />
          <div
            ref={tabsBar}
            role="tablist"
            aria-label="Secciones del partido"
            onKeyDown={onTabKeyDown}
            className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-10 flex h-12 items-stretch gap-5 border-b border-slate-800 bg-slate-950/90 px-4 backdrop-blur md:top-0 md:gap-7 md:px-8"
          >
            {TABS.map(({ id, label }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  id={`tab-${id}`}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls="game-panel"
                  tabIndex={active ? 0 : -1}
                  onClick={() => selectTab(id)}
                  className={cn(
                    "border-b-2 font-display text-sm font-bold uppercase tracking-[0.15em] outline-none transition-colors focus-visible:text-orange-300",
                    active ? "border-orange-500 text-white" : "border-transparent text-slate-400 hover:text-white"
                  )}
                >
                  {label}
                </button>
              );
            })}
            {detail.status === "Live" && (
              <span className="ml-auto hidden items-center gap-1.5 font-display text-xs font-bold uppercase tracking-wider text-red-400 sm:flex">
                <span className="size-1.5 animate-pulse rounded-full bg-red-500 motion-reduce:animate-none" />
                Actualizando cada 30 s
              </span>
            )}
          </div>

          <div id="game-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="min-h-[60vh]">
            {tab === "resumen" && <GameSummary detail={detail} away={away} home={home} onOpenPlayer={setSheetPlayer} />}
            {tab === "boxscore" && <BoxScoreTable detail={detail} away={away} home={home} onOpenPlayer={setSheetPlayer} />}
            {tab === "tiros" && (
              <ShotChartPanel
                detail={detail}
                away={away}
                home={home}
                teamId={shotTeam}
                playerId={shotPlayer}
                onTeamChange={(teamId) => showShots(teamId, null)}
                onPlayerChange={setShotPlayer}
              />
            )}
            {tab === "jugadas" && <PlayByPlay detail={detail} away={away} home={home} />}
          </div>

          {sheetPlayer !== null && (
            <PlayerGameSheet
              detail={detail}
              playerId={sheetPlayer}
              away={away}
              home={home}
              onClose={() => setSheetPlayer(null)}
              onShowShots={showShots}
            />
          )}
        </>
      ) : detail === null ? (
        <>
          <NotStarted finished={result?.status === "Final"} />
          <KeyPlayers players={keyPlayers} away={away} home={home} />
        </>
      ) : detailEntry?.error ? (
        <p className="flex items-center justify-center gap-2 border-b border-slate-800 px-4 py-12 text-sm text-slate-400">
          <WifiOff className="size-4" />
          No se han podido cargar las estadísticas. Reintentando…
        </p>
      ) : (
        <DetailSkeleton />
      )}
    </>
  );
}

function DetailSkeleton() {
  return (
    <div aria-busy>
      <div className="flex h-12 items-center gap-6 border-b border-slate-800 px-4 md:px-8">
        {TABS.map((t) => (
          <Placeholder key={t.id} className="h-3.5 w-16" />
        ))}
      </div>
      <div className="grid gap-6 border-b border-slate-800 px-4 py-6 md:px-8 lg:grid-cols-[5fr_7fr]">
        <Placeholder className="h-48" />
        <Placeholder className="h-48" />
      </div>
      <div className="px-4 py-6 md:px-8">
        <Placeholder className="h-64" />
      </div>
    </div>
  );
}
