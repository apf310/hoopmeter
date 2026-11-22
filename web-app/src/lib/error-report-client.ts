"use client";
// Envía un error del navegador a `/api/errors` (Tarea 6.27). Como mucho 5 por página abierta y cada fallo
// una sola vez: un bucle que falla sin parar no satura ni la red del usuario ni la tabla.
import { buildReport, coarseAgent, describeError } from "./error-report";
import { isNativeApp } from "./native";

const MAX_PER_PAGE = 5;
const sent = new Set<string>();

export function reportClientError(error: unknown, extra: { digest?: string; stack?: string | null } = {}): void {
  if (process.env.NODE_ENV !== "production" || typeof window === "undefined") return;
  if (sent.size >= MAX_PER_PAGE) return;
  const described = describeError(error);
  const report = buildReport({
    message: described.message,
    stack: extra.stack ?? described.stack,
    path: window.location.pathname,
    digest: extra.digest,
    agent: coarseAgent(navigator.userAgent, isNativeApp()),
  });
  if (!report) return;
  const key = `${report.message}|${report.path}`;
  if (sent.has(key)) return;
  sent.add(key);

  const body = JSON.stringify(report);
  try {
    // sendBeacon sigue aunque la página se cierre justo después del fallo
    if (navigator.sendBeacon?.("/api/errors", new Blob([body], { type: "application/json" }))) return;
  } catch {
    // sigue con fetch
  }
  fetch("/api/errors", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(
    () => undefined
  );
}
