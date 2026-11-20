// Ficha completa de un partido: boxscore y jugada a jugada de la CDN de la NBA, reducidos en el
// servidor a lo que pinta la ficha y con las métricas avanzadas ya calculadas (la jugada a jugada
// original pesa ~500 KB). Contiene el resultado: solo se sirve por `/api/games/[id]` en Nivel 3.
// El modo diferido (Tarea 6.13) sirve la misma ficha cortada en un instante (`getDeferredDetail`).
// Los componentes del cliente solo importan sus tipos (`import type`).
import { cacheLife } from "next/cache";
import { buildDeferredDetail } from "@/lib/deferred";
import type { DeferredPosition } from "@/lib/deferred-position";
import {
  absenceOf,
  boxLine,
  isoSeconds,
  longestRun,
  periodStart,
  playerMetrics,
  scanActions,
  sortActions,
  teamMetrics,
  type RawAction,
  type RawBoxscoreGame,
  type RawTeam,
} from "@/lib/game-pbp";
import { buildPeriodText, fetchLiveData } from "@/lib/live";
import type { Game } from "@/lib/spoilers";

// --- Tipos que consume la UI ---

/** Zonas de tiro clásicas de la NBA. */
export type ShotZone = "ra" | "paint" | "mid" | "corner3" | "above3";

export type Shot = {
  /** Décimas de pie respecto al aro (coordenadas clásicas de la NBA): `y` crece hacia el centro del campo. */
  x: number;
  y: number;
  made: boolean;
  three: boolean;
  zone: ShotZone;
  teamId: number;
  playerId: number;
  period: number;
  clock: string;
  /** "Triple tras bote de S. Curry (7.6 m) · asist. D. Green" */
  text: string;
};

export type PlayKind = "score" | "miss" | "rebound" | "turnover" | "foul" | "timeout" | "period" | "other";

export type Play = {
  id: number;
  period: number;
  clock: string;
  teamId: number | null;
  playerId: number | null;
  /** Todos los jugadores implicados: autor, asistente, quien roba, tapona o recibe la falta. */
  involved: number[];
  kind: PlayKind;
  /** Puntos que suma la jugada (0 si no anota). */
  points: number;
  /** Puntos acumulados del anotador tras la canasta. */
  total: number | null;
  text: string;
  /** Marcador tras la jugada. */
  away: number;
  home: number;
};

/** [segundos de juego transcurridos, puntos del visitante, puntos del local] */
export type FlowPoint = [seconds: number, away: number, home: number];

/** Mayor parcial sin respuesta del rival. */
export type ScoringRun = {
  points: number;
  from: { period: number; clock: string };
  to: { period: number; clock: string };
};

export type BoxLine = {
  pts: number;
  reb: number;
  oreb: number;
  dreb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
  fgm: number;
  fga: number;
  fg3m: number;
  fg3a: number;
  ftm: number;
  fta: number;
  paintPts: number;
  fastBreakPts: number;
  secondChancePts: number;
};

export type PlayerLine = BoxLine & {
  id: number;
  name: string;
  /** "S. Curry" */
  short: string;
  jersey: string | null;
  /** Solo los titulares traen posición en el boxscore. */
  position: string | null;
  starter: boolean;
  onCourt: boolean;
  played: boolean;
  /** Motivo de la ausencia en español ("Lesión", "Decisión técnica"…); null si ha jugado. */
  absence: string | null;
  absenceDetail: string | null;
  seconds: number;
  plusMinus: number;
  foulsDrawn: number;
  tsPct: number | null;
  efgPct: number | null;
  usgPct: number | null;
  /** Valoración Game Score de John Hollinger. */
  gameScore: number;
};

export type TeamTotals = BoxLine & {
  pointsOffTurnovers: number;
  benchPts: number;
  biggestLead: number;
  timeLeadingS: number;
  possessions: number;
  offRtg: number | null;
  defRtg: number | null;
  efgPct: number | null;
  tsPct: number | null;
  tovPct: number | null;
  orbPct: number | null;
  ftRate: number | null;
};

export type TeamBox = {
  id: number;
  tricode: string;
  name: string;
  score: number;
  periods: number[];
  timeoutsRemaining: number | null;
  inBonus: boolean;
  totals: TeamTotals;
  run: ScoringRun | null;
  players: PlayerLine[];
};

