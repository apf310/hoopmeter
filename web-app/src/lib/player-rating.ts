// "Media", escala y avisos de la ficha del jugador (Tareas 6.19 y 7.10). Puro y sin dependencias: se prueba con `npm test`.
import type { RadarAttributes } from "@/lib/supabase";

/** Escala de la media y de los seis atributos (Tarea 7.10): de 40 a 99, como en los videojuegos. */
export const RATING_MIN = 40;
export const RATING_MAX = 99;
/** La mitad de la rotación en un atributo: 40 + 59 · 0,5. */
export const RATING_MIDDLE = 69.5;

/** Cortes de nivel (insignias, barras, radar y material de la ficha 3D): 84+ élite, 70-83, 55-69 y menos de 55. */
export const RATING_CUTS = { elite: 84, great: 70, good: 55 } as const;
export type RatingLevel = "elite" | "great" | "good" | "low";

export function ratingLevel(value: number): RatingLevel {
  if (value >= RATING_CUTS.elite) return "elite";
  if (value >= RATING_CUTS.great) return "great";
  if (value >= RATING_CUTS.good) return "good";
  return "low";
}

/** Fracción de la escala para dibujar (radar, barras, huella): 40 en el centro (0) y 99 en el borde (1). */
export function ratingShare(value: number): number {
  return Math.min(1, Math.max(0, (value - RATING_MIN) / (RATING_MAX - RATING_MIN)));
}

/**
 * "Media" (Tarea 7.10): de 40 a 99, proporcional a su Game Score por partido, acercado al de un suplente si
 * lleva pocos partidos; el 99 lo marca la media de los tres mejores de la rotación. Se calcula en
 * `player_radar_calc.py`: la web solo la lee, nunca la rehace con las barras. Null si no ha jugado esta
 * temporada o si el radar es anterior a la 6.19.
 */
export function overallRating(radar: RadarAttributes): number | null {
  return typeof radar.overall === "number" ? radar.overall : null;
}

export const OVERALL_EXPLAINED =
  "Media de 40 a 99: lo que aporta por partido (Game Score); el 99 lo marcan los tres mejores de la temporada. Con pocos partidos se acerca a la de un suplente.";

/** Quien aún no ha jugado esta temporada: ni media ni atributos (nunca los del año pasado). */
export const NO_GAMES_NOTE = "Aún no ha jugado esta temporada: tendrá media y atributos desde su primer partido.";

/** Por debajo de estos partidos la temporada aún puede dar muchos vuelcos. */
export const SHORT_SAMPLE_GAMES = 20;

/** Aviso de muestra corta bajo el radar, o null si la muestra es suficiente. */
export function sampleNote(radar: Pick<RadarAttributes, "games_played">): string | null {
  const games = radar.games_played;
  if (!games) return NO_GAMES_NOTE;
  if (games < SHORT_SAMPLE_GAMES) {
    return `Muestra corta (${games} ${games === 1 ? "partido" : "partidos"}): media y atributos se acercan a los de un suplente hasta que juegue más.`;
  }
  return null;
}

/** Por debajo de estos intentos un porcentaje no dice casi nada (Aday Mara: 1 de 1 en triples = "100.0"). */
export const MIN_PCT_ATTEMPTS = 20;

/** % de tiro de la ficha: "1/1" en vez del porcentaje si hay muy pocos intentos (con totales exactos). */
export function shotPct(value: number | null | undefined, made?: number | null, attempts?: number | null): string {
  if (made != null && attempts != null && attempts < MIN_PCT_ATTEMPTS) return attempts ? `${made}/${attempts}` : "–";
  return value == null ? "–" : (value * 100).toFixed(1);
}
