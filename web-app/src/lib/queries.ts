// Consultas de lectura a Supabase para Server Components, cacheadas con "use cache".
//
// Ojo (Tarea 7.7): en Vercel `"use cache"` solo evita repetir una consulta dentro de la misma visita y al prerenderizar;
// entre visitas no se conserva. Lo pesado que cambia una vez al día va con `"use cache: remote"` (compartida, con cupo en
// el plan Hobby: pocas y pequeñas). Y todo tiene que ir rápido también sin caché: páginas en paralelo y solo las columnas
// que hacen falta.
import { cacheLife } from "next/cache";
import { dailyLife, PENDING_LOOKBACK_HOURS, type PendingGame } from "@/lib/cache-window";
import { gameDayOf, gameDayUtcRange, previousSeason, seasonOf, type GameMatchup } from "@/lib/game-day";
import type { GmData, GmPlayer, GmTeam } from "@/lib/gm";
import { ageFrom, getRadar, overallRating } from "@/lib/player-profile";
import { highsBeforeDay, withoutHighs, type Highs, type PlayerHighs, type StoredHighs } from "@/lib/player-highs";
import { huellaFromHonours } from "@/lib/card-huella";
import { LEGEND_AWARDS, LEGEND_TEAM_AWARDS, legendLine, legendWeight, type LegendCounts } from "@/lib/player-card";
import type { ExplorerRow, ExplorerSeason, ExplorerTotals } from "@/lib/player-explorer";
import type { SearchIndex, SearchTeam } from "@/lib/search";
import type { Game } from "@/lib/spoilers";
import { lastStartedDay, pickStandingsBefore, type StandingsBefore } from "@/lib/standings";
import { getSupabase, type DeadMoney, type Player, type PlayerAward, type PlayerContract, type PlayerSeasonStats, type RadarAttributes, type Team } from "@/lib/supabase";
import { teamAccent, teamBackdrop } from "@/lib/team-colors";
import type { RosterRow } from "@/lib/team-roster";
import { SPAIN, type SpanishPlayer } from "@/lib/spanish-players";
import type { ScoredGame } from "@/lib/what-to-watch";

export type UpcomingGame = GameMatchup;

const MATCHUP_COLUMNS = "id, game_datetime_utc, home_team_id, away_team_id";
// Supabase devuelve como mucho 1.000 filas por consulta
const PAGE_SIZE = 1000;

type Page = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;

/**
 * Lee todas las páginas de una consulta con un orden fijo. Las `expected` primeras se piden a la vez (Tarea 7.7: una
 * detrás de otra, cada página sumaba una ida y vuelta a la base de datos); si la última llega llena, sigue.
 */
export async function selectPages<T>(label: string, page: (from: number, to: number) => Page, expected = 1): Promise<T[]> {
  const out: T[] = [];
  for (let first = 0, count = expected; ; first += count, count = 1) {
    const pages = await Promise.all(Array.from({ length: count }, (_, i) => page((first + i) * PAGE_SIZE, (first + i + 1) * PAGE_SIZE - 1)));
    for (const { data, error } of pages) {
      if (error) throw new Error(`Error cargando ${label}: ${error.message}`);
      out.push(...((data ?? []) as T[]));
    }
    if ((pages.at(-1)!.data ?? []).length < PAGE_SIZE) return out;
  }
}

export async function getTeams(): Promise<Team[]> {
  "use cache";
  // La clasificación cambia al acabar cada partido: refresco cada minuto.
  cacheLife("minutes");

  const { data, error } = await getSupabase().from("teams").select("*");
  if (error) throw new Error(`Error cargando equipos: ${error.message}`);
  return data as Team[];
}

/**
 * Clasificación sin spoilers (Niveles 1 y 2, Tarea 6.6): la de antes de la última jornada empezada. Es la
 * única que viaja en el HTML de `/standings` y `/teams/[id]`; la de al día, solo por `/api/standings`.
 * Si la caché se queda atrás, enseña una más antigua: nunca una más nueva.
 */
export async function getStandingsBefore(): Promise<StandingsBefore> {
  "use cache";
  cacheLife("minutes");

  const [teams, day] = await Promise.all([getTeams(), getLastStartedDay()]);
  return pickStandingsBefore(teams, day);
}

