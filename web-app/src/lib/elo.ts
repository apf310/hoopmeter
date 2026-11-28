// ELO de los Juegos (Tarea 8.1, revisada el 28-nov): el nivel de cada jugador, como en un juego competitivo. Puro y sin
// dependencias (tests con `node --test`).
//
// No son puntos que solo suman (quien empezara un año tarde nunca alcanzaría a nadie) ni un ELO que se recoloca en dos
// semanas (un recién llegado no puede pasar por encima de quien lleva meses porque sí). Cada reto sube o baja el ELO
// según cómo lo haces frente a lo que se espera de tu nivel, y lo que se espera sale de cómo le fue a todo el mundo ese
// día:
//   - "Par" del día: lo que sacó la mitad de la gente en ese reto (de 0 a 1), con datos del servidor; con pocos datos,
//     se acerca a lo de siempre. Un día difícil para todos no castiga a nadie.
//   - Esperado = 1 / (1 + 10^((D - elo) / 400)), con D tal que quien tiene `ANCHOR` de ELO espera justo el par.
//   - Cambio = K × (lo que sacaste - lo esperado), redondeado. K es lo máximo que mueve un reto: el que no se puede
//     copiar (¿Más o menos?, 30) pesa el doble que los de solución común (15 cada uno). Como mucho, 60 al día.
// Así, subir lleva tiempo (un jugador perfecto que empieza de cero tarda más de un mes en llegar a MVP) y cada uno
// acaba donde le corresponde por cómo juega (quien juega como la mitad de la gente se queda en Titular, con 1.000).
// Las dos primeras divisiones no se pierden una vez alcanzadas (suelos) y cada temporada (1 de octubre, con la NBA)
// quien pasa de Titular se acerca a la mitad: todos los años hay sitio arriba para quien llega.
//
// Todo sale de los resultados guardados (y del par que tenían al apuntarlos), en el orden en que se jugaron, así que no
// hay contadores que se desajusten; con las cuentas (Tarea 8.5) lo recalculará el servidor con sus propios datos.
import { CHALLENGES, type ChallengeId, type ChallengeResult } from "./games.ts";

/** El ELO con el que empieza todo el mundo. */
export const START_ELO = 0;
/** El de quien juega exactamente como la mitad de la gente: el centro de Titular. */
export const ANCHOR = 1_000;
/** Lo máximo que mueve cada reto (arriba o abajo). */
export const ELO_K: Readonly<Record<ChallengeId, number>> = { "mas-o-menos": 30, adivina: 15, carrera: 15 };
/** Lo que saca la mitad de la gente en cada reto cuando aún no hay datos del día (de 0 a 1). */
export const PAR_PRIOR: Readonly<Record<ChallengeId, number>> = { "mas-o-menos": 0.6, adivina: 0.55, carrera: 0.45 };
/** Partidas del día que pesan como lo de siempre: con 20 jugadores, mitad y mitad. */
export const PAR_WEIGHT = 20;
const PAR_MIN = 0.05;
const PAR_MAX = 0.95;
/** Divisiones que no se pierden una vez alcanzadas (Sexto Hombre y Titular). */
export const FLOORS: readonly number[] = [400, 800];
/** Cada temporada, lo que pase de aquí se queda en la mitad. */
export const SEASON_RESET_ABOVE = 800;
/** Mes en que empieza la temporada (octubre, con la NBA). */
export const SEASON_START_MONTH = 10;

const MAX_POINTS = new Map(CHALLENGES.map((c) => [c.id, c.maxPoints]));

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * El par de un reto en un día (de 0 a 1): la mediana de los puntos de quienes lo han acabado (`median`, en puntos, de
 * `n` partidas), acercada a lo de siempre mientras haya pocas.
 */
export function parOf(game: ChallengeId, stats: { n: number; median: number } | null | undefined): number {
  const prior = PAR_PRIOR[game];
  const max = MAX_POINTS.get(game) ?? 1;
  const n = stats && Number.isFinite(stats.n) && stats.n > 0 && Number.isFinite(stats.median) ? stats.n : 0;
  const observed = n > 0 ? clamp(stats!.median / max, 0, 1) : prior;
  const blended = (n * observed + PAR_WEIGHT * prior) / (n + PAR_WEIGHT);
  return Math.round(clamp(blended, PAR_MIN, PAR_MAX) * 1000) / 1000;
}

/** Lo que se espera (de 0 a 1) de alguien con ese ELO en un reto con ese par. */
export function expectedShare(elo: number, par: number): number {
  const p = clamp(par, PAR_MIN, PAR_MAX);
  const difficulty = ANCHOR + 400 * Math.log10((1 - p) / p);
  return 1 / (1 + 10 ** ((difficulty - elo) / 400));
}

/** Lo que sube o baja un reto: K × (lo que sacaste − lo esperado). */
export function eloDelta(elo: number, game: ChallengeId, points: number, par: number): number {
  const share = clamp(points / (MAX_POINTS.get(game) ?? 1), 0, 1);
  // `+ 0`: nunca "-0"
  return Math.round(ELO_K[game] * (share - expectedShare(elo, par))) + 0;
}

/** Temporada de un día del reto: 2026 va del 1-oct-2026 al 30-sep-2027. */
export function eloSeason(day: string): number {
  const [y, m] = day.split("-").map(Number);
  return m >= SEASON_START_MONTH ? y : y - 1;
}

/** Al empezar temporada: lo que pase de Titular se queda en la mitad. */
export const seasonReset = (elo: number): number =>
  elo > SEASON_RESET_ABOVE ? SEASON_RESET_ABOVE + Math.round((elo - SEASON_RESET_ABOVE) / 2) : elo;

export type EloEntry = { day: string; game: ChallengeId; delta: number; elo: number };

export type EloState = {
  elo: number;
  /** Lo más alto de esta temporada. */
  best: number;
  /** De aquí no se baja (la última división protegida alcanzada). */
  floor: number;
  /** Cada reto apuntado, en orden, con lo que subió o bajó (ya con los suelos). */
  entries: EloEntry[];
};

/**
 * El ELO a partir de los resultados guardados, por días y, dentro de cada día, en el orden en que se apuntaron (el
 * de juego: lo que dio un reto no cambia al jugar el siguiente). Un resultado sin par usa el de siempre.
 */
export function eloOf(results: readonly Pick<ChallengeResult, "day" | "game" | "points" | "par">[]): EloState {
  // `sort` es estable: dentro del día se queda el orden guardado
  const sorted = [...results].sort((a, b) => (a.day === b.day ? 0 : a.day < b.day ? -1 : 1));
  const state: EloState = { elo: START_ELO, best: START_ELO, floor: 0, entries: [] };
  let season: number | null = null;
  for (const r of sorted) {
    const s = eloSeason(r.day);
    if (season !== null && s !== season) {
      state.elo = seasonReset(state.elo);
      state.best = state.elo;
    }
    season = s;
    const par = typeof r.par === "number" ? r.par : PAR_PRIOR[r.game];
    const before = state.elo;
    const after = Math.max(state.floor, before + eloDelta(before, r.game, r.points, par));
    state.elo = after;
    state.best = Math.max(state.best, after);
    state.floor = Math.max(state.floor, ...FLOORS.filter((f) => after >= f));
    state.entries.push({ day: r.day, game: r.game, delta: after - before, elo: after });
  }
  return state;
}

/** Lo que han subido o bajado los retos de un día. */
export const eloOfDay = (state: EloState, day: string): number => state.entries.filter((e) => e.day === day).reduce((sum, e) => sum + e.delta, 0);
