// Modelo de datos del GM Virtual, compartido por la pantalla y por la ruta de evaluación con IA.
import type { PlayerContract } from "@/lib/supabase";
import { applyEstimates, type DraftPick, type Trade, type TradePlayer, type TradeTeam } from "@/lib/trade-rules";

export type GmPlayer = TradePlayer & {
  position: string | null;
  age: number | null;
  /** Media del radar (0-99), null si aún no la tiene. */
  overall: number | null;
  /** Salarios de la temporada actual y las 3 siguientes. */
  contract: (number | null)[];
  option: PlayerContract["contract_option"];
  /** Ha renovado y los años nuevos aún no tienen cifra pública. */
  futurePending: boolean;
  /** Lo que ha publicado la prensa de su contrato (ayuda para estimar si aún no tiene cifra). */
  reported: {
    years: number | null;
    total: number | null;
    minimum: boolean;
    minimumOptions: number[] | null;
    outlet: string | null;
    url: string | null;
  } | null;
};

export type GmTeam = TradeTeam & {
  conference: "East" | "West" | null;
  wins: number;
  losses: number;
  /** Color de franquicia para fondos, y el que se ve sobre oscuro para franjas y marcas. */
  primary: string;
  accent: string;
  /** Lo que aún cobran sus jugadores cortados. */
  deadMoney: number;
};

export type GmData = {
  teams: GmTeam[];
  players: GmPlayer[];
  /** Fecha de hoy (YYYY-MM-DD): las reglas por fecha solo necesitan precisión de día. */
  today: string;
  /** Última vez que se aplicó el registro oficial de movimientos (ISO), o null si aún no se ha hecho. */
  contractsUpdatedAt: string | null;
};

/** Traspaso con los datos completos de la app. */
export type GmTrade = Omit<Trade, "teams" | "players"> & { teams: GmTeam[]; players: { player: GmPlayer; to: number }[] };

/**
 * Traspaso tal como viaja del cliente al servidor: solo ids, nunca salarios. La única excepción son las
 * estimaciones de contratos aún sin cifra pública, que el servidor acota y marca como tales.
 */
export type TradeRequest = {
  teamIds: number[];
  players: { id: number; to: number }[];
  picks: (DraftPick & { to: number })[];
  estimates?: { id: number; salary: number }[];
};

export const GRADES = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F"] as const;
export type Grade = (typeof GRADES)[number];

/** Evaluación de la IA: una nota y su explicación por cada equipo del traspaso. */
export type TradeEvaluation = {
  summary: string;
  teams: { teamId: number; grade: Grade; headline: string; analysis: string }[];
};

const MIN_TEAMS = 2;
export const MAX_TEAMS = 3;

/** Convierte una petición en un traspaso; null si es incoherente (equipos repetidos, activos ajenos, estimaciones no válidas…). */
export function buildTrade(data: GmData, request: TradeRequest): GmTrade | null {
  const { teamIds } = request;
  if (teamIds.length < MIN_TEAMS || teamIds.length > MAX_TEAMS || new Set(teamIds).size !== teamIds.length) return null;

  const teams = teamIds.map((id) => data.teams.find((team) => team.id === id));
  if (teams.some((team) => !team)) return null;

  const isDestination = (to: number, from: number) => to !== from && teamIds.includes(to);
  const playersById = new Map(data.players.map((player) => [player.id, player]));
  const players = request.players.map(({ id, to }) => ({ player: playersById.get(id), to }));
  if (players.some(({ player, to }) => !player || !teamIds.includes(player.teamId) || !isDestination(to, player.teamId))) return null;
  if (new Set(request.players.map(({ id }) => id)).size !== request.players.length) return null;

  const validPick = ({ teamId, year, round, to }: TradeRequest["picks"][number]) =>
    teamIds.includes(teamId) && isDestination(to, teamId) && Number.isInteger(year) && (round === 1 || round === 2);
  if (!request.picks.every(validPick)) return null;
  if (new Set(request.picks.map(pickKey)).size !== request.picks.length) return null;

  const priced = applyEstimates({ teams: teams as GmTeam[], players: players as GmTrade["players"] }, request.estimates ?? []);
  if (!priced) return null;

  return { ...priced, picks: request.picks.map(({ to, ...pick }) => ({ pick, to })) };
}

/** Forma única de un traspaso, sea cual sea el orden en que se montó: sirve de clave de caché. */
export function canonicalTrade({ teamIds, players, picks, estimates = [] }: TradeRequest): string {
  return JSON.stringify({
    teamIds: [...teamIds].sort((a, b) => a - b),
    players: [...players].sort((a, b) => a.id - b.id).map(({ id, to }) => ({ id, to })),
    picks: [...picks].sort((a, b) => pickKey(a).localeCompare(pickKey(b))).map(({ teamId, year, round, to }) => ({ teamId, year, round, to })),
    // Solo si hay: así las claves de los traspasos sin estimaciones no cambian
    ...(estimates.length > 0 ? { estimates: [...estimates].sort((a, b) => a.id - b.id).map(({ id, salary }) => ({ id, salary })) } : {}),
  });
}

export function pickKey({ teamId, year, round }: DraftPick): string {
  return `${teamId}-${year}-${round}`;
}

export function pickLabel({ year, round }: Pick<DraftPick, "year" | "round">): string {
  return `${round === 1 ? "1ª" : "2ª"} ronda ${year}`;
}
