// Consultas de lectura a Supabase para Server Components, cacheadas con "use cache".
import { cacheLife } from "next/cache";
import { gameDayOf, gameDayUtcRange, type GameMatchup } from "@/lib/game-day";
import type { GmData, GmPlayer, GmTeam } from "@/lib/gm";
import { ageFrom, getRadar, overallRating } from "@/lib/player-profile";
import type { SearchIndex } from "@/lib/search";
import type { Game } from "@/lib/spoilers";
import { getSupabase, type DeadMoney, type Player, type PlayerAward, type PlayerContract, type PlayerSeasonStats, type RadarAttributes, type Team } from "@/lib/supabase";
import { teamAccent } from "@/lib/team-colors";

export type UpcomingGame = GameMatchup;

const MATCHUP_COLUMNS = "id, game_datetime_utc, home_team_id, away_team_id";
// Supabase devuelve como mucho 1.000 filas por consulta
const PAGE_SIZE = 1000;

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
    .select(MATCHUP_COLUMNS)
    .eq("status", "Scheduled")
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
    .gte("game_datetime_utc", new Date().toISOString())
    .order("game_datetime_utc")
    .limit(limit);
  if (error) throw new Error(`Error cargando calendario: ${error.message}`);
  return data as UpcomingGame[];
}

