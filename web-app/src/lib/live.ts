// Marcador en directo de la NBA (mismo JSON que usa `live.nba.endpoints.scoreboard` de nba_api).
// Solo se consume desde `/api/live`: los clientes nunca llaman a la NBA directamente.
// Contiene marcadores: la UI solo debe pedirlo con `spoilerMode === 'FULL'` (Nivel 3).
import { cacheLife } from "next/cache";
import type { Game } from "@/lib/spoilers";

/**
 * Orígenes de los JSON en directo de la NBA, por orden. cdn.nba.com (Akamai) rechaza las IPs de Vercel
 * (AWS) con 403; su origen en S3 es público, igual de actualizado y no las bloquea. La CDN queda de respaldo.
 */
const LIVE_DATA_ORIGINS = [
  "https://nba-prod-us-east-1-mediaops-stats.s3.amazonaws.com/NBA/liveData",
  "https://cdn.nba.com/static/json/liveData",
];

// Mismas cabeceras que envía nba_api: sin ellas la CDN rechaza la petición
export const NBA_HEADERS = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Origin: "https://www.nba.com",
  Referer: "https://www.nba.com/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

/**
 * JSON en directo de la NBA (`path` relativo a liveData, p. ej. "boxscore/boxscore_0022600222.json").
 * null si aún no existe (la NBA responde 403/404 antes de que empiece el partido); lanza si ningún
 * origen responde.
 */
export async function fetchLiveData<T>(path: string): Promise<T | null> {
  let missing = false;
  let lastError: unknown = null;
  for (const origin of LIVE_DATA_ORIGINS) {
    try {
      const res = await fetch(`${origin}/${path}`, { headers: NBA_HEADERS });
      if (res.ok) return (await res.json()) as T;
      if (res.status === 403 || res.status === 404) missing = true;
      else lastError = new Error(`NBA ${res.status} (${path})`);
    } catch (error) {
      lastError = error;
    }
  }
  if (missing) return null;
  throw lastError ?? new Error(`NBA sin respuesta (${path})`);
}

export type LivePeriod = { period: number; label: string; score: number };

export type LiveLeader = {
  playerId: number;
  name: string;
  points: number;
  rebounds: number;
  assists: number;
};

export type LiveTeam = {
  teamId: number;
  tricode: string;
  score: number;
  wins: number;
  losses: number;
  inBonus: boolean;
  timeoutsRemaining: number;
  periods: LivePeriod[];
  leader: LiveLeader | null;
};

export type LiveGame = {
  id: string;
  status: Game["status"];
  /** Mismo formato que `games.live_period_text`: "Q3 04:12", "Descanso", "OT1 00:35"… */
  periodText: string | null;
  period: number;
  startTimeUtc: string;
  home: LiveTeam;
  away: LiveTeam;
};

export type LiveScoreboard = {
  gameDate: string;
  fetchedAt: string;
  games: LiveGame[];
};

// Forma (parcial) del JSON de la CDN de la NBA
type RawLeader = { personId: number; name: string; points: number; rebounds: number; assists: number };
type RawTeam = {
  teamId: number;
  teamTricode: string;
  score: number;
  wins: number;
  losses: number;
  inBonus: string | null;
  timeoutsRemaining: number;
  periods: { period: number; periodType: string; score: number }[];
};
type RawGame = {
  gameId: string;
  gameStatus: 1 | 2 | 3;
  gameStatusText: string;
  period: number;
  gameClock: string;
  gameTimeUTC: string;
  regulationPeriods?: number;
  homeTeam: RawTeam;
  awayTeam: RawTeam;
  gameLeaders?: { homeLeaders?: RawLeader; awayLeaders?: RawLeader };
};
type RawScoreboard = { scoreboard: { gameDate: string; games: RawGame[] } };

const STATUS: Record<RawGame["gameStatus"], Game["status"]> = { 1: "Scheduled", 2: "Live", 3: "Final" };

/** "PT04M12.00S" → "04:12" (null si el reloj viene vacío). */
export function parseClock(iso: string): string | null {
  const match = /PT(\d+)M(\d+)(?:\.\d+)?S/.exec(iso);
  if (!match) return null;
  return `${match[1].padStart(2, "0")}:${match[2].padStart(2, "0")}`;
}

function periodLabel(period: number, regulation: number): string {
  return period <= regulation ? `Q${period}` : `OT${period - regulation}`;
}

/** Texto del periodo en juego. También sirve con el boxscore, que trae los mismos campos. */
export function buildPeriodText(
  game: Pick<RawGame, "gameStatusText" | "period" | "gameClock" | "regulationPeriods">,
  status: Game["status"]
): string | null {
  if (status !== "Live") return null;
  if (/half/i.test(game.gameStatusText)) return "Descanso";

  const label = periodLabel(game.period, game.regulationPeriods ?? 4);
  const clock = parseClock(game.gameClock);
  if (!clock || clock === "00:00") return `Fin ${label}`;
  return `${label} ${clock}`;
}

function mapLeader(raw: RawLeader | undefined): LiveLeader | null {
  if (!raw?.personId) return null;
  return { playerId: raw.personId, name: raw.name, points: raw.points, rebounds: raw.rebounds, assists: raw.assists };
}

function mapTeam(raw: RawTeam, leader: RawLeader | undefined, regulation: number): LiveTeam {
  return {
    teamId: raw.teamId,
    tricode: raw.teamTricode,
    score: raw.score,
    wins: raw.wins,
    losses: raw.losses,
    inBonus: raw.inBonus === "1",
    timeoutsRemaining: raw.timeoutsRemaining,
    periods: raw.periods.map((p) => ({ period: p.period, label: periodLabel(p.period, regulation), score: p.score })),
    leader: mapLeader(leader),
  };
}

function mapGame(raw: RawGame): LiveGame {
  const status = STATUS[raw.gameStatus] ?? "Scheduled";
  const regulation = raw.regulationPeriods ?? 4;
  return {
    id: raw.gameId,
    status,
    periodText: buildPeriodText(raw, status),
    period: raw.period,
    startTimeUtc: raw.gameTimeUTC,
    home: mapTeam(raw.homeTeam, raw.gameLeaders?.homeLeaders, regulation),
    away: mapTeam(raw.awayTeam, raw.gameLeaders?.awayLeaders, regulation),
  };
}

/**
 * Caché compartida de 30 s para todos los usuarios: como mucho 1 petición
 * a la NBA cada 30 s, la vea 1 persona o 2.000. Los errores no se cachean.
 */
export async function getLiveScoreboard(): Promise<LiveScoreboard> {
  "use cache";
  cacheLife({ stale: 30, revalidate: 30, expire: 300 });

  const data = await fetchLiveData<RawScoreboard>("scoreboard/todaysScoreboard_00.json");
  if (!data) throw new Error("NBA scoreboard no disponible");

  return {
    gameDate: data.scoreboard.gameDate,
    fetchedAt: new Date().toISOString(),
    games: data.scoreboard.games.map(mapGame),
  };
}