/** Última jornada con algún partido ya empezado: basta una fila del calendario. */
async function getLastStartedDay(): Promise<string | null> {
  const now = Date.now();
  const { data, error } = await getSupabase()
    .from("games")
    .select("game_datetime_utc")
    .lte("game_datetime_utc", new Date(now).toISOString())
    .order("game_datetime_utc", { ascending: false })
    .limit(1);
  if (error) throw new Error(`Error cargando calendario: ${error.message}`);
  return lastStartedDay(data as { game_datetime_utc: string }[], now, gameDayOf);
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

/**
 * Últimos partidos ya empezados de un equipo, del más reciente al más antiguo. Solo emparejamiento y fecha:
 * es lo que viaja en el HTML de `/teams/[id]` (Nivel 1). Nota y resultado, por `/api/teams/[id]/games`.
 */
export async function getRecentMatchups(teamId: number, limit = 5): Promise<GameMatchup[]> {
  "use cache";
  cacheLife("minutes");

  const { data, error } = await getSupabase()
    .from("games")
    .select(MATCHUP_COLUMNS)
    .neq("status", "Scheduled")
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
    .lte("game_datetime_utc", new Date().toISOString())
    .order("game_datetime_utc", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Error cargando últimos partidos: ${error.message}`);
  return data as GameMatchup[];
}

/** Los mismos partidos completos (con marcadores): pasar SIEMPRE por `redactGame` antes de servirlos. */
export async function getRecentGames(teamId: number, limit = 5): Promise<Game[]> {
  "use cache";
  cacheLife({ stale: 30, revalidate: 30, expire: 300 });

  const { data, error } = await getSupabase()
    .from("games")
    .select("*")
    .neq("status", "Scheduled")
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
    .lte("game_datetime_utc", new Date().toISOString())
    .order("game_datetime_utc", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Error cargando últimos partidos: ${error.message}`);
  return data as Game[];
}

/**
 * Plantilla con promedios de la temporada y salario (Tarea 6.7). Promedios de la temporada en curso; si aún
 * no ha jugado nadie (verano, pretemporada), los de la anterior. Cambian una vez al día: sin spoilers.
 */
export async function getTeamRosterStats(teamId: number): Promise<{ season: string; rows: RosterRow[] }> {
  "use cache";
  cacheLife("hours");

  const roster = await getTeamRoster(teamId);
  const ids = roster.map((p) => p.id);
  const current = seasonOf(new Date().toISOString());
  const previous = previousSeason(current);
  if (ids.length === 0) return { season: current, rows: [] };

  const supabase = getSupabase();
  const [stats, contracts] = await Promise.all([
    supabase
      .from("player_season_stats")
      .select("player_id, season_id, team_id, games_played, pts, reb, ast, fg3_pct, advanced_stats")
      .in("player_id", ids)
      .eq("season_type", "Regular Season")
      .in("season_id", [current, previous]),
    supabase.from("player_contracts").select("player_id, salary_current, status, source").in("player_id", ids),
  ]);
  if (stats.error) throw new Error(`Error cargando promedios: ${stats.error.message}`);
  if (contracts.error) throw new Error(`Error cargando contratos: ${contracts.error.message}`);

  type StatRow = Pick<PlayerSeasonStats, "player_id" | "season_id" | "team_id" | "games_played" | "pts" | "reb" | "ast" | "fg3_pct" | "advanced_stats">;
  const statRows = stats.data as StatRow[];
  const season = statRows.some((r) => r.season_id === current && (r.games_played ?? 0) > 0) ? current : previous;
  const bySeason = new Map(statRows.filter((r) => r.season_id === season).map((r) => [r.player_id, r]));
  const byContract = new Map(
    (contracts.data as Pick<PlayerContract, "player_id" | "salary_current" | "status" | "source">[]).map((c) => [c.player_id, c])
  );

  const rows = roster.map((player): RosterRow => {
    const s = bySeason.get(player.id);
    const c = byContract.get(player.id);
    const pending = c !== undefined && (c.status === "pending" || c.salary_current === null);
    return {
      id: player.id,
      name: player.full_name,
      position: player.position,
      gp: s?.games_played ?? null,
      min: s?.advanced_stats?.min ?? null,
      pts: s?.pts ?? null,
      reb: s?.reb ?? null,
      ast: s?.ast ?? null,
      fg3Pct: s?.fg3_pct ?? null,
      salary: c && !pending ? c.salary_current : null,
      salaryStatus: !c ? null : pending ? "pending" : c.source?.precision === "approx" ? "approx" : "confirmed",
    };
  });
  return { season, rows };
}

/** Calendario completo de la temporada sin spoilers: solo emparejamiento y fecha (base del Nivel 1). */
export async function getSchedule(): Promise<GameMatchup[]> {
  "use cache";
  // Las fechas apenas cambian (aplazamientos, cruces de la Copa NBA): refresco horario.
  cacheLife("hours");

  const supabase = getSupabase();
  return selectPages<GameMatchup>(
    "calendario",
    (from, to) => supabase.from("games").select(MATCHUP_COLUMNS).order("game_datetime_utc").order("id").range(from, to),
    2
  );
}

/**
 * Partidos terminados con nota de la temporada en curso para "Qué ver" (Tarea 6.11). Solo se leen
 * emparejamiento, fecha y nota: los marcadores ni siquiera salen de la base de datos.
 */
export async function getScoredGames(): Promise<ScoredGame[]> {
  "use cache";
  // Cada nota llega en cuanto acaba su partido
  cacheLife({ stale: 60, revalidate: 60, expire: 600 });

  const season = seasonOf(new Date().toISOString());
  const supabase = getSupabase();
  return selectPages<ScoredGame>("notas", (from, to) =>
    supabase
      .from("games")
      .select(`${MATCHUP_COLUMNS}, excitement_score`)
      .eq("status", "Final")
      .not("excitement_score", "is", null)
      .gte("game_datetime_utc", `${season.slice(0, 4)}-08-01T00:00:00Z`)
      .order("game_datetime_utc")
      .order("id")
      .range(from, to)
  );
}

/** Partidos sin nota de las últimas horas y los próximos: hasta cuándo valen las notas guardadas (`scoresWindow`). */
export async function getPendingGames(): Promise<PendingGame[]> {
  const { data, error } = await getSupabase()
    .from("games")
    .select("game_datetime_utc")
    .is("excitement_score", null)
    .gte("game_datetime_utc", new Date(Date.now() - PENDING_LOOKBACK_HOURS * 3_600_000).toISOString())
    .order("game_datetime_utc")
    .limit(40);
  if (error) throw new Error(`Error cargando calendario: ${error.message}`);
  return (data as { game_datetime_utc: string }[]).map((game) => ({ ...game, scored: false }));
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

/**
 * Trayectoria completa (Regular Season y Playoffs), incluidas las filas "Career". Sin los récords: viaja entera en el
 * HTML de la ficha y llevan la fecha del partido (Tarea 7.6; van por `getPlayerHighsBefore`).
 */
export async function getPlayerCareer(playerId: number): Promise<PlayerSeasonStats[]> {
  "use cache";
  cacheLife("hours");

  const { data, error } = await getSupabase()
    .from("player_season_stats")
    .select("*")
    .eq("player_id", playerId)
    .order("season_id");
  if (error) throw new Error(`Error cargando trayectoria: ${error.message}`);
  return (data as PlayerSeasonStats[]).map((row) => ({ ...row, advanced_stats: withoutHighs(row.advanced_stats) }));
}

/**
 * Récords personales y máximos de la temporada al día (Tarea 7.6). Con los de la última jornada: solo para
 * `/api/players/[id]/highs` (Nivel 3). La ficha usa `getPlayerHighsBefore`.
 */
export async function getPlayerHighs(playerId: number): Promise<StoredHighs> {
  "use cache";
  // Cambian una vez al día (job diario)
  cacheLife("hours");

  const { data, error } = await getSupabase()
    .from("player_season_stats")
    .select(
      "season_id, career:advanced_stats->career_highs, careerBefore:advanced_stats->career_highs_before, season:advanced_stats->season_highs, seasonBefore:advanced_stats->season_highs_before"
    )
    .eq("player_id", playerId)
    .eq("season_type", "Regular Season")
    .order("season_id");
  if (error) throw new Error(`Error cargando récords: ${error.message}`);

  type Row = { season_id: string; career: Highs | null; careerBefore: Highs | null; season: Highs | null; seasonBefore: Highs | null };
  const rows = data as unknown as Row[];
  const career = rows.find((row) => row.season_id === "Career");
  // Los máximos son de su última temporada, y solo si es de las calculadas con los boxscores
  const latest = rows.filter((row) => row.season_id !== "Career").at(-1);
  return {
    career: career?.career ?? null,
    careerBefore: career?.careerBefore ?? null,
    season: latest?.season ? { id: latest.season_id, highs: latest.season, before: latest.seasonBefore } : null,
  };
}

/**
 * Los mismos récords sin los de la última jornada empezada: lo único que viaja en el HTML de `/players/[id]`
 * (Niveles 1 y 2). `day` = esa jornada, para avisarlo.
 */
export async function getPlayerHighsBefore(playerId: number): Promise<{ day: string | null; highs: PlayerHighs }> {
  "use cache";
  cacheLife("minutes");

  const [stored, day] = await Promise.all([getPlayerHighs(playerId), getLastStartedDay()]);
  return { day, highs: highsBeforeDay(stored, day) };
}

/** Contrato del jugador (Tarea 6.8); null si no tiene contrato registrado. Se actualiza varias veces al día. */
export async function getPlayerContract(playerId: number): Promise<PlayerContract | null> {
  "use cache";
  cacheLife("minutes");

  const { data, error } = await getSupabase().from("player_contracts").select("*").eq("player_id", playerId).maybeSingle();
  if (error) throw new Error(`Error cargando contrato: ${error.message}`);
  return data as PlayerContract | null;
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
        primary: teamBackdrop(team.primary_color),
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

/**
 * Lo que necesita /players además del explorador: equipos, leyendas y cuántos hay en activo. El buscador completo se
 * descarga aparte (`/api/search-index`, el mismo de Ctrl+K): en el HTML iban 72 KB que casi nadie usa (Tarea 7.7).
 */
export async function getPlayersDirectory(): Promise<{ teams: SearchTeam[]; active: number; legends: LegendCard[] }> {
  "use cache: remote";
  cacheLife(dailyLife(Date.now()));

  const [index, counts] = await Promise.all([getSearchIndex(), getLegendCounts()]);
  const legends = index.players
    .filter((p) => !p.is_active)
    .sort((a, b) => legendWeight(counts.get(b.id) ?? {}) - legendWeight(counts.get(a.id) ?? {}))
    .map((p) => {
      const own = counts.get(p.id) ?? {};
      return { id: p.id, name: p.full_name, line: legendLine(own), huella: huellaFromHonours(own) };
    });
  return { teams: index.teams, active: index.players.filter((p) => p.is_active && p.team_id !== null).length, legends };
}

/** Ficha dorada de una leyenda en `/players` (Tarea 7.4): sus mayores logros en lugar de la media y su huella (7.11). */
export type LegendCard = { id: number; name: string; line: string; huella: number[] };

/** Anillos, MVP, MVP de las Finales, All-Star y quintetos All-NBA y Defensivos de cada retirado. */
async function getLegendCounts(): Promise<Map<number, LegendCounts>> {
  const keyOf = new Map(Object.entries(LEGEND_AWARDS).map(([key, award]) => [award as string, key as keyof LegendCounts]));
  const teamKey = (name: string) =>
    (Object.entries(LEGEND_TEAM_AWARDS) as [keyof LegendCounts, string][]).find(([, prefix]) => name.startsWith(`${prefix} `))?.[0];
  const names = Object.values(LEGEND_AWARDS).map((n) => `"${n}"`).join(",");
  const teams = Object.values(LEGEND_TEAM_AWARDS).map((prefix) => `award_name.like."${prefix} *"`).join(",");
  const awards = await selectPages<{ player_id: number; award_name: string }>(
    "el palmarés de las leyendas",
    (from, to) =>
      getSupabase()
        .from("player_awards")
        .select("id, player_id, award_name, players!inner(is_active)")
        .eq("players.is_active", false)
        .or(`award_name.in.(${names}),${teams}`)
        .order("id")
        .range(from, to),
    3
  );
  const counts = new Map<number, LegendCounts>();
  for (const { player_id, award_name } of awards) {
    const key = keyOf.get(award_name) ?? teamKey(award_name);
    if (!key) continue;
    const own = counts.get(player_id) ?? {};
    own[key] = (own[key] ?? 0) + 1;
    counts.set(player_id, own);
  }
  return counts;
}

/**
 * Temporada del último MVP entregado ("2025-26"): el sello de MVP de un jugador en activo es solo el del vigente
 * (Tarea 7.11). Los premios se cargan a mano desde un PC (febrero, mayo y junio).
 */
export async function getLatestMvpSeason(): Promise<string | null> {
  "use cache";
  cacheLife("hours");

  const { data, error } = await getSupabase()
    .from("player_awards")
    .select("season")
    .eq("award_name", LEGEND_AWARDS.mvp)
    .not("season", "is", null)
    .order("season", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Error cargando el último MVP: ${error.message}`);
  return (data as { season: string } | null)?.season ?? null;
}

/** Temporadas anteriores que ofrece el explorador (Tarea 6.22), además de la en curso. */
const EXPLORER_PAST_SEASONS = 2;

/**
 * Temporadas del explorador de jugadores, de la más reciente a la más antigua. La primera es la en curso;
 * en verano, antes del primer partido, la que acaba de terminar.
 */
export async function getExplorerSeasons(): Promise<string[]> {
  "use cache";
  cacheLife("hours");

  let current = seasonOf(new Date().toISOString());
  const { count, error } = await getSupabase()
    .from("player_season_stats")
    .select("id", { count: "exact", head: true })
    .eq("season_id", current)
    .eq("season_type", "Regular Season");
  if (error) throw new Error(`Error cargando temporadas: ${error.message}`);
  if (!count) current = previousSeason(current);
  const seasons = [current];
  while (seasons.length <= EXPLORER_PAST_SEASONS) seasons.push(previousSeason(seasons.at(-1)!));
  return seasons;
}

const EXPLORER_TOTALS = ["gs", "min", "pts", "reb", "oreb", "dreb", "ast", "stl", "blk", "tov", "pf", "fgm", "fga", "fg3m", "fg3a", "ftm", "fta"] as const;
/** Páginas de temporadas anteriores que se piden a la vez (hoy caben todas). */
const EARLIER_PAGES = 5;
const numberOrNull = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

/**
 * Una temporada del explorador de jugadores (Tarea 6.22): totales de la temporada regular de cada jugador,
 * con lo justo de su ficha (posición, país, edad, rookie), su salario y su media. Cambia una vez al día
 * (job diario), como los promedios de la ficha: sin spoilers. Las temporadas anteriores solo tienen a
 * los jugadores con historial guardado (los que siguen en la NBA).
 */
export async function getPlayerExplorer(season: string): Promise<ExplorerSeason> {
  "use cache: remote";
  cacheLife(dailyLife(Date.now()));

  const seasons = await getExplorerSeasons();
  const current = season === seasons[0];
  const supabase = getSupabase();
  type StatRow = {
    player_id: number;
    team_id: number | null;
    totals: Record<string, unknown> | null;
    age: unknown;
    teams: { team_id: number | null }[] | null;
    usg: unknown;
    astp: unknown;
    rebp: unknown;
  };
  type PlayerRow = Pick<Player, "id" | "full_name" | "position" | "team_id" | "country" | "birth_date"> & {
    radar_season: string | null;
    overall: unknown;
  };
  type ContractRow = Pick<PlayerContract, "player_id" | "salary_current" | "status"> & { precision: string | null };

  const [stats, players, contracts, earlier, careers] = await Promise.all([
    selectPages<StatRow>("estadísticas", (from, to) =>
      supabase
        .from("player_season_stats")
        .select(
          "player_id, team_id, totals, age:advanced_stats->age, teams:advanced_stats->teams, usg:advanced_stats->usg_pct, astp:advanced_stats->ast_pct, rebp:advanced_stats->reb_pct"
        )
        .eq("season_id", season)
        .eq("season_type", "Regular Season")
        .order("id")
        .range(from, to)
    ),
    selectPages<PlayerRow>("jugadores", (from, to) =>
      supabase
        .from("players")
        .select("id, full_name, position, team_id, country, birth_date, radar_season:radar_attributes->>season, overall:radar_attributes->overall")
        .order("id")
        .range(from, to)
    ),
    selectPages<ContractRow>("contratos", (from, to) =>
      supabase.from("player_contracts").select("player_id, salary_current, status, precision:source->>precision").order("player_id").range(from, to)
    ),
    // Rookie = ninguna temporada regular anterior a esta ("Career" queda fuera: va después de los números)
    selectPages<{ player_id: number }>(
      "temporadas anteriores",
      (from, to) => supabase.from("player_season_stats").select("player_id").eq("season_type", "Regular Season").lt("season_id", season).order("id").range(from, to),
      EARLIER_PAGES
    ),
    // En la temporada en curso, además, con la carrera resuelta: un veterano sin historial oficial aún no es rookie
    current
      ? selectPages<{ player_id: number }>("carreras", (from, to) =>
          supabase.from("player_season_stats").select("player_id").eq("season_id", "Career").eq("season_type", "Regular Season").order("id").range(from, to)
        )
      : Promise.resolve(null),
  ]);

  const playerById = new Map(players.map((p) => [p.id, p]));
  const contractById = new Map(contracts.map((c) => [c.player_id, c]));
  const veterans = new Set(earlier.map((r) => r.player_id));
  const withCareer = careers ? new Set(careers.map((r) => r.player_id)) : null;
  // Edad de una temporada anterior sin dato guardado: la del 1 de febrero de esa temporada
  const ageDate = current ? new Date() : new Date(`${Number(season.slice(0, 4)) + 1}-02-01T00:00:00Z`);

  const rows = stats.flatMap((s): ExplorerRow[] => {
    const player = playerById.get(s.player_id);
    const gp = numberOrNull(s.totals?.gp);
    if (!player || !gp) return [];
    const totals = { gp } as ExplorerTotals;
    for (const key of EXPLORER_TOTALS) totals[key] = numberOrNull(s.totals?.[key]);

    const teamIds = new Set<number>();
    for (const id of [s.team_id, ...(s.teams ?? []).map((t) => t.team_id), current ? player.team_id : null]) if (id) teamIds.add(id);

    const contract = contractById.get(player.id);
    const pending = contract !== undefined && (contract.status === "pending" || contract.salary_current === null);
    return [
      {
        id: player.id,
        name: player.full_name,
        position: player.position,
        teamId: current ? (player.team_id ?? s.team_id) : s.team_id,
        teamIds: [...teamIds],
        country: player.country,
        age: numberOrNull(s.age) ?? ageFrom(player.birth_date, ageDate),
        rookie: !veterans.has(player.id) && (withCareer === null || withCareer.has(player.id)),
        salary: contract && !pending ? contract.salary_current : null,
        salaryStatus: !contract ? null : pending ? "pending" : contract.precision === "approx" ? "approx" : "confirmed",
        overall: player.radar_season === season ? numberOrNull(player.overall) : null,
        usgPct: numberOrNull(s.usg),
        astPct: numberOrNull(s.astp),
        rebPct: numberOrNull(s.rebp),
        totals,
      },
    ];
  });
  return { season, current, rows };
}

/** Españoles en activo con equipo ("Los nuestros", Tarea 6.12): solo nombre y equipo actual, sin spoilers. */
export async function getSpanishPlayers(): Promise<SpanishPlayer[]> {
  "use cache";
  // Cambian con traspasos y fichajes: refresco horario, como el buscador.
  cacheLife("hours");

  const { data, error } = await getSupabase()
    .from("players")
    .select("id, full_name, team_id")
    .eq("country", SPAIN)
    .eq("is_active", true)
    .not("team_id", "is", null)
    .order("full_name");
  if (error) throw new Error(`Error cargando jugadores españoles: ${error.message}`);
  return (data as Pick<Player, "id" | "full_name" | "team_id">[]).map((p) => ({ id: p.id, name: p.full_name, teamId: p.team_id! }));
}

/** Índice compacto del buscador: los 30 equipos y todos los jugadores, leyendas incluidas (solo campos necesarios). */
/** Día (UTC) del último job diario de estadísticas, el que cambia las fichas: "2026-11-25". Para el `lastmod` del sitemap. */
export async function getDailyUpdate(): Promise<string | null> {
  "use cache";
  cacheLife("hours");

  const { data, error } = await getSupabase().from("sync_status").select("last_success_at").eq("id", "season_stats").maybeSingle();
  if (error) throw new Error(`Error cargando la última actualización: ${error.message}`);
  return (data as { last_success_at: string | null } | null)?.last_success_at?.slice(0, 10) ?? null;
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
