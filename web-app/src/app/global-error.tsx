"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/error-report-client";

/**
 * Último recurso (Tarea 6.27): falla el propio layout, así que no hay ni estilos ni contexto de spoilers.
 * Página mínima con estilos en línea y texto fijo; el aviso va a `app_errors` como en `error.tsx`.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (!error.digest) reportClientError(error);
  }, [error]);

  return (
    <html lang="es">
      <body style={{ margin: 0, minHeight: "100vh", background: "#020617", color: "#f1f5f9", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ display: "flex", minHeight: "100vh", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16, textAlign: "center" }}>
          <p style={{ margin: 0, color: "#fb923c", fontSize: 12, fontWeight: 600, letterSpacing: "0.3em", textTransform: "uppercase" }}>
            Algo ha fallado
          </p>
          <h1 style={{ margin: "4px 0 0", fontSize: 40, fontWeight: 800, textTransform: "uppercase" }}>Tiempo muerto</h1>
          <p style={{ maxWidth: 420, color: "#cbd5e1" }}>Hoopmeter no ha podido arrancar. Ya nos ha llegado el aviso.</p>
          <button
            type="button"
            onClick={reset}
            style={{ marginTop: 16, border: 0, background: "#f97316", color: "#020617", padding: "10px 20px", fontWeight: 700, textTransform: "uppercase", cursor: "pointer" }}
          >
            Reintentar
          </button>
        </main>
      </body>
    </html>
  );
}
