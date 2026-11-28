"use client";

// Almacén de Juegos (Tarea 8.1) en localStorage: resultados de cada día (con su par, para el ELO, y su recibo) y racha.
// Solo guarda lo que el servidor de cada reto dio por bueno (Tareas 8.2-8.4); con la cuenta (8.5), mandan sus resultados
// (`account-store.ts`). El nivel de spoilers nunca va aquí.
import { useSyncExternalStore } from "react";
import { mergeAccountResults } from "@/lib/account";
import {
  addEndless,
  addPar,
  addResult,
  addRun,
  challengeDay,
  dropReceipts,
  EMPTY_PROGRESS,
  GAMES_STORAGE_KEY,
  missingPars,
  nextChallengeAt,
  parseProgress,
  serializeProgress,
  type ChallengeId,
  type ChallengeResult,
  type GamesProgress,
  type OpenRun,
} from "@/lib/games";

const listeners = new Set<() => void>();
// En memoria además de en el almacenamiento: en modo privado sin localStorage se juega igual durante la sesión
let current: GamesProgress | null = null;

function load(): GamesProgress {
  try {
    return parseProgress(localStorage.getItem(GAMES_STORAGE_KEY));
  } catch {
    return EMPTY_PROGRESS;
  }
}

function snapshot(): GamesProgress {
  current ??= load();
  return current;
}

function emit(next: GamesProgress) {
  current = next;
  listeners.forEach((listener) => listener());
}

// Otra pestaña jugó: se relee
function onStorage(event: StorageEvent) {
  if (event.key !== null && event.key !== GAMES_STORAGE_KEY) return;
  emit(load());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

/** Lo jugado en este dispositivo; null en el servidor y al hidratar (no se sabe hasta leer el almacenamiento). */
export function useGamesProgress(): GamesProgress | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}

function save(next: GamesProgress) {
  try {
    localStorage.setItem(GAMES_STORAGE_KEY, serializeProgress(next));
  } catch {
    // Sin almacenamiento: se queda solo en memoria.
  }
  emit(next);
}

/**
 * Con la sesión abierta (Tarea 8.5), la cuenta se entera de cada resultado nuevo con recibo y lo apunta: true si lo ha
 * hecho (entonces el par lo pone el servidor).
 */
type ResultListener = (result: ChallengeResult) => Promise<boolean>;
let resultListener: ResultListener | null = null;

export function setResultListener(listener: ResultListener | null) {
  resultListener = listener;
}

/**
 * Apunta el resultado que devolvió el servidor de un reto (un reto cuenta una vez al día) y después pide su par. Con la
 * sesión abierta, lo manda a la cuenta, que devuelve el par.
 */
export function recordResult(result: ChallengeResult) {
  const prev = snapshot();
  const next = addResult(prev, result);
  if (next === prev) return fillPars(result.day);
  save(next);
  const added = next.results.find((r) => r.day === result.day && r.game === result.game);
  if (!resultListener || !added?.receipt) return fillPars(result.day);
  resultListener(added).then(
    (saved) => saved || fillPars(result.day),
    () => fillPars(result.day)
  );
}

/** Lo jugado ahora mismo (para la cuenta, fuera de React). */
export const gamesProgressNow = (): GamesProgress => snapshot();

/** Los resultados de la cuenta (Tarea 8.5): para cada reto y día mandan ellos; lo que solo tiene el dispositivo se queda. */
export function replaceGameResults(results: readonly ChallengeResult[]) {
  const prev = snapshot();
  const next = mergeAccountResults(prev, results);
  if (next !== prev) save(next);
}

/** Quita los recibos ya mandados a la cuenta: estén o no en ella, no se vuelven a mandar. */
export function forgetReceipts(sent: ReadonlySet<string>) {
  const prev = snapshot();
  const next = dropReceipts(prev, sent);
  if (next !== prev) save(next);
}

// Días cuyo par ya se está pidiendo (una petición por día a la vez)
const parRequests = new Set<string>();

async function fetchPar(day: string): Promise<Partial<Record<ChallengeId, number>> | null> {
  try {
    const response = await fetch(`/api/juegos/par?day=${day}`);
    if (!response.ok) return null;
    const data = (await response.json()) as { par?: Partial<Record<ChallengeId, number>> };
    return data.par ?? null;
  } catch {
    return null;
  }
}

/**
 * Pide al servidor el par (lo que sacó la mitad de la gente) de los resultados de hoy y ayer que aún no lo tienen, y
 * lo apunta: con él se calcula el ELO (`elo.ts`). Si falla, se vuelve a intentar la próxima vez.
 */
export function fillPars(today: string) {
  const days = [...new Set(missingPars(snapshot(), today).map((r) => r.day))];
  for (const day of days) {
    if (parRequests.has(day)) continue;
    parRequests.add(day);
    fetchPar(day)
      .then((par) => {
        if (!par) return;
        const prev = snapshot();
        let next = prev;
        for (const r of prev.results) if (r.day === day && typeof par[r.game] === "number") next = addPar(next, day, r.game, par[r.game]!);
        if (next !== prev) save(next);
      })
      .finally(() => parRequests.delete(day));
  }
}

/** Apunta el número de la partida de hoy de un reto, para seguirla al volver (Adivina el jugador, Carrera oculta). */
export function recordRun(game: ChallengeId, open: OpenRun) {
  const prev = snapshot();
  const next = addRun(prev, game, open);
  if (next !== prev) save(next);
}

/** Apunta una racha del modo infinito de ¿Más o menos? si es récord. */
export function recordEndless(streak: number) {
  const prev = snapshot();
  const next = addEndless(prev, streak);
  if (next !== prev) save(next);
}

/** "Borrar los datos de este dispositivo" (/privacidad): puntos, racha y resultados fuera. */
export function clearGames() {
  try {
    localStorage.removeItem(GAMES_STORAGE_KEY);
  } catch {
    // Sin almacenamiento: ya solo estaban en memoria.
  }
  emit(EMPTY_PROGRESS);
}

// Reloj por minutos: el mismo valor durante todo el minuto (useSyncExternalStore exige un valor estable)
const minuteNow = () => Math.floor(Date.now() / 60_000) * 60_000;

function subscribeClock(listener: () => void) {
  const timer = setInterval(listener, 15_000);
  // Al volver a la pestaña o a la app, al momento
  document.addEventListener("visibilitychange", listener);
  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", listener);
  };
}

/**
 * Día del reto según el reloj del dispositivo, y cuándo llegan los siguientes. Cambia solo a las 7:00 de España
 * aunque la página siga abierta. null en el servidor y al hidratar: la página es la misma para todos.
 */
export function useChallengeClock(): { day: string; next: number; now: number } | null {
  const now = useSyncExternalStore(subscribeClock, minuteNow, () => null);
  return now === null ? null : { day: challengeDay(now), next: nextChallengeAt(now), now };
}