/** Calendario completo de la temporada sin spoilers: solo emparejamiento y fecha (base del Nivel 1). */
export async function getSchedule(): Promise<GameMatchup[]> {
  "use cache";
  // Las fechas apenas cambian (aplazamientos, cruces de la Copa NBA): refresco horario.
  cacheLife("hours");

  const supabase = getSupabase();
  const games: GameMatchup[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("games")
      .select(MATCHUP_COLUMNS)
      .order("game_datetime_utc")
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Error cargando calendario: ${error.message}`);
    games.push(...(data as GameMatchup[]));
    if (data.length < PAGE_SIZE) return games;
  }
}

/** Un partido sin spoilers: solo emparejamiento y fecha (lo único que viaja en el HTML de `/games/[id]`). */
export async function getGameMatchup(gameId: string): Promise<GameMatchup | null> {
  "use cache";
  cacheLife("hours");

  const { data, error } = await getSupabase().from("games").select(MATCHUP_COLUMNS).eq("id", gameId).maybeSingle();
  if (error) throw new Error(`Error cargando partido: ${error.message}`);
  return data as GameMatchup | null;
}

/** Promedios de temporada de un jugador para la previa de un partido. */
export type KeyPlayer = Pick<Player, "id" | "full_name" | "position" | "team_id"> &
  Pick<PlayerSeasonStats, "season_id" | "games_played" | "pts" | "reb" | "ast">;

/**
 * Máximos anotadores de cada equipo en la temporada (o en la anterior si aún no hay datos).
 * Son promedios, no datos de ningún partido concreto: valen para la previa sin spoilers.
 */
export async function getKeyPlayers(teamIds: number[], season: string, previous: string, perTeam = 3): Promise<KeyPlayer[]> {
  "use cache";
  cacheLife("hours");

  const rosters = await Promise.all(teamIds.map((teamId) => getTeamRoster(teamId)));
  const players = new Map(rosters.flat().map((p) => [p.id, p]));
  if (players.size === 0) return [];

  const { data, error } = await getSupabase()
    .from("player_season_stats")
    .select("player_id, season_id, games_played, pts, reb, ast")
    .in("player_id", [...players.keys()])
    .eq("season_type", "Regular Season")
    .in("season_id", [season, previous]);
  if (error) throw new Error(`Error cargando promedios: ${error.message}`);

  const rows = data as Pick<PlayerSeasonStats, "player_id" | "season_id" | "games_played" | "pts" | "reb" | "ast">[];
  return teamIds.flatMap((teamId) => {
    const own = rows.filter((r) => players.get(r.player_id)?.team_id === teamId && (r.games_played ?? 0) > 0);
    // Una sola temporada por equipo: la actual si ya tiene suficientes jugadores con partidos
    const current = own.filter((r) => r.season_id === season);
    const chosen = current.length >= perTeam ? current : own.filter((r) => r.season_id === previous);
    return chosen
      .sort((a, b) => (b.pts ?? 0) - (a.pts ?? 0))
      .slice(0, perTeam)
      .map((r) => {
        const player = players.get(r.player_id)!;
        return {
          id: player.id,
          full_name: player.full_name,
          position: player.position,
          team_id: teamId,
          season_id: r.season_id,
          games_played: r.games_played,
          pts: r.pts,
          reb: r.reb,
          ast: r.ast,
        };
      });
  });
}

/** Partidos completos de una jornada (con marcadores): pasar SIEMPRE por `redactGame` antes de servirlos. */
export async function getGamesByDay(day: string): Promise<Game[]> {
  "use cache";
  // Notas y resultados cambian al acabar cada partido: mismo margen que el directo.
  cacheLife({ stale: 30, revalidate: 30, expire: 300 });

  const { from, to } = gameDayUtcRange(day);
  const { data, error } = await getSupabase()
    .from("games")
    .select("*")
    .gte("game_datetime_utc", from)
    .lt("game_datetime_utc", to)
    .order("game_datetime_utc");
  if (error) throw new Error(`Error cargando jornada: ${error.message}`);
  return (data as Game[]).filter((game) => gameDayOf(game.game_datetime_utc) === day);
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

/**
 * Todo lo que necesita el GM Virtual: equipos con su nómina y jugadores con contrato. Viaja entero
 * en el HTML para que el veredicto del traspaso se calcule al instante en el cliente.
 */
export async function getGmData(): Promise<GmData> {
  "use cache";
  // El registro oficial de movimientos se aplica varias veces al día (en julio, cada pocos minutos)
  cacheLife("minutes");

  const [teams, contracts, sync] = await Promise.all([
    getTeams(),
    getSupabase()
      .from("player_contracts")
      .select("*, player:players!inner(id, full_name, position, team_id, birth_date, radar_attributes)"),
    getSupabase().from("sync_status").select("last_success_at").eq("id", "contracts").maybeSingle(),
  ]);
  if (contracts.error) throw new Error(`Error cargando contratos: ${contracts.error.message}`);

  type ContractRow = PlayerContract & { player: Pick<Player, "id" | "full_name" | "position" | "team_id" | "birth_date" | "radar_attributes"> };
  const rows = (contracts.data as ContractRow[]).filter((row) => row.player.team_id !== null);

  const players: GmPlayer[] = rows
    .map((row) => {
      const radar = getRadar(row.player);
      const pending = row.status === "pending" || row.salary_current === null;
      const reported = row.source?.reported;
      const firstItem = row.source?.items?.[0];
      return {
        id: row.player.id,
        name: row.player.full_name,
        teamId: row.player.team_id!,
        // Sin cifra pública no suma en la nómina; en un traspaso, el usuario pone su estimación
        salary: pending ? 0 : row.salary_current!,
        salaryStatus: pending ? ("pending" as const) : row.source?.precision === "approx" ? ("approx" as const) : ("confirmed" as const),
        reported: reported
          ? {
              years: reported.years,
              total: reported.total,
              minimum: reported.minimum,
              minimumOptions: reported.minimum_options ?? null,
              outlet: firstItem?.outlet ?? null,
              url: firstItem?.url ?? null,
            }
          : null,
        signedOn: row.signed_on,
        signedKind: row.signed_kind,
        acquiredOn: row.acquired_on,
        position: row.player.position,
        age: ageFrom(row.player.birth_date),
        overall: radar && overallRating(radar),
        contract: [row.salary_current, row.salary_year_2, row.salary_year_3, row.salary_year_4],
        option: row.contract_option,
        futurePending: row.status === "pending_future",
      };
    })
    .sort((a, b) => b.salary - a.salary);

  const gmTeams: GmTeam[] = teams
    .map((team) => {
      const contractsOfTeam = players.filter((player) => player.teamId === team.id);
      const current = (entries: DeadMoney[]) => entries.reduce((total, entry) => total + (entry.salaries[0] ?? 0), 0);
      return {
        id: team.id,
        name: team.name,
        abbreviation: team.abbreviation,
        payroll: contractsOfTeam.reduce((total, player) => total + player.salary, current(team.dead_money)),
        rosterSize: contractsOfTeam.length,
        pendingContracts: contractsOfTeam.filter((player) => player.salaryStatus === "pending").length,
        pendingDeadMoney: team.dead_money.filter((entry) => entry.pending).length,
        conference: team.conference,
        wins: team.wins,
        losses: team.losses,
        primary: team.primary_color ?? "#334155",
        accent: teamAccent(team),
        deadMoney: current(team.dead_money.filter((entry) => entry.waived)),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  return {
    teams: gmTeams,
    players,
    today: new Date().toISOString().slice(0, 10),
    // Sin la migración de la Tarea 4.4 la tabla no existe: el GM sigue funcionando sin esta fecha
    contractsUpdatedAt: sync.error ? null : (sync.data?.last_success_at ?? null),
  };
}

/** Perfil de juego de un jugador: lo que necesita la IA para valorar su encaje en un equipo. */
export type ScoutingReport = Pick<PlayerSeasonStats, "season_id" | "games_played" | "pts" | "reb" | "ast" | "fg3_pct"> & {
  height: string | null;
  radar: RadarAttributes | null;
  minutes: number | null;
  tsPct: number | null;
};

// Con menos partidos, los promedios de la temporada aún no son representativos
const MIN_GAMES_FOR_SEASON = 10;

/** Atributos y promedios de unos jugadores: de la temporada actual si ya hay partidos suficientes. */
export async function getScoutingReports(playerIds: number[], season: string, previous: string): Promise<Map<number, ScoutingReport>> {
  const supabase = getSupabase();
  const [players, stats] = await Promise.all([
    supabase.from("players").select("id, height, radar_attributes").in("id", playerIds),
    supabase
      .from("player_season_stats")
      .select("player_id, season_id, games_played, pts, reb, ast, fg3_pct, advanced_stats")
      .in("player_id", playerIds)
      .eq("season_type", "Regular Season")
      .in("season_id", [season, previous]),
  ]);
  if (players.error) throw new Error(`Error cargando jugadores: ${players.error.message}`);
  if (stats.error) throw new Error(`Error cargando promedios: ${stats.error.message}`);

  const rows = stats.data as Omit<PlayerSeasonStats, "id" | "team_id" | "season_type">[];
  return new Map(
    (players.data as Pick<Player, "id" | "height" | "radar_attributes">[]).map((player) => {
      const own = rows.filter((row) => row.player_id === player.id);
      const current = own.find((row) => row.season_id === season);
      const chosen = (current?.games_played ?? 0) >= MIN_GAMES_FOR_SEASON ? current : (own.find((row) => row.season_id === previous) ?? current);
      return [
        player.id,
        {
          season_id: chosen?.season_id ?? season,
          games_played: chosen?.games_played ?? null,
          pts: chosen?.pts ?? null,
          reb: chosen?.reb ?? null,
          ast: chosen?.ast ?? null,
          fg3_pct: chosen?.fg3_pct ?? null,
          height: player.height,
          radar: getRadar(player),
          minutes: chosen?.advanced_stats.min ?? null,
          tsPct: chosen?.advanced_stats.ts_pct ?? null,
        },
      ];
    })
  );
}

/** Índice compacto del buscador: los 30 equipos y todos los jugadores, leyendas incluidas (solo campos necesarios). */
/** Jugador destacado del directorio: los mejores de la temporada según la media de su radar. */
export type StarPlayer = { id: number; name: string; position: string | null; teamId: number; overall: number };

/** Todo lo que necesita /players: buscador completo, los mejores de la temporada y las leyendas. */
export async function getPlayersDirectory(): Promise<{ index: SearchIndex; stars: StarPlayer[]; legends: { id: number; name: string }[] }> {
  "use cache";
  cacheLife("hours");

  const [index, radars] = await Promise.all([
    getSearchIndex(),
    getSupabase().from("players").select("id, full_name, position, team_id, radar_attributes").eq("is_active", true).not("team_id", "is", null),
  ]);
  if (radars.error) throw new Error(`Error cargando jugadores: ${radars.error.message}`);

  const stars = (radars.data as Pick<Player, "id" | "full_name" | "position" | "team_id" | "radar_attributes">[])
    .map((p) => ({ p, radar: getRadar(p) }))
    .filter(({ radar }) => radar !== null)
    .map(({ p, radar }) => ({ id: p.id, name: p.full_name, position: p.position, teamId: p.team_id!, overall: overallRating(radar!) }))
    .sort((a, b) => b.overall - a.overall || a.name.localeCompare(b.name, "es"))
    .slice(0, 12);
  const legends = index.players.filter((p) => !p.is_active).map((p) => ({ id: p.id, name: p.full_name }));
  return { index, stars, legends };
}

export async function getSearchIndex(): Promise<SearchIndex> {
  "use cache";
  // Las plantillas cambian con traspasos y fichajes: refresco horario.
  cacheLife("hours");

  const supabase = getSupabase();
  const [teams, players] = await Promise.all([
    supabase.from("teams").select("id, name, abbreviation, conference, primary_color, secondary_color").order("name"),
    supabase.from("players").select("id, full_name, position, team_id, is_active").order("full_name"),
  ]);
  if (teams.error) throw new Error(`Error cargando equipos: ${teams.error.message}`);
  if (players.error) throw new Error(`Error cargando jugadores: ${players.error.message}`);
  return { teams: teams.data, players: players.data } as SearchIndex;
}
