// Caché en memoria del cliente (por pestaña, nunca persistida) para la pantalla de jornada.
// Cada nivel de spoilers tiene su propia clave: el Nivel 2 jamás puede leer datos del Nivel 3.
// Lo ya descargado se pinta al instante y se revalida en segundo plano.
import { useSyncExternalStore } from "react";
import type { GameDetail } from "@/lib/game-detail";
import type { ScheduleTuple } from "@/lib/game-day";
import type { LiveScoreboard } from "@/lib/live";
import type { GameLevel2, GameLevel3, SpoilerLevel } from "@/lib/spoilers";
import type { StandingsRow } from "@/lib/standings";

export type Entry<T> = { data?: T; at: number; error?: boolean };

export type SchedulePayload = { games: ScheduleTuple[] };
export type Level2Payload = { day: string; level: 2; games: GameLevel2[] };
export type Level3Payload = { day: string; level: 3; games: GameLevel3[] };
/** `detail: null` = el partido aún no ha empezado. */
export type GameDetailPayload = { detail: GameDetail | null };
export type StandingsPayload = { teams: StandingsRow[] };
export type TeamGamesLevel2Payload = { level: 2; games: GameLevel2[] };
export type TeamGamesLevel3Payload = { level: 3; games: GameLevel3[] };
/** Línea de un jugador en un partido (Tarea 6.8). Null = no estaba en el boxscore de ese partido. */
export type PlayerGameLine = {
  played: boolean;
  absence: string | null;
  seconds: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  fgm: number;
  fga: number;
  fg3m: number;
  fg3a: number;
  plusMinus: number;
};
export type PlayerGamesPayload = { level: 3; lines: Record<string, PlayerGameLine | null> };

/** Antigüedad máxima de una jornada en juego (igual que la caché de 30 s del servidor). */
export const LIVE_MAX_AGE_MS = 30_000;
/** Jornadas sin partidos en juego: basta con revalidar de vez en cuando. */
export const IDLE_MAX_AGE_MS = 10 * 60_000;

const entries = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setEntry(key: string, entry: Entry<unknown>) {
  entries.set(key, entry);
  listeners.forEach((listener) => listener());
}

/** Descarga `url` si no hay copia más reciente que `maxAgeMs`. Peticiones simultáneas se agrupan en una. */
function load(key: string, url: string, maxAgeMs: number): Promise<void> {
  const cached = entries.get(key);
  if (cached?.data !== undefined && Date.now() - cached.at < maxAgeMs) return Promise.resolve();

  const pending = inflight.get(key);
  if (pending) return pending;

  const request = fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<unknown>;
    })
    .then(
      (data) => setEntry(key, { data, at: Date.now() }),
      // Sin red: se conserva lo último bueno y se reintenta en el siguiente refresco
      () => {
        if (entries.get(key)?.data === undefined) setEntry(key, { at: 0, error: true });
      }
    )
    .finally(() => inflight.delete(key));
  inflight.set(key, request);
  return request;
}

function useEntry<T>(key: string | null): Entry<T> | undefined {
  return useSyncExternalStore(
    subscribe,
    () => (key ? (entries.get(key) as Entry<T> | undefined) : undefined),
    () => undefined
  );
}

const dayKey = (level: 2 | 3, day: string) => `${level}:${day}`;

export function loadSchedule(): Promise<void> {
  return load("schedule", "/api/schedule", Infinity);
}

export function useSchedule(): Entry<SchedulePayload> | undefined {
  return useEntry<SchedulePayload>("schedule");
}

export function loadDay(level: 2 | 3, day: string, maxAgeMs = LIVE_MAX_AGE_MS): Promise<void> {
  return load(dayKey(level, day), `/api/games?date=${day}&level=${level}`, maxAgeMs);
}

/** Datos de la jornada para el nivel actual. En Nivel 1 no hay nada que leer. */
export function useDayLevel2(level: SpoilerLevel, day: string): Entry<Level2Payload> | undefined {
  return useEntry<Level2Payload>(level === 2 ? dayKey(2, day) : null);
}

export function useDayLevel3(level: SpoilerLevel, day: string): Entry<Level3Payload> | undefined {
  return useEntry<Level3Payload>(level === 3 ? dayKey(3, day) : null);
}

/** Marcador en directo de la NBA (`/api/live`, caché compartida de 30 s). Solo para Nivel 3. */
export function loadLive(): Promise<void> {
  return load("live", "/api/live", LIVE_MAX_AGE_MS);
}

export function useLive(level: SpoilerLevel): Entry<LiveScoreboard> | undefined {
  return useEntry<LiveScoreboard>(level === 3 ? "live" : null);
}

const detailKey = (gameId: string) => `detail:${gameId}`;

/** Ficha completa de un partido (`/api/games/[id]`): boxscore, tiros y jugada a jugada. Solo para Nivel 3. */
export function loadGameDetail(gameId: string, maxAgeMs = LIVE_MAX_AGE_MS): Promise<void> {
  return load(detailKey(gameId), `/api/games/${gameId}`, maxAgeMs);
}

export function useGameDetail(level: SpoilerLevel, gameId: string): Entry<GameDetailPayload> | undefined {
  return useEntry<GameDetailPayload>(level === 3 ? detailKey(gameId) : null);
}

const teamGamesKey = (level: 2 | 3, teamId: number) => `team:${level}:${teamId}`;

/** Últimos partidos de un equipo con nota (Nivel 2) o resultado (Nivel 3) (`/api/teams/[id]/games`, Tarea 6.7). */
export function loadTeamGames(level: 2 | 3, teamId: number, maxAgeMs = LIVE_MAX_AGE_MS): Promise<void> {
  return load(teamGamesKey(level, teamId), `/api/teams/${teamId}/games?level=${level}`, maxAgeMs);
}

export function useTeamGamesLevel2(level: SpoilerLevel, teamId: number): Entry<TeamGamesLevel2Payload> | undefined {
  return useEntry<TeamGamesLevel2Payload>(level === 2 ? teamGamesKey(2, teamId) : null);
}

export function useTeamGamesLevel3(level: SpoilerLevel, teamId: number): Entry<TeamGamesLevel3Payload> | undefined {
  return useEntry<TeamGamesLevel3Payload>(level === 3 ? teamGamesKey(3, teamId) : null);
}

const playerGamesKey = (playerId: number) => `player:3:${playerId}`;

/** Línea del jugador en los últimos partidos de su equipo (`/api/players/[id]/games`, Tarea 6.8). Solo para Nivel 3. */
export function loadPlayerGames(playerId: number, maxAgeMs = LIVE_MAX_AGE_MS): Promise<void> {
  return load(playerGamesKey(playerId), `/api/players/${playerId}/games?level=3`, maxAgeMs);
}

export function usePlayerGames(level: SpoilerLevel, playerId: number | undefined): Entry<PlayerGamesPayload> | undefined {
  return useEntry<PlayerGamesPayload>(level === 3 && playerId !== undefined ? playerGamesKey(playerId) : null);
}

/** Clasificación al día (`/api/standings`, Tarea 6.6). Solo para Nivel 3: los Niveles 1 y 2 usan la de antes de la jornada. */
export function loadStandings(): Promise<void> {
  return load("standings", "/api/standings", LIVE_MAX_AGE_MS);
}

export function useStandingsNow(level: SpoilerLevel): Entry<StandingsPayload> | undefined {
  return useEntry<StandingsPayload>(level === 3 ? "standings" : null);
}
