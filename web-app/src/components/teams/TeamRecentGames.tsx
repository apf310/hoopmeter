"use client";

import { useEffect, useMemo } from "react";
import { PureScoreBadge } from "@/components/games/PureScoreBadge";
import { onLevelIntent, useSpoilerLevel } from "@/context/SpoilerContext";
import { toGameResult, type GameMatchup, type GameResult } from "@/lib/game-day";
import {
  IDLE_MAX_AGE_MS,
  LIVE_MAX_AGE_MS,
  loadLive,
  loadTeamGames,
  useLive,
  useTeamGamesLevel2,
  useTeamGamesLevel3,
} from "@/lib/game-day-store";
import { cn } from "@/lib/utils";
import { TeamGameRow, type RivalLite } from "./TeamGameRow";

/**
 * Últimos partidos del equipo según el nivel de spoilers (Tarea 6.7). Nivel 1: rival y fecha (vienen en el HTML);
 * Nivel 2: + la nota; Nivel 3: + el resultado. Nota y resultado se piden solo en su nivel (o al ir a pasar a él).
 */
export function TeamRecentGames({ teamId, games, rivals }: { teamId: number; games: GameMatchup[]; rivals: Record<number, RivalLite> }) {
  const level = useSpoilerLevel();
  const level2 = useTeamGamesLevel2(level, teamId);
  const level3 = useTeamGamesLevel3(level, teamId);
  const live = useLive(level);

  const scores = useMemo(() => new Map(level2?.data?.games.map((g) => [g.id, g.excitement_score])), [level2]);
  const results = useMemo(() => new Map(level3?.data?.games.map((g) => [g.id, g])), [level3]);
  const liveById = useMemo(() => new Map(live?.data?.games.map((g) => [g.id, g])), [live]);
  const inProgress = level3?.data?.games.some((g) => g.status === "Live") ?? false;

  useEffect(() => {
    if (level === 1 || games.length === 0) return;
    void loadTeamGames(level, teamId, inProgress ? LIVE_MAX_AGE_MS : IDLE_MAX_AGE_MS);
    if (level === 3 && inProgress) void loadLive();
    if (!inProgress) return;
    // Con un partido en juego, el marcador se refresca como en la jornada
    const timer = setInterval(() => {
      void loadTeamGames(level, teamId);
      if (level === 3) void loadLive();
    }, LIVE_MAX_AGE_MS);
    return () => clearInterval(timer);
  }, [level, teamId, inProgress, games.length]);

  // Al ir a cambiar de nivel se precarga lo de ese nivel sin enseñarlo: al confirmar aparece al instante
  useEffect(
    () =>
      onLevelIntent((target) => {
        if (target !== 1 && games.length > 0) void loadTeamGames(target, teamId, IDLE_MAX_AGE_MS);
      }),
    [teamId, games.length]
  );

  if (games.length === 0) return <p className="py-4 text-sm text-slate-400">Aún no ha jugado esta temporada.</p>;

  return (
    <ul>
      {games.map((game) => (
        <TeamGameRow key={game.id} teamId={teamId} game={game} rival={rivals[game.home_team_id === teamId ? game.away_team_id : game.home_team_id]}>
          {level === 2 &&
            (level2?.data ? (
              <PureScoreBadge score={scores.get(game.id) ?? null} />
            ) : level2?.error ? null : (
              <Placeholder className="h-9 w-12" />
            ))}
          {level === 3 &&
            (level3?.data || liveById.has(game.id) ? (
              <ResultCell teamId={teamId} game={game} result={toGameResult(results.get(game.id), liveById.get(game.id))} />
            ) : level3?.error ? null : (
              <Placeholder className="h-9 w-28" />
            ))}
        </TeamGameRow>
      ))}
    </ul>
  );
}

/** Nivel 3: "V 112-105" (los puntos del equipo primero) y la nota; en juego, "Directo" y el marcador. */
function ResultCell({ teamId, game, result }: { teamId: number; game: GameMatchup; result: GameResult | undefined }) {
  if (!result || result.status === "Scheduled" || result.home.score === null || result.away.score === null) return null;

  const isHome = game.home_team_id === teamId;
  const own = isHome ? result.home.score : result.away.score;
  const rival = isHome ? result.away.score : result.home.score;
  const live = result.status === "Live";
  const won = own > rival;

  return (
    <>
      <span className="flex items-center gap-1.5 font-display uppercase">
        {live ? (
          <span className="flex items-center gap-1 text-xs font-bold tracking-wider text-red-400">
            <span className="size-1.5 animate-pulse rounded-full bg-red-500 motion-reduce:animate-none" aria-hidden />
            Directo
          </span>
        ) : (
          <span
            className={cn("flex size-5 items-center justify-center text-xs font-extrabold text-white", won ? "bg-emerald-600" : "bg-red-600")}
            aria-label={won ? "Victoria" : "Derrota"}
          >
            {won ? "V" : "D"}
          </span>
        )}
        <span className="text-lg font-extrabold text-white tabular-nums">
          {own}-{rival}
        </span>
      </span>
      {result.status === "Final" && <PureScoreBadge score={result.excitementScore} />}
    </>
  );
}

function Placeholder({ className }: { className: string }) {
  return <span aria-hidden className={cn("block animate-pulse rounded-md bg-slate-800/80", className)} />;
}
