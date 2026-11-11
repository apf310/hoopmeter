// Evaluación de un traspaso con IA. El servidor reconstruye el traspaso a partir de los ids y lo
// revalida: nunca se fía de salarios ni veredictos del cliente, y uno ilegal no gasta cuota de IA.
// Única excepción: la estimación de un contrato aún sin cifra pública, que `buildTrade` solo acepta
// para esos jugadores y dentro del rango legal del convenio.
import { buildTrade, canonicalTrade, MAX_TEAMS, type TradeRequest } from "@/lib/gm";
import { getGmData } from "@/lib/queries";
import { evaluateTrade } from "@/lib/trade-evaluation";
import { checkTrade } from "@/lib/trade-rules";

const MAX_ASSETS = 20;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 5;
const MAX_TRACKED_CLIENTS = 1000;

const recentRequests = new Map<string, number[]>();

/** Límite por IP para proteger la cuota de Gemini. En serverless, cada instancia lleva su propia cuenta. */
function isRateLimited(client: string): boolean {
  const now = Date.now();
  const recent = (recentRequests.get(client) ?? []).filter((time) => now - time < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS_PER_WINDOW) return true;
  if (recentRequests.size >= MAX_TRACKED_CLIENTS) recentRequests.clear();
  recentRequests.set(client, [...recent, now]);
  return false;
}

const isInteger = (value: unknown) => Number.isInteger(value);

function isTradeRequest(value: unknown): value is TradeRequest {
  const body = value as Partial<TradeRequest> | null;
  return (
    Array.isArray(body?.teamIds) &&
    body.teamIds.length <= MAX_TEAMS &&
    body.teamIds.every(isInteger) &&
    Array.isArray(body.players) &&
    body.players.length <= MAX_ASSETS &&
    body.players.every((player) => isInteger(player?.id) && isInteger(player?.to)) &&
    Array.isArray(body.picks) &&
    body.picks.length <= MAX_ASSETS &&
    body.picks.every((pick) => isInteger(pick?.teamId) && isInteger(pick?.year) && isInteger(pick?.round) && isInteger(pick?.to)) &&
    (body.estimates === undefined ||
      (Array.isArray(body.estimates) &&
        body.estimates.length <= MAX_ASSETS &&
        body.estimates.every((estimate) => isInteger(estimate?.id) && isInteger(estimate?.salary))))
  );
}

export async function POST(request: Request) {
  const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (isRateLimited(client)) {
    return Response.json({ error: "Demasiadas evaluaciones seguidas: espera un minuto." }, { status: 429 });
  }

  const body: unknown = await request.json().catch(() => null);
  if (!isTradeRequest(body)) return Response.json({ error: "Traspaso no válido" }, { status: 400 });

  const data = await getGmData();
  const trade = buildTrade(data, body);
  if (!trade) return Response.json({ error: "Traspaso no válido" }, { status: 400 });

  const { status } = checkTrade(trade, data.today);
  if (status === "empty" || status === "invalid") {
    return Response.json({ error: "Solo se evalúan traspasos que cumplen el convenio." }, { status: 422 });
  }

  try {
    return Response.json({ evaluation: await evaluateTrade(canonicalTrade(body)) });
  } catch (error) {
    console.error("[api/gm/evaluate]", error);
    return Response.json({ error: "La IA no está disponible ahora mismo. Inténtalo en unos minutos." }, { status: 503 });
  }
}
