import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { SignedKind } from "@/lib/trade-rules";

export type GameResult = "W" | "L";

/** `teams.standings_extra`, calculado con los resultados por `standings_calc.py` (Tarea 5.2b). */
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

/** Nómina no traspasable (`teams.dead_money`): cortados y sueldos de jugadores que no están en `players`. */
export type DeadMoney = {
  name: string;
  salaries: (number | null)[]; // Temporada actual y las 3 siguientes
  waived: boolean;
  /** Cortes del registro oficial (Tarea 4.4): la cifra puede no ser segura (garantías, "stretch"). */
  pending?: boolean;
  player_id?: number;
  waived_on?: string;
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
  dead_money: DeadMoney[];
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

/** `player_season_stats.advanced_stats`: `season_stats_calc.py` (temporada en curso y carrera) o `fetch_career_awards.py` (temporadas anteriores). */
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

/**
 * Estado de un contrato (Tarea 4.4): `pending` = firmado según el registro oficial, aún sin cifra
 * pública; `pending_future` = esta temporada se conoce, los años de su renovación aún no.
 */
export type ContractStatus = "confirmed" | "pending" | "pending_future";

/** Lo que publica la prensa de un contrato (fase 2 de la Tarea 4.4, `fetch_contract_news.py`). */
export type ContractSource = {
  kind?: "official" | "news";
  /** exact: cifra completa o calculada con el convenio · approx: redondeada por la prensa o mínimo prorrateado. */
  precision?: "exact" | "approx";
  reported?: {
    years: number | null;
    total: number | null;
    minimum: boolean;
    /** Mínimo de un año de un veterano que renueva: puede contar en la nómina por una de estas dos cifras. */
    minimum_options?: number[];
  };
  items?: { outlet: string; url: string; title: string; published_at: string }[];
};

/** Fila de `player_contracts`: carga inicial de `scrape_salaries.py` + movimientos de `fetch_transactions.py`. */
export type PlayerContract = {
  player_id: number;
  salary_current: number | null; // null mientras el contrato no tenga cifra pública
  salary_year_2: number | null;
  salary_year_3: number | null;
  salary_year_4: number | null;
  contract_option: "Player Option" | "Team Option" | null; // Próxima opción pendiente
  signed_on: string | null;
  signed_kind: SignedKind | null;
  acquired_on: string | null;
  /** Opcional: no existe en bases de datos sin la migración de la Tarea 4.4. */
  status?: ContractStatus;
  /** De dónde salen las cifras. NULL = carga inicial (exactas). */
  source?: ContractSource | null;
};

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
