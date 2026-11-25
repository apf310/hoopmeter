// Datos del comparador (solo servidor): cada jugador con sus temporadas, su radar histórico y su palmarés.
import { cacheLife } from "next/cache";
import { dailyLife } from "@/lib/cache-window";
import { trophyCounts } from "@/components/trophies/trophy-catalog";
import { buildRadarScale, CAREER, isRepresentative, radarOf, scaleKey, type Radar, type RadarScales, type StatLine } from "@/lib/compare";
import { averagesFromTotals, careerLeague, leagueOf, relativeLine, type LeagueAverages, type LeagueTable, type SeasonTotals } from "@/lib/era-adjust";
import { LEAGUE_AVERAGES } from "@/lib/league-averages";
import { ageFrom, formatDraft } from "@/lib/player-profile";
import { getPlayer, getPlayerAwards, getPlayerCareer, getTeams, selectPages } from "@/lib/queries";
import { getSupabase, type PlayerContract, type PlayerSeasonStats, type SeasonType, type Team } from "@/lib/supabase";
import { SEASON } from "@/lib/trade-rules";

/** Páginas de 1.000 temporadas que se piden a la vez (en 2026-27 son casi 8.000 filas). */
const SEASON_PAGES = 9;

export type DuelSeason = {
  id: string; // "1995-96" o CAREER
  phase: SeasonType;
  team: string | null; // "CHI", o "TOT" si jugó en varios equipos
  age: number | null;
  line: StatLine;
  radar: Radar;
  /** La liga que tuvo delante (en una carrera, la de todas sus temporadas) y el radar ajustado con ella (Tarea 7.3). */
  league: LeagueAverages | null;
  eraRadar: Radar;
};

export type DuelTeam = Pick<Team, "id" | "name" | "abbreviation" | "primary_color" | "secondary_color">;

export type DuelPlayer = {
  id: number;
  name: string;
  active: boolean;
  position: string | null;
  height: string | null;
  weight: string | null;
  country: string | null;
  draft: string;
  /** Edad actual: solo de jugadores en activo. */
  age: number | null;
  /** Su equipo actual o, si está retirado, en el que más temporadas jugó. */
  team: DuelTeam | null;
  /** La carrera primero y después de la temporada más reciente a la más antigua. */
  seasons: DuelSeason[];
  trophies: Record<string, number>;
  salary: number | null;
};

type StatRow = Pick<PlayerSeasonStats, "player_id" | "season_id" | "season_type" | "games_played" | "pts" | "reb" | "ast" | "fg_pct" | "fg3_pct" | "advanced_stats">;

function lineOf({ games_played, pts, reb, ast, fg_pct, fg3_pct, advanced_stats: extra }: StatRow): StatLine {
  return {
    games: games_played,
    minutes: extra.min ?? null,
    pts,
    reb,
    ast,
    stl: extra.stl ?? null,
    blk: extra.blk ?? null,
    tov: extra.tov ?? null,
    fg3m: extra.fg3m ?? null,
    fg3a: extra.fg3a ?? null,
    fgPct: fg_pct,
    fg3Pct: fg3_pct,
    ftPct: extra.ft_pct ?? null,
    tsPct: extra.ts_pct ?? null,
  };
}

/** Medias de la liga por temporada: las cerradas, de la tabla fija; la de ahora, de los totales del job diario. */
export async function getLeagueTable(): Promise<LeagueTable> {
  "use cache: remote";
  cacheLife(dailyLife(Date.now()));

  const table: LeagueTable = { "Regular Season": { ...LEAGUE_AVERAGES["Regular Season"] }, Playoffs: { ...LEAGUE_AVERAGES.Playoffs } };
  type Row = { season_type: SeasonType; totals: SeasonTotals | null };
  const rows = await selectPages<Row>("la temporada en curso", (from, to) =>
    getSupabase().from("player_season_stats").select("season_type, totals").eq("season_id", SEASON).order("id").range(from, to)
  );
  for (const phase of ["Regular Season", "Playoffs"] as const) {
    if (table[phase][SEASON]) continue; // Ya cerrada y en la tabla
    const totals = rows.flatMap((row) => (row.season_type === phase && row.totals ? [row.totals] : []));
    const averages = averagesFromTotals(totals);
    if (averages) table[phase][SEASON] = averages;
  }
  return table;
}

type LeagueSource = Pick<StatRow, "season_id" | "season_type"> & { line: StatLine };

/** La liga de una fila: la de su temporada o, en la carrera, la de todas las del jugador en esa fase. */
function leagueFor(row: LeagueSource, playerRows: LeagueSource[], table: LeagueTable): LeagueAverages | null {
  if (row.season_id !== CAREER) return leagueOf(row.season_id, row.season_type, table);
  const seasons = playerRows.filter(({ season_type }) => season_type === row.season_type).map(({ season_id, line }) => ({ id: season_id, line }));
  return careerLeague(seasons, row.season_type, table);
}