export type GameDetail = {
  id: string;
  status: Game["status"];
  /** Mismo formato que `games.live_period_text`: "Q3 04:12", "Descanso"… (solo en directo). */
  periodText: string | null;
  period: number;
  regulationPeriods: number;
  arena: string | null;
  city: string | null;
  attendance: number | null;
  sellout: boolean;
  durationMin: number | null;
  officials: string[];
  /** Posesiones por 48 minutos. */
  pace: number | null;
  leadChanges: number;
  timesTied: number;
  away: TeamBox;
  home: TeamBox;
  flow: FlowPoint[];
  /** Segundos jugados hasta la última jugada registrada. */
  elapsed: number;
  /** Duración del eje temporal: 48 min + las prórrogas jugadas o en juego. */
  length: number;
  shots: Shot[];
  plays: Play[];
  fetchedAt: string;
};

// --- Descarga ---

/** JSON de la NBA; null si aún no existe (antes del salto inicial la NBA responde 403/404). */
async function fetchCdn<T>(path: string): Promise<T | null> {
  return fetchLiveData<T>(path);
}

/**
 * Ficha del partido, null si aún no ha empezado. Caché compartida: 30 s mientras se juega
 * (1 petición a la NBA cada 30 s, la miren 1 o 2.000 personas) y horas cuando ya es Final.
 * Los errores no se cachean.
 */
export async function getGameDetail(gameId: string): Promise<GameDetail | null> {
  "use cache";

  const [box, pbp] = await Promise.all([
    fetchCdn<{ game: RawBoxscoreGame }>(`boxscore/boxscore_${gameId}.json`),
    fetchCdn<{ game: { actions: RawAction[] } }>(`playbyplay/playbyplay_${gameId}.json`),
  ]);
  if (!box || box.game.gameStatus === 1) {
    cacheLife({ stale: 60, revalidate: 60, expire: 300 });
    return null;
  }

  const detail = buildDetail(box.game, pbp?.game.actions ?? []);
  // Sin jugada a jugada todavía (llega con algo de retraso): se reintenta como si estuviera en juego
  if (detail.status === "Final" && pbp) cacheLife("hours");
  else cacheLife({ stale: 30, revalidate: 30, expire: 300 });
  return detail;
}

// --- Modo diferido (Tarea 6.13) ---

/** Boxscore y jugada a jugada tal cual, solo para el servidor: contienen el resultado final. */
type GameSource = { game: RawBoxscoreGame; actions: RawAction[] };

/** Lo que usa la reconstrucción, sin el texto ni las coordenadas en metros (la mitad de peso). */
function slimAction(a: RawAction): RawAction {
  return {
    actionNumber: a.actionNumber,
    orderNumber: a.orderNumber,
    clock: a.clock,
    period: a.period,
    teamId: a.teamId,
    teamTricode: a.teamTricode,
    personId: a.personId,
    playerNameI: a.playerNameI,
    actionType: a.actionType,
    subType: a.subType,
    descriptor: a.descriptor,
    qualifiers: a.qualifiers,
    shotResult: a.shotResult,
    isFieldGoal: a.isFieldGoal,
    xLegacy: a.xLegacy,
    yLegacy: a.yLegacy,
    shotDistance: a.shotDistance,
    pointsTotal: a.pointsTotal,
    scoreHome: a.scoreHome,
    scoreAway: a.scoreAway,
    assistPlayerNameInitial: a.assistPlayerNameInitial,
    blockPlayerName: a.blockPlayerName,
    stealPlayerName: a.stealPlayerName,
    foulDrawnPlayerName: a.foulDrawnPlayerName,
    jumpBallWonPlayerName: a.jumpBallWonPlayerName,
    personIdsFilter: a.personIdsFilter,
    assistPersonId: a.assistPersonId,
    blockPersonId: a.blockPersonId,
    stealPersonId: a.stealPersonId,
    foulDrawnPersonId: a.foulDrawnPersonId,
  };
}

/** Datos originales del partido, con la misma caché compartida que la ficha completa. */
async function getGameSource(gameId: string): Promise<GameSource | null> {
  "use cache";

  const [box, pbp] = await Promise.all([
    fetchCdn<{ game: RawBoxscoreGame }>(`boxscore/boxscore_${gameId}.json`),
    fetchCdn<{ game: { actions: RawAction[] } }>(`playbyplay/playbyplay_${gameId}.json`),
  ]);
  if (!box || box.game.gameStatus === 1) {
    cacheLife({ stale: 60, revalidate: 60, expire: 300 });
    return null;
  }
  if (box.game.gameStatus === 3 && pbp) cacheLife("hours");
  else cacheLife({ stale: 30, revalidate: 30, expire: 300 });
  return { game: box.game, actions: (pbp?.game.actions ?? []).map(slimAction) };
}

