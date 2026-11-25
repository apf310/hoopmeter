// Cuánto se puede guardar cada cosa en las cachés compartidas (Tarea 7.7). Puro, sin dependencias (con tests).
//
// En Vercel `"use cache"` no se conserva entre visitas: lo que acelera de verdad es la CDN (`s-maxage` y
// `stale-while-revalidate`) y `"use cache: remote"`. Con ventanas fijas largas, la primera visita de la mañana vería lo
// de ayer; con cortas, casi nadie acierta en la caché. Aquí la ventana llega justo hasta el próximo momento en que el
// dato puede cambiar, y nunca lo pasa.

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** El job diario (`daily_stats_sync.yml`, `backend-data/cron.sql`) empieza a las 10:30 UTC. */
const JOB_START = 10 * HOUR + 30 * MINUTE;
/** Margen para que termine, aunque arranque tarde: durante este rato se comprueba cada poco. */
const JOB_MARGIN = 90 * MINUTE;

/** Segundos: fresco hasta `fresh`; después aún se puede servir (refrescando por detrás) hasta `expire`. */
export type CacheWindow = { fresh: number; expire: number };

/**
 * Ventana de lo que solo cambia en el job diario (promedios, medias, radares): hasta el próximo job, refrescando cada
 * hora por si entre medias cambia un equipo o un salario. Mientras el job puede estar escribiendo, 5 minutos.
 */
export function dailyWindow(now: number): CacheWindow {
  const second = Math.floor(now / 1000) % DAY;
  const sinceJob = (second - JOB_START + DAY) % DAY;
  if (sinceJob < JOB_MARGIN) return { fresh: 5 * MINUTE, expire: 5 * MINUTE };
  const untilJob = Math.max(MINUTE, DAY - sinceJob);
  return { fresh: Math.min(HOUR, untilJob), expire: untilJob };
}

/**
 * Lo mismo para `cacheLife`. Next exige que caduque después de refrescarse, y deja fuera del prerenderizado lo que
 * caduca en menos de 5 minutos.
 */
export function dailyLife(now: number): { stale: number; revalidate: number; expire: number } {
  const { fresh, expire } = dailyWindow(now);
  const revalidate = Math.max(5 * MINUTE, fresh);
  return { stale: 5 * MINUTE, revalidate, expire: Math.max(revalidate + MINUTE, expire) };
}

/** Un partido y si ya tiene nota: con ella está terminado y su resultado también está guardado. */
export type PendingGame = { game_datetime_utc: string; scored: boolean };

/** Un partido que sigue sin nota tanto después de empezar (aplazado, nota pendiente) ya no acorta la ventana de nadie. */
export const PENDING_LOOKBACK_HOURS = 12;
/** Ningún partido acaba antes: hasta entonces no puede haber notas ni resultados finales nuevos. */
const SHORTEST_GAME = 90 * MINUTE;
const MAX_SCORES_WINDOW = 12 * HOUR;

/**
 * Ventana de las notas: con algún partido que ya puede haber terminado y sin nota, un minuto; si no, hasta que el
 * próximo pueda haber terminado.
 */
export function scoresWindow(games: PendingGame[], now: number): CacheWindow {
  let until = MAX_SCORES_WINDOW;
  for (const { game_datetime_utc, scored } of games) {
    if (scored) continue;
    const sinceTipoff = (now - Date.parse(game_datetime_utc)) / 1000;
    if (sinceTipoff > PENDING_LOOKBACK_HOURS * HOUR) continue;
    if (sinceTipoff >= SHORTEST_GAME) return { fresh: MINUTE, expire: 2 * MINUTE };
    until = Math.min(until, SHORTEST_GAME - sinceTipoff);
  }
  const expire = Math.max(MINUTE, Math.floor(until));
  return { fresh: Math.min(HOUR, expire), expire };
}

/** Un partido de una jornada tal como está guardado. */
export type DayGame = { game_datetime_utc: string; status: string; excitement_score: number | null };

/**
 * Ventana de una jornada (notas o resultados, `/api/games`): terminada entera y con todas las notas, horas; sin
 * empezar, hasta el primer salto inicial; en juego, 30 segundos.
 */
export function dayWindow(games: DayGame[], now: number): CacheWindow {
  const live: CacheWindow = { fresh: 30, expire: MINUTE };
  if (games.length === 0) return live;
  if (games.every((game) => game.status === "Final" && game.excitement_score !== null)) return { fresh: HOUR, expire: DAY };
  const first = Math.min(...games.map((game) => Date.parse(game.game_datetime_utc)));
  const untilFirst = Math.floor((first - now) / 1000);
  if (untilFirst <= MINUTE || games.some((game) => game.status !== "Scheduled")) return live;
  return { fresh: Math.min(HOUR, untilFirst), expire: Math.min(DAY, untilFirst) };
}

/** Cabecera para la CDN; `browser` = segundos que lo guarda el navegador. Pasada la ventana, nunca se sirve. */
export function cdnHeaders({ fresh, expire }: CacheWindow, browser = 0): { "Cache-Control": string } {
  return { "Cache-Control": `public, max-age=${browser}, s-maxage=${fresh}, stale-while-revalidate=${Math.max(0, expire - fresh)}` };
}
