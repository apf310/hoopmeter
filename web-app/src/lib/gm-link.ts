// Traspaso del GM en la URL (Tarea 6.9): solo ids, para compartirlo por enlace. Al abrirlo se reconstruye
// con los contratos de hoy y el veredicto se vuelve a calcular con `trade-rules.ts`: el enlace nunca
// lleva salarios ni veredictos. Única excepción, como en la evaluación con IA: la estimación del usuario
// para un contrato aún sin cifra pública, que `buildTrade` acota al rango legal del convenio.
//
//   ?equipos=1610612747,1610612738
//   &jugadores=2544-1610612738          (jugador-equipo que lo recibe)
//   &rondas=1610612747-2028-1-1610612738 (equipo que la cede-año-ronda-equipo que la recibe)
//   &estimaciones=1631234-5000000        (jugador-salario)
//
// Puro y sin dependencias de valores (se prueba con `node --test`).
import type { GmData, TradeRequest } from "@/lib/gm";

const MAX_TEAMS = 3;
/** Más que cualquier traspaso razonable: un enlace manipulado no hace trabajar de más a la página. */
const MAX_ASSETS = 20;

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

function param(params: Params, name: string): string | null {
  const value = params instanceof URLSearchParams ? params.get(name) : params[name];
  return (Array.isArray(value) ? value[0] : value) || null;
}

/** "1-2-3" -> [1, 2, 3]; null si algún trozo no es un entero positivo o no hay `size` trozos. */
function ids(text: string, size: number): number[] | null {
  const parts = text.split("-");
  if (parts.length !== size || !parts.every((part) => /^\d{1,10}$/.test(part))) return null;
  const values = parts.map(Number);
  return values.every((value) => value > 0) ? values : null;
}

/** Lista separada por comas; null si algún elemento no tiene la forma esperada. */
function list(text: string | null, size: number): number[][] | null {
  if (!text) return [];
  const items = text.split(",").map((item) => ids(item, size));
  return items.length <= MAX_ASSETS && items.every((item) => item !== null) ? (items as number[][]) : null;
}

/** El traspaso como parámetros de la URL ("" si no hay equipos elegidos). Orden estable: mismo traspaso, mismo enlace. */
export function tradeSearch({ teamIds, players, picks, estimates = [] }: TradeRequest): string {
  if (teamIds.length === 0) return "";
  const search = new URLSearchParams({ equipos: teamIds.join(",") });
  const sorted = <T,>(items: T[], key: (item: T) => string) => [...items].sort((a, b) => key(a).localeCompare(key(b), "en", { numeric: true }));
  if (players.length > 0) search.set("jugadores", sorted(players, ({ id }) => String(id)).map(({ id, to }) => `${id}-${to}`).join(","));
  if (picks.length > 0) {
    const key = ({ teamId, year, round }: (typeof picks)[number]) => `${teamId}-${year}-${round}`;
    search.set("rondas", sorted(picks, key).map((pick) => `${key(pick)}-${pick.to}`).join(","));
  }
  if (estimates.length > 0) search.set("estimaciones", sorted(estimates, ({ id }) => String(id)).map(({ id, salary }) => `${id}-${salary}`).join(","));
  // Las comas se leen mejor sin escapar y son válidas en una URL
  return `?${search.toString().replaceAll("%2C", ",")}`;
}

/** Lee el traspaso de la URL; null si no hay o si el enlace está mal formado. */
export function parseTradeSearch(params: Params): TradeRequest | null {
  const teams = param(params, "equipos");
  if (!teams) return null;
  const teamIds = teams.split(",").map((id) => ids(id, 1)?.[0] ?? null);
  if (teamIds.length > MAX_TEAMS || teamIds.some((id) => id === null)) return null;

  const players = list(param(params, "jugadores"), 2);
  const picks = list(param(params, "rondas"), 4);
  const estimates = list(param(params, "estimaciones"), 2);
  if (!players || !picks || !estimates) return null;

  return {
    teamIds: teamIds as number[],
    players: players.map(([id, to]) => ({ id, to })),
    picks: picks.map(([teamId, year, round, to]) => ({ teamId, year, round: round as 1 | 2, to })),
    estimates: estimates.map(([id, salary]) => ({ id, salary })),
  };
}

