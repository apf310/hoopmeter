// Interpretación "para todos los públicos" del radar: etiquetas, niveles, media y arquetipo.
import { RADAR_CATEGORIES, type Player, type RadarAttributes, type RadarCategory } from "@/lib/supabase";

export const RADAR_LABEL: Record<RadarCategory, string> = {
  scoring: "Anotación",
  shooting: "Tiro exterior",
  playmaking: "Creación",
  defense: "Defensa",
  rebounding: "Rebote",
  efficiency: "Eficiencia",
};

export type Tier = { label: string; color: string; textClass: string };

/** Nivel de un percentil 0-99 con el color que se usa en barras, insignias y radar. */
export function tierOf(value: number): Tier {
  if (value >= 90) return { label: "Élite", color: "#f59e0b", textClass: "text-amber-400" };
  if (value >= 75) return { label: "Notable", color: "#10b981", textClass: "text-emerald-400" };
  if (value >= 45) return { label: "Bueno", color: "#38bdf8", textClass: "text-sky-400" };
  return { label: "Mejorable", color: "#64748b", textClass: "text-slate-400" };
}

export function getRadar(player: Player): RadarAttributes | null {
  const radar = player.radar_attributes as Partial<RadarAttributes>;
  return RADAR_CATEGORIES.every((c) => typeof radar?.[c] === "number") ? (radar as RadarAttributes) : null;
}

/**
 * "Media" estilo videojuego: promedio de sus 4 mejores atributos. Así un especialista
 * de élite (p. ej. un pívot que no tira de tres) no queda penalizado por su rol.
 */
export function overallRating(radar: RadarAttributes): number {
  const top = RADAR_CATEGORIES.map((c) => radar[c]).sort((a, b) => b - a).slice(0, 4);
  return Math.round(top.reduce((sum, v) => sum + v, 0) / top.length);
}

// Arquetipo según sus dos mejores atributos (clave ordenada como RADAR_CATEGORIES).
const ARCHETYPES: Record<string, string> = {
  "scoring+shooting": "Francotirador anotador",
  "scoring+playmaking": "Generador ofensivo",
  "scoring+defense": "Estrella a dos bandas",
  "scoring+rebounding": "Dominador interior",
  "scoring+efficiency": "Anotador letal",
  "shooting+playmaking": "Base tirador",
  "shooting+defense": "Especialista 3&D",
  "shooting+rebounding": "Interior abierto",
  "shooting+efficiency": "Tirador de precisión",
  "playmaking+defense": "Director de dos vías",
  "playmaking+rebounding": "Pívot organizador",
  "playmaking+efficiency": "Cerebro eficiente",
  "defense+rebounding": "Ancla defensiva",
  "defense+efficiency": "Pieza de rol fiable",
  "rebounding+efficiency": "Finalizador interior",
};

export function archetypeOf(radar: RadarAttributes): string {
  const ranked = [...RADAR_CATEGORIES].sort((a, b) => radar[b] - radar[a]);
  // Solo los muy completos (sin ningún atributo flojo); el resto se define por sus dos puntos fuertes
  if (RADAR_CATEGORIES.every((c) => radar[c] >= 75)) return "Jugador total";
  if (radar[ranked[0]] < 50) return "Jugador de rotación";
  const key = ranked
    .slice(0, 2)
    .sort((a, b) => RADAR_CATEGORIES.indexOf(a) - RADAR_CATEGORIES.indexOf(b))
    .join("+");
  return ARCHETYPES[key] ?? "Jugador versátil";
}

/** Edad en años cumplidos a partir de `birth_date` (YYYY-MM-DD). */
export function ageFrom(birthDate: string | null, now = new Date()): number | null {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return null;
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < birth.getUTCMonth() ||
    (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age--;
  return age;
}

export function formatDraft(player: Pick<Player, "draft_year" | "draft_number">): string {
  if (!player.draft_year) return "No elegido";
  return player.draft_number ? `${player.draft_year} · #${player.draft_number}` : `${player.draft_year} · No elegido`;
}

const POSITION_LABEL: Record<string, string> = {
  G: "Base / Escolta",
  F: "Alero",
  C: "Pívot",
  "G-F": "Escolta / Alero",
  "F-G": "Alero / Escolta",
  "F-C": "Ala-Pívot",
  "C-F": "Pívot / Ala",
};

/** Posición de nba_api ("G", "F-C"…) en español. */
export function positionLabel(position: string | null): string | null {
  return position ? (POSITION_LABEL[position] ?? position) : null;
}

/** 0.505 → "50.5" (porcentajes de tiro guardados como fracción). */
export function pct(value: number | null | undefined): string {
  return value == null ? "–" : (value * 100).toFixed(1);
}

/** Promedios por partido con un decimal. */
export function avg(value: number | null | undefined): string {
  return value == null ? "–" : value.toFixed(1);
}
