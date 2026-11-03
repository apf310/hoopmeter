// Consultas de lectura a Supabase para Server Components, cacheadas con "use cache".
import { cacheLife } from "next/cache";
import type { SearchIndex } from "@/lib/search";
import { getSupabase, type Player, type PlayerAward, type PlayerSeasonStats, type Team } from "@/lib/supabase";

export type UpcomingGame = {
  id: string;
  game_datetime_utc: string;
  home_team_id: number;
  away_team_id: number;
};

export async function getTeams(): Promise<Team[]> {
  "use cache";
  // La clasificación cambia al acabar cada partido: refresco cada minuto.
  cacheLife("minutes");

  const { data, error } = await getSupabase().from("teams").select("*");
  if (error) throw new Error(`Error cargando equipos: ${error.message}`);
  return data as Team[];
}

export async function getTeamRoster(teamId: number): Promise<Player[]> {
  "use cache";
  cacheLife("hours");

  const { data, error } = await getSupabase()
    .from("players")
    .select("*")
    .eq("team_id", teamId)
    .eq("is_active", true)
    .order("full_name");
  if (error) throw new Error(`Error cargando plantilla: ${error.message}`);
  return data as Player[];
}

/** Próximos partidos programados. Solo campos sin spoiler: emparejamiento y fecha. */
export async function getUpcomingGames(teamId: number, limit = 5): Promise<UpcomingGame[]> {
  "use cache";
  cacheLife("minutes");

  const { data, error } = await getSupabase()
    .from("games")
    .select("id, game_datetime_utc, home_team_id, away_team_id")
    .eq("status", "Scheduled")
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
    .gte("game_datetime_utc", new Date().toISOString())
    .order("game_datetime_utc")
    .limit(limit);
  if (error) throw new Error(`Error cargando calendario: ${error.message}`);
  return data as UpcomingGame[];
}

export async function getPlayer(playerId: number): Promise<Player | null> {
  "use cache";
  // El radar se recalcula a diario: con refresco horario basta.
  cacheLife("hours");

  const { data, error } = await getSupabase().from("players").select("*").eq("id", playerId).maybeSingle();
  if (error) throw new Error(`Error cargando jugador: ${error.message}`);
  return data as Player | null;
}

/** Trayectoria completa (Regular Season y Playoffs), incluidas las filas "Career". */
export async function getPlayerCareer(playerId: number): Promise<PlayerSeasonStats[]> {
  "use cache";
  cacheLife("hours");

  const { data, error } = await getSupabase()
    .from("player_season_stats")
    .select("*")
    .eq("player_id", playerId)
    .order("season_id");
  if (error) throw new Error(`Error cargando trayectoria: ${error.message}`);
  return data as PlayerSeasonStats[];
}

export async function getPlayerAwards(playerId: number): Promise<PlayerAward[]> {
  "use cache";
  cacheLife("hours");

  const { data, error } = await getSupabase()
    .from("player_awards")
    .select("*")
    .eq("player_id", playerId)
    .order("season", { ascending: false });
  if (error) throw new Error(`Error cargando palmarés: ${error.message}`);
  return data as PlayerAward[];
}

/** Índice compacto del buscador: los 30 equipos y los jugadores activos (solo campos necesarios). */
export async function getSearchIndex(): Promise<SearchIndex> {
  "use cache";
  // Las plantillas cambian con traspasos y fichajes: refresco horario.
  cacheLife("hours");

  const supabase = getSupabase();
  const [teams, players] = await Promise.all([
    supabase.from("teams").select("id, name, abbreviation, conference, primary_color, secondary_color").order("name"),
    supabase.from("players").select("id, full_name, position, team_id").eq("is_active", true).order("full_name"),
  ]);
  if (teams.error) throw new Error(`Error cargando equipos: ${teams.error.message}`);
  if (players.error) throw new Error(`Error cargando jugadores: ${players.error.message}`);
  return { teams: teams.data, players: players.data } as SearchIndex;
}