/** Solo lo que necesitan las escalas: con `advanced_stats` entero eran 4 MB (Tarea 7.7). */
const SCALE_COLUMNS =
  "player_id, season_id, season_type, games_played, pts, reb, ast, fg_pct, fg3_pct, min:advanced_stats->min, stl:advanced_stats->stl, blk:advanced_stats->blk, fg3m:advanced_stats->fg3m, fg3a:advanced_stats->fg3a, ts_pct:advanced_stats->ts_pct";

type ScaleRow = Omit<StatRow, "advanced_stats"> & Pick<StatRow["advanced_stats"], "min" | "stl" | "blk" | "fg3m" | "fg3a" | "ts_pct">;

/**
 * Escalas del radar, normal y ajustado: se calculan con todas las temporadas guardadas y solo se conservan sus cortes.
 * Cambian una vez al día (job diario) y son las mismas para todos los duelos: caché compartida.
 */
async function getRadarScales(): Promise<{ plain: RadarScales; era: RadarScales }> {
  "use cache: remote";
  cacheLife(dailyLife(Date.now()));

  const [stored, table] = await Promise.all([
    selectPages<ScaleRow>(
      "temporadas",
      (from, to) => getSupabase().from("player_season_stats").select(SCALE_COLUMNS).order("id").range(from, to),
      SEASON_PAGES
    ),
    getLeagueTable(),
  ]);
  const players = new Map<number, LeagueSource[]>();
  for (const { min, stl, blk, fg3m, fg3a, ts_pct, ...row } of stored) {
    const rows = players.get(row.player_id) ?? [];
    rows.push({ season_id: row.season_id, season_type: row.season_type, line: lineOf({ ...row, advanced_stats: { min, stl, blk, fg3m, fg3a, ts_pct } }) });
    players.set(row.player_id, rows);
  }

  const plain = new Map<string, StatLine[]>();
  const era = new Map<string, StatLine[]>();
  for (const rows of players.values()) {
    for (const row of rows) {
      if (!isRepresentative(row.line, row.season_id, row.season_type)) continue;
      const key = scaleKey(row.season_id, row.season_type);
      if (!plain.has(key)) {
        plain.set(key, []);
        era.set(key, []);
      }
      plain.get(key)!.push(row.line);
      era.get(key)!.push(relativeLine(row.line, leagueFor(row, rows, table)));
    }
  }
  const scales = (groups: Map<string, StatLine[]>) => Object.fromEntries([...groups].map(([key, lines]) => [key, buildRadarScale(lines)]));
  return { plain: scales(plain), era: scales(era) };
}

async function getCurrentSalary(playerId: number): Promise<number | null> {
  const { data, error } = await getSupabase().from("player_contracts").select("salary_current").eq("player_id", playerId).maybeSingle();
  if (error) throw new Error(`Error cargando contrato: ${error.message}`);
  return (data as Pick<PlayerContract, "salary_current"> | null)?.salary_current ?? null;
}

function mostFrequentTeam(rows: PlayerSeasonStats[]): number | null {
  const seasons = new Map<number, number>();
  for (const { team_id: teamId } of rows) if (teamId) seasons.set(teamId, (seasons.get(teamId) ?? 0) + 1);
  return [...seasons].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** Un jugador listo para el duelo, o null si no existe. */
export async function getDuelPlayer(playerId: number): Promise<DuelPlayer | null> {
  "use cache";
  cacheLife("hours");

  const [player, career, awards, teams, scales, table, salary] = await Promise.all([
    getPlayer(playerId),
    getPlayerCareer(playerId),
    getPlayerAwards(playerId),
    getTeams(),
    getRadarScales(),
    getLeagueTable(),
    getCurrentSalary(playerId),
  ]);
  if (!player) return null;

  const regular = career.filter((row) => row.season_type === "Regular Season" && row.season_id !== CAREER);
  const teamId = player.team_id ?? mostFrequentTeam(regular);
  const team = teams.find((candidate) => candidate.id === teamId) ?? null;

  const sources = career.map((row): LeagueSource => ({ season_id: row.season_id, season_type: row.season_type, line: lineOf(row) }));
  const seasons = career
    .map((row, i): DuelSeason => {
      const { line } = sources[i];
      const key = scaleKey(row.season_id, row.season_type);
      const league = leagueFor(sources[i], sources, table);
      return {
        id: row.season_id,
        phase: row.season_type,
        team: row.advanced_stats.team_abbreviation ?? null,
        age: row.advanced_stats.age ?? null,
        line,
        radar: radarOf(line, scales.plain[key]),
        league,
        eraRadar: radarOf(relativeLine(line, league), scales.era[key]),
      };
    })
    // "Career" va delante; las temporadas, de la más reciente a la más antigua
    .sort((a, b) => Number(b.id === CAREER) - Number(a.id === CAREER) || b.id.localeCompare(a.id));

  return {
    id: player.id,
    name: player.full_name,
    active: player.is_active,
    position: player.position,
    height: player.height,
    weight: player.weight,
    country: player.country,
    draft: formatDraft(player),
    age: player.is_active ? ageFrom(player.birth_date) : null,
    team: team && { id: team.id, name: team.name, abbreviation: team.abbreviation, primary_color: team.primary_color, secondary_color: team.secondary_color },
    seasons,
    trophies: trophyCounts(awards),
    salary,
  };
}
