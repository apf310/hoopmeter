// Errores del navegador (Tarea 6.27): POST {message, stack, path, digest, agent} desde `error-report-client.ts`.
// Se limpia todo otra vez aquí (`parseErrorBody`) y la IP solo cuenta peticiones en memoria durante un minuto:
// nunca se guarda. Responde 204 siempre que el cuerpo sea válido, aunque no se llegue a guardar.
import { saveAppError } from "@/lib/app-errors";
import { parseErrorBody } from "@/lib/error-report";

const NO_STORE = { "Cache-Control": "no-store" };
const MAX_BODY = 12_000;
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;

const recent = new Map<string, number[]>();

function isRateLimited(client: string): boolean {
  const now = Date.now();
  const hits = (recent.get(client) ?? []).filter((at) => now - at < WINDOW_MS);
  hits.push(now);
  recent.set(client, hits);
  if (recent.size > 5000) {
    for (const [key, times] of recent) if (times.every((at) => now - at >= WINDOW_MS)) recent.delete(key);
  }
  return hits.length > MAX_PER_WINDOW;
}

export async function POST(request: Request) {
  const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (isRateLimited(client)) return new Response(null, { status: 429, headers: NO_STORE });

  const text = await request.text().catch(() => "");
  if (text.length > MAX_BODY) return new Response(null, { status: 413, headers: NO_STORE });
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    // sigue: parseErrorBody(null) da 400
  }
  const report = parseErrorBody(body);
  if (!report) return new Response(null, { status: 400, headers: NO_STORE });

  await saveAppError("web-client", report);
  return new Response(null, { status: 204, headers: NO_STORE });
}
