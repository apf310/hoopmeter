// Reglas puras del sistema "Sin Spoilers" en 3 niveles.
// Sin "use client": se puede usar tanto en Server como en Client Components.

/** 1 = Todo oculto (solo partidos), 2 = Solo nota, 3 = Resultados. */
export type SpoilerLevel = 1 | 2 | 3;

/** La app SIEMPRE arranca aquí, aunque se cerrara en otro nivel: jamás un spoiler por olvido. */
export const DEFAULT_SPOILER_LEVEL: SpoilerLevel = 1;

export function isSpoilerLevel(value: unknown): value is SpoilerLevel {
  return value === 1 || value === 2 || value === 3;
}

/** Fila de la tabla `games` en Supabase. */
export type Game = {
  id: string;
  game_datetime_utc: string;
  home_team_id: number;
  away_team_id: number;
  home_score: number | null;
  away_score: number | null;
  status: "Scheduled" | "Live" | "Final";
  live_period_text: string | null;
  excitement_score: number | null;
  // Columnas sin uso por ahora: textos IA aparcados (ver backend-data/processors/ai_chronicler.py)
  ai_teaser_level2: string | null;
  ai_summary_full: string | null;
  quarters_score: Record<string, unknown> | null;
  is_processed: boolean;
};

/**
 * Nivel 1: SOLO emparejamiento y fecha. Ni nota, ni marcador, ni estado,
 * ni `live_period_text` (podría delatar una prórroga).
 */
export type GameLevel1 = {
  level: 1;
  id: string;
  game_datetime_utc: string;
  home_team_id: number;
  away_team_id: number;
};

/** Nivel 2: lo del Nivel 1 + la nota. Nada más. */
export type GameLevel2 = Omit<GameLevel1, "level"> & {
  level: 2;
  excitement_score: number | null;
};

export type GameLevel3 = Game & { level: 3 };

export type RedactedGame = GameLevel1 | GameLevel2 | GameLevel3;

/**
 * Devuelve solo los campos permitidos para cada nivel (lista blanca explícita,
 * nunca spread del objeto original) para que ningún dato extra se cuele en la UI.
 */
export function redactGame(game: Game, level: 1): GameLevel1;
export function redactGame(game: Game, level: 2): GameLevel2;
export function redactGame(game: Game, level: 3): GameLevel3;
export function redactGame(game: Game, level: SpoilerLevel): RedactedGame;
export function redactGame(game: Game, level: SpoilerLevel): RedactedGame {
  const base = {
    id: game.id,
    game_datetime_utc: game.game_datetime_utc,
    home_team_id: game.home_team_id,
    away_team_id: game.away_team_id,
  };

  if (level === 1) return { level: 1, ...base };
  if (level === 2) return { level: 2, ...base, excitement_score: game.excitement_score };
  return { ...game, level: 3 };
}

export type ExcitementTone = "high" | "mid" | "low" | "pending";

export function getExcitementTone(score: number | null): ExcitementTone {
  if (score === null || Number.isNaN(score)) return "pending";
  if (score >= 8.5) return "high";
  if (score >= 6) return "mid";
  return "low";
}

/** Clases de color por tono. Solo color: sin etiquetas de texto (regla Nivel 2: solo la nota). */
export const EXCITEMENT_TONE_CLASSES: Record<ExcitementTone, string> = {
  high: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/40",
  mid: "bg-amber-500/15 text-amber-400 ring-amber-500/40",
  low: "bg-red-500/15 text-red-400 ring-red-500/40",
  pending: "bg-slate-800 text-slate-500 ring-slate-700",
};

/** Formatea la nota a `X.X`, acotada a 1.0 – 10.0. */
export function formatExcitementScore(score: number | null): string {
  if (score === null || Number.isNaN(score)) return "–";
  return Math.min(10, Math.max(1, score)).toFixed(1);
}
