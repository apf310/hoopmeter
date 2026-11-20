// Alta y baja del aviso matinal (Tarea 6.14). La tabla `push_subscriptions` es privada: la anon key solo
// puede llamar a push_subscribe / push_unsubscribe (backend-data/push.sql), que vuelven a validarlo todo.
// POST {id, platform, keys, hour, withScores, teamIds} · DELETE {id}
import { getSupabase } from "@/lib/supabase";
import { parseSubscriptionBody } from "@/lib/push";

const NO_STORE = { "Cache-Control": "no-store" };
const MAX_BODY = 4096;

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > MAX_BODY) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const body = parseSubscriptionBody(await readJson(request));
  if (!body) return Response.json({ error: "Suscripción no válida" }, { status: 400, headers: NO_STORE });

  const { error } = await getSupabase().rpc("push_subscribe", {
    p_id: body.id,
    p_platform: body.platform,
    p_keys: body.keys,
    p_hour: body.hour,
    p_with_scores: body.withScores,
    p_team_ids: body.teamIds,
  });
  if (error) {
    console.error("[api/push] alta", error.message);
    return Response.json({ error: "No se pudo guardar" }, { status: 502, headers: NO_STORE });
  }
  return new Response(null, { status: 204, headers: NO_STORE });
}

export async function DELETE(request: Request) {
  const body = await readJson(request);
  const id = body && typeof body === "object" && "id" in body ? (body as { id: unknown }).id : null;
  if (typeof id !== "string" || id.length === 0 || id.length > 1000) {
    return Response.json({ error: "Falta el id" }, { status: 400, headers: NO_STORE });
  }

  const { error } = await getSupabase().rpc("push_unsubscribe", { p_id: id });
  if (error) {
    console.error("[api/push] baja", error.message);
    return Response.json({ error: "No se pudo borrar" }, { status: 502, headers: NO_STORE });
  }
  return new Response(null, { status: 204, headers: NO_STORE });
}
