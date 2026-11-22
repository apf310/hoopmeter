// Guarda un error en Supabase (Tarea 6.27): solo servidor (`/api/errors` y `instrumentation.ts`).
// La tabla `app_errors` es privada; la anon key solo puede llamar a `report_app_error` (backend-data/errors.sql),
// que agrupa, recorta y pone un tope diario. Con `fetch` y no supabase-js: funciona en Node y en Edge.
// Nunca lanza ni espera más de 3 s: un aviso de error no puede romper ni frenar una respuesta.
import type { ErrorReport, ErrorSource } from "./error-report";

const TIMEOUT_MS = 3000;

/** Solo producción: ni `next dev` ni las vistas previas de Vercel llenan la tabla. */
export function errorReportingEnabled(): boolean {
  if (process.env.NODE_ENV !== "production") return false;
  const vercelEnv = process.env.VERCEL_ENV;
  return vercelEnv === undefined || vercelEnv === "production";
}

export async function saveAppError(source: ErrorSource, report: ErrorReport): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey || !errorReportingEnabled()) return;
  try {
    const response = await fetch(`${url}/rest/v1/rpc/report_app_error`, {
      method: "POST",
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        p_source: source,
        p_message: report.message,
        p_stack: report.stack,
        p_path: report.path,
        p_digest: report.digest,
        p_agent: report.agent,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) console.error("[app-errors] no guardado", response.status);
  } catch (error) {
    console.error("[app-errors] no guardado", error instanceof Error ? error.message : error);
  }
}
