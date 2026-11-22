// Errores del servidor en producción (Tarea 6.27): páginas, rutas API y acciones que fallan.
// Se guardan en `app_errors` con la pila del servidor y el `digest` que ve el navegador (`error.tsx`).
// La ruta va sin parámetros (`normalizePath`); nunca la IP ni las cabeceras.
import type { Instrumentation } from "next";
import { saveAppError } from "@/lib/app-errors";
import { buildReport, describeError } from "@/lib/error-report";

export const onRequestError: Instrumentation.onRequestError = async (error, request) => {
  const { message, stack } = describeError(error);
  const digest = error && typeof error === "object" && "digest" in error ? (error as { digest: unknown }).digest : null;
  const report = buildReport({ message, stack, path: request.path, digest });
  if (report) await saveAppError("web-server", report);
};
