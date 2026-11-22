// "Media" y avisos de la ficha del jugador (Tarea 6.19). Puro y sin dependencias: se prueba con `npm test`.
import type { RadarAttributes } from "@/lib/supabase";

/**
 * "Media" estilo videojuego (Tarea 6.19): percentil 0-99 de su Game Score por partido frente a los
 * jugadores de rotación, calculado en `player_radar_calc.py`. Null si no entra en la escala (pocos
 * partidos o minutos) o si el radar es anterior a la 6.19: mejor sin media que con una injusta.
 */
export function overallRating(radar: RadarAttributes): number | null {
  return typeof radar.overall === "number" ? radar.overall : null;
}

export const OVERALL_EXPLAINED =
  "Media: lo que aporta por partido (Game Score) frente a los jugadores de rotación de la temporada. Un 90 supera al 90 %.";

/** Por debajo de estos partidos la temporada aún puede dar muchos vuelcos. */
export const SHORT_SAMPLE_GAMES = 20;

/** Aviso de muestra corta bajo el radar, o null si la muestra es suficiente. */
export function sampleNote(radar: Pick<RadarAttributes, "qualified" | "games_played" | "minutes">): string | null {
  const games = radar.games_played;
  if (!radar.qualified) {
    const perGame = radar.minutes != null && games ? `, ${Math.round(radar.minutes / games)} min por partido` : "";
    return `Juega poco para entrar en la escala (${games} ${games === 1 ? "partido" : "partidos"}${perGame}): valores orientativos y sin media.`;
  }
  if (games < SHORT_SAMPLE_GAMES) return `Muestra corta (${games} partidos): aún puede moverse bastante.`;
  return null;
}

/** Por debajo de estos intentos un porcentaje no dice casi nada (Aday Mara: 1 de 1 en triples = "100.0"). */
export const MIN_PCT_ATTEMPTS = 20;

/** % de tiro de la ficha: "1/1" en vez del porcentaje si hay muy pocos intentos (con totales exactos). */
export function shotPct(value: number | null | undefined, made?: number | null, attempts?: number | null): string {
  if (made != null && attempts != null && attempts < MIN_PCT_ATTEMPTS) return attempts ? `${made}/${attempts}` : "–";
  return value == null ? "–" : (value * 100).toFixed(1);
}
