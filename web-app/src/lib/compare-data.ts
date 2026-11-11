// Datos del comparador (solo servidor): cada jugador con sus temporadas, su radar histórico y su palmarés.
import { cacheLife } from "next/cache";
import { trophyCounts } from "@/components/players/TrophyCabinet";
import { buildRadarScale, CAREER, isRepresentative, radarOf, scaleKey, type Radar, type RadarScales, type StatLine } from "@/lib/compare";
import { ageFrom, formatDraft } from "@/lib/player-profile";
import { getPlayer, getPlayerAwards, getPlayerCareer, getTeams } from "@/lib/queries";
import { getSupabase, type PlayerContract, type PlayerSeasonStats, type SeasonType, type Team } from "@/lib/supabase";

const PAGE_SIZE = 1000;

export type DuelSeason = {
  id: string; // "1995-96" o CAREER
  phase: SeasonType;
  team: string | null; // "CHI", o "TOT" si jugó en varios equipos
  age: number | null;
  line: StatLine;
  radar: Radar;
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

type StatRow = Pick<PlayerSeasonStats, "season_id" | "season_type" | "games_played" | "pts" | "reb" | "ast" | "fg_pct" | "fg3_pct" | "advanced_stats">;

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

/** Escalas del radar: se calculan con todas las temporadas guardadas y solo se conservan sus cortes. */
async function getRadarScales(): Promise<RadarScales> {
  "use cache";
  cacheLife("hours");

  const supabase = getSupabase();
  const groups = new Map<string, StatLine[]>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("player_season_stats")
      .select("season_id, season_type, games_played, pts, reb, ast, fg_pct, fg3_pct, advanced_stats")
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Error cargando temporadas: ${error.message}`);

    for (const row of data as StatRow[]) {
      const line = lineOf(row);
      if (!isRepresentative(line, row.season_id, row.season_type)) continue;
      const key = scaleKey(row.season_id, row.season_type);
      groups.set(key, [...(groups.get(key) ?? []), line]);
    }
    if (data.length < PAGE_SIZE) break;
  }
  return Object.fromEntries([...groups].map(([key, lines]) => [key, buildRadarScale(lines)]));
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

  const [player, career, awards, teams, scales, salary] = await Promise.all([
    getPlayer(playerId),
    getPlayerCareer(playerId),
    getPlayerAwards(playerId),
    getTeams(),
    getRadarScales(),
    getCurrentSalary(playerId),
  ]);
  if (!player) return null;

  const regular = career.filter((row) => row.season_type === "Regular Season" && row.season_id !== CAREER);
  const teamId = player.team_id ?? mostFrequentTeam(regular);
  const team = teams.find((candidate) => candidate.id === teamId) ?? null;

  const seasons = career
    .map((row): DuelSeason => {
      const line = lineOf(row);
      const scale = scales[scaleKey(row.season_id, row.season_type)];
      return {
        id: row.season_id,
        phase: row.season_type,
        team: row.advanced_stats.team_abbreviation ?? null,
        age: row.advanced_stats.age ?? null,
        line,
        radar: radarOf(line, scale),
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
