import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type GameResult = "W" | "L";

/** `teams.standings_extra`, rellenado por `fetch_teams_players.py`. */
export type StandingsExtra = {
  streak?: string | null; // "W3" / "L1"
  l10?: string | null; // "3-4" (con menos de 10 partidos, los que haya)
  home?: string | null;
  road?: string | null;
  ppg?: number | null;
  opp_ppg?: number | null;
  diff_ppg?: number | null;
  form?: GameResult[]; // Últimos ≤10 resultados, del más antiguo al más reciente
};

/** Fila de la tabla `teams` en Supabase. */
export type Team = {
  id: number;
  name: string;
  abbreviation: string;
  conference: "East" | "West" | null;
  division: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  wins: number;
  losses: number;
  conf_rank: number | null;
  standings_extra: StandingsExtra;
};

/** Fila de la tabla `players` en Supabase. */
export type Player = {
  id: number;
  team_id: number | null;
  full_name: string;
  position: string | null;
  height: string | null;
  weight: string | null;
  country: string | null;
  birth_date: string | null;
  draft_year: number | null;
  draft_number: number | null;
  is_active: boolean;
  radar_attributes: RadarAttributes | Record<string, never>;
};

export const RADAR_CATEGORIES = ["scoring", "shooting", "playmaking", "defense", "rebounding", "efficiency"] as const;
export type RadarCategory = (typeof RADAR_CATEGORIES)[number];

/** `players.radar_attributes`, rellenado por `player_radar_calc.py` (percentiles 0-99). */
export type RadarAttributes = Record<RadarCategory, number> & {
  season: string;
  qualified: boolean;
  games_played: number;
  updated_at: string;
};

export type SeasonType = "Regular Season" | "Playoffs";

/** Récord personal de `advanced_stats.career_highs` (clave = STAT de nba_api: PTS, REB, AST, FG3M…). */
export type CareerHigh = { value: number | null; date: string | null; vs: string | null; game_id: string | null };

/** `player_season_stats.advanced_stats`, rellenado por `fetch_career_awards.py`. */
export type SeasonAdvancedStats = {
  gs?: number | null;
  min?: number | null;
  stl?: number | null;
  blk?: number | null;
  tov?: number | null;
  fg3m?: number | null;
  fg3a?: number | null;
  ft_pct?: number | null;
  ts_pct?: number | null;
  age?: number | null;
  team_abbreviation?: string | null; // "TOT" en temporadas con traspaso
  // Desglose por equipo solo en temporadas con traspaso
  teams?: { team_id: number | null; team_abbreviation: string | null; gp: number | null; pts: number | null; reb: number | null; ast: number | null }[];
  career_highs?: Record<string, CareerHigh>; // Solo en la fila "Career" de Regular Season
};

/** Fila de `player_season_stats` (promedios por partido). `season_id` = "2024-25" o "Career". */
export type PlayerSeasonStats = {
  id: string;
  player_id: number;
  season_id: string;
  team_id: number | null;
  season_type: SeasonType;
  games_played: number | null;
  pts: number | null;
  reb: number | null;
  ast: number | null;
  fg_pct: number | null;
  fg3_pct: number | null;
  advanced_stats: SeasonAdvancedStats;
};

/** Fila de `player_awards` (nombre del premio tal cual lo da nba_api, en inglés). */
export type PlayerAward = { id: number; player_id: number; award_name: string; season: string | null };

let client: SupabaseClient | null = null;

/**
 * Cliente de solo lectura (anon key + RLS "public read"). Se crea bajo demanda
 * para que la falta de variables de entorno dé un error claro y no rompa el import.
 */
export function getSupabase(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL y/o NEXT_PUBLIC_SUPABASE_ANON_KEY en web-app/.env.local"
    );
  }

  client = createClient(url, anonKey, { auth: { persistSession: false } });
  return client;
}
