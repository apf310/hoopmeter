"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

/**
 * Visitas con Vercel Web Analytics (Tarea 6.27): sin cookies ni nada guardado en el dispositivo; Vercel
 * cuenta visitantes con un hash de la petición que cambia cada día. Solo se envía la ruta: los parámetros
 * (filtros, traspasos del GM, `?aviso=1`) se quitan antes de salir del navegador.
 */
function stripQuery(event: BeforeSendEvent): BeforeSendEvent {
  try {
    const url = new URL(event.url);
    url.search = "";
    url.hash = "";
    return { ...event, url: url.toString() };
  } catch {
    return event;
  }
}

export function AppAnalytics() {
  return <Analytics beforeSend={stripQuery} />;
}