export type RestoredTrade = {
  request: TradeRequest;
  /** Lo que el enlace traía y ya no se puede montar, en lenguaje llano (p. ej. un jugador que ha cambiado de equipo). */
  dropped: string[];
};

/**
 * Reconstruye el traspaso del enlace con los datos de hoy. Se queda con lo que aún se puede montar y explica
 * lo que no: un jugador traspasado o cortado desde que se compartió, una ronda que ya no se puede ceder o una
 * estimación de un contrato que ya tiene cifra. Si los equipos no valen (repetidos o inexistentes), null.
 * Las reglas del convenio no se miran aquí: el veredicto se calcula después con `checkTrade`.
 */
export function restoreTrade(
  data: Pick<GmData, "teams" | "players">,
  request: TradeRequest,
  /** De `trade-rules.ts` (`PICK_YEARS` e `isValidEstimate`): cambian cada verano. */
  rules: { pickYears: number[]; isValidEstimate: (salary: number) => boolean }
): RestoredTrade | null {
  const { teamIds } = request;
  const teamsById = new Map(data.teams.map((team) => [team.id, team]));
  if (teamIds.length === 0 || new Set(teamIds).size !== teamIds.length || !teamIds.every((id) => teamsById.has(id))) return null;

  const dropped: string[] = [];
  const inTrade = (teamId: number) => teamIds.includes(teamId);
  const playersById = new Map(data.players.map((player) => [player.id, player]));

  const seenPlayers = new Set<number>();
  const players = request.players.filter(({ id, to }) => {
    const player = playersById.get(id);
    if (seenPlayers.has(id)) return false;
    seenPlayers.add(id);
    if (!player) {
      dropped.push("Un jugador del traspaso ya no tiene contrato en la NBA.");
      return false;
    }
    if (!inTrade(player.teamId) || player.teamId === to) {
      const now = teamsById.get(player.teamId);
      dropped.push(now ? `${player.name} ahora juega en ${now.name}.` : `${player.name} ya no tiene contrato en la NBA.`);
      return false;
    }
    return inTrade(to);
  });

  const seenPicks = new Set<string>();
  const picks = request.picks.filter((pick) => {
    const key = `${pick.teamId}-${pick.year}-${pick.round}`;
    if (seenPicks.has(key) || !inTrade(pick.teamId) || !inTrade(pick.to) || pick.teamId === pick.to || (pick.round !== 1 && pick.round !== 2)) return false;
    seenPicks.add(key);
    if (!rules.pickYears.includes(pick.year)) {
      dropped.push(`La ${pick.round === 1 ? "1ª" : "2ª"} ronda de ${pick.year} de ${teamsById.get(pick.teamId)!.name} ya no se puede traspasar.`);
      return false;
    }
    return true;
  });

  // Solo de jugadores que siguen en el traspaso y cuyo contrato sigue sin cifra: si ya la tiene, manda la real
  const moving = new Set(players.map(({ id }) => id));
  const seenEstimates = new Set<number>();
  const estimates = (request.estimates ?? []).filter(({ id, salary }) => {
    if (seenEstimates.has(id) || !moving.has(id)) return false;
    seenEstimates.add(id);
    const player = playersById.get(id)!;
    if (player.salaryStatus !== "pending") {
      dropped.push(`El contrato de ${player.name} ya tiene cifra pública: se usa la real en vez de la estimación.`);
      return false;
    }
    if (!rules.isValidEstimate(salary)) {
      dropped.push(`La estimación del contrato de ${player.name} no era válida: vuelve a ponerla.`);
      return false;
    }
    return true;
  });

  return { request: { teamIds, players, picks, estimates }, dropped: [...new Set(dropped)] };
}
