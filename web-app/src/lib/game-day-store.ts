// Caché en memoria del cliente (por pestaña, nunca persistida) para la pantalla de jornada.
// Cada nivel de spoilers tiene su propia clave: el Nivel 2 jamás puede leer datos del Nivel 3.
// Lo ya descargado se pinta al instante y se revalida en segundo plano.
import { useSyncExternalStore } from "react";
import type { GameDetail } from "@/lib/game-detail";
import type { ScheduleTuple } from "@/lib/game-day";
import type { LiveScoreboard } from "@/lib/live";
import type { GameLevel2, GameLevel3, SpoilerLevel } from "@/lib/spoilers";

export type Entry<T> = { data?: T; at: number; error?: boolean };

export type SchedulePayload = { games: ScheduleTuple[] };
export type Level2Payload = { day: string; level: 2; games: GameLevel2[] };
export type Level3Payload = { day: string; level: 3; games: GameLevel3[] };
/** `detail: null` = el partido aún no ha empezado. */
export type GameDetailPayload = { detail: GameDetail | null };

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