/**
 * Ficha del partido tal y como estaba en `position`: nada posterior sale del servidor
 * (ni la nota, ni el estado final, ni si hubo prórroga). Null si aún no ha empezado.
 */
export async function getDeferredDetail(gameId: string, position: DeferredPosition): Promise<GameDetail | null> {
  const source = await getGameSource(gameId);
  return source && buildDeferredDetail(source.game, source.actions, position);
}

// --- Montaje de la ficha ---

function buildDetail(game: RawBoxscoreGame, rawActions: RawAction[]): GameDetail {
  const status: Game["status"] = game.gameStatus === 3 ? "Final" : "Live";
  const regulation = game.regulationPeriods ?? 4;
  const { flow, plays, shots, streaks, elapsed } = scanActions(sortActions(rawActions), regulation);

  const away = teamBox(game.awayTeam, game.homeTeam, longestRun(streaks, "away"), status);
  const home = teamBox(game.homeTeam, game.awayTeam, longestRun(streaks, "home"), status);
  const periods = Math.max(game.period, regulation);
  const teamSeconds = isoSeconds(game.homeTeam.statistics.minutes);

  return {
    id: game.gameId,
    status,
    periodText: buildPeriodText({ ...game, regulationPeriods: regulation }, status),
    period: game.period,
    regulationPeriods: regulation,
    arena: game.arena?.arenaName || null,
    city: game.arena?.arenaCity || null,
    attendance: game.attendance || null,
    sellout: game.sellout === "1",
    durationMin: status === "Final" && game.duration ? game.duration : null,
    officials: (game.officials ?? []).map((o) => o.name),
    pace: teamSeconds > 0 ? (away.totals.possessions * 5 * 48 * 60) / teamSeconds : null,
    leadChanges: game.homeTeam.statistics.leadChanges ?? 0,
    timesTied: game.homeTeam.statistics.timesTied ?? 0,
    away,
    home,
    flow,
    elapsed: status === "Final" ? periodStart(periods + 1, regulation) : elapsed,
    length: periodStart(periods + 1, regulation),
    shots,
    plays,
    fetchedAt: new Date().toISOString(),
  };
}

function teamBox(team: RawTeam, rival: RawTeam, run: ScoringRun | null, status: Game["status"]): TeamBox {
  const s = team.statistics;
  const line = boxLine(s, s.reboundsPersonal, s.turnoversTotal);
  const rivalLine = boxLine(rival.statistics, rival.statistics.reboundsPersonal, rival.statistics.turnoversTotal);
  const teamSeconds = isoSeconds(s.minutes);

  const players = (team.players ?? []).map((p): PlayerLine => {
    const ps = p.statistics;
    const pl = boxLine(ps, ps.reboundsTotal, ps.turnovers);
    const seconds = isoSeconds(ps.minutes);
    const { absence, detail } = absenceOf(p, status === "Live");
    return {
      ...pl,
      id: p.personId,
      name: p.name,
      short: p.nameI,
      jersey: p.jerseyNum || null,
      position: p.position || null,
      starter: p.starter === "1",
      onCourt: status === "Live" && p.oncourt === "1",
      played: p.played === "1",
      absence,
      absenceDetail: detail,
      seconds,
      plusMinus: Math.round(ps.plusMinusPoints ?? 0),
      foulsDrawn: ps.foulsDrawn ?? 0,
      ...playerMetrics(pl, seconds, line, teamSeconds),
    };
  });

  return {
    id: team.teamId,
    tricode: team.teamTricode,
    name: `${team.teamCity} ${team.teamName}`,
    score: team.score,
    periods: team.periods.map((p) => p.score),
    timeoutsRemaining: team.timeoutsRemaining ?? null,
    inBonus: team.inBonus === "1",
    run,
    players,
    totals: {
      ...line,
      pointsOffTurnovers: s.pointsFromTurnovers ?? 0,
      benchPts: s.benchPoints ?? 0,
      biggestLead: s.biggestLead ?? 0,
      timeLeadingS: isoSeconds(s.timeLeading),
      ...teamMetrics(line, rivalLine),
    },
  };
}
