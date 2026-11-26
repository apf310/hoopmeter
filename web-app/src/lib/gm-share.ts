// El traspaso de un enlace compartido del GM (Tarea 6.9), tal como se puede montar hoy: lo usan la página, sus
// metadatos y la imagen del enlace (`/og/trade`, Tarea 7.9). Solo servidor.
import { buildTrade, type GmData, type GmTeam, type GmTrade } from "@/lib/gm";
import { parseTradeSearch, restoreTrade, tradeSearch, type RestoredTrade } from "@/lib/gm-link";
import { getGmData } from "@/lib/queries";
import { checkTrade, isValidEstimate, PICK_YEARS, type TradeVerdict } from "@/lib/trade-rules";

type LinkParams = Parameters<typeof parseTradeSearch>[0];

const LINK_RULES = { pickYears: PICK_YEARS, isValidEstimate };

/** Lo que el editor abre con un enlace: lo que aún se puede montar y por qué falta el resto. */
export function restoreLink(data: GmData, params: LinkParams): RestoredTrade {
  const parsed = parseTradeSearch(params);
  const restored = parsed && restoreTrade(data, parsed, LINK_RULES);
  // Con dos equipos, la última palabra la tiene `buildTrade`, la misma comprobación que hace la evaluación con IA
  if (restored && (restored.request.teamIds.length < 2 || buildTrade(data, restored.request))) return restored;
  return { request: { teamIds: [], players: [], picks: [], estimates: [] }, dropped: ["El enlace del traspaso no es válido: monta uno nuevo."] };
}

export type SharedTrade = {
  trade: GmTrade;
  /** Los equipos que mueven algo, en el orden del enlace. */
  teams: GmTeam[];
  verdict: TradeVerdict;
  /** Los parámetros del traspaso ya limpios (`?equipos=…`), sin lo que ya no se puede montar. */
  search: string;
};

/** El traspaso del enlace con su veredicto de hoy; null si no queda traspaso (enlace roto o sin activos). */
export async function getSharedTrade(params: LinkParams): Promise<SharedTrade | null> {
  const parsed = parseTradeSearch(params);
  if (!parsed) return null;
  const data = await getGmData();
  const restored = restoreTrade(data, parsed, LINK_RULES);
  const trade = restored && buildTrade(data, restored.request);
  if (!restored || !trade) return null;

  const moves = (teamId: number) =>
    trade.players.some(({ player, to }) => to === teamId || player.teamId === teamId) || trade.picks.some(({ pick, to }) => to === teamId || pick.teamId === teamId);
  const teams = trade.teams.filter((team) => moves(team.id));
  if (teams.length < 2) return null;
  return { trade, teams, verdict: checkTrade(trade, data.today), search: tradeSearch(restored.request) };
}
