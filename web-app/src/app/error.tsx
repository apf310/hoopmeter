"use client";

import Link from "next/link";
import { useEffect } from "react";
import { reportClientError } from "@/lib/error-report-client";

/**
 * Error de una pantalla (Tarea 6.27): en español, con "Reintentar", y el aviso a `app_errors`.
 * Texto fijo: nunca enseña el mensaje del error (podría llevar datos de un partido).
 * Si trae `digest`, el fallo fue en el servidor y `instrumentation.ts` ya lo guardó con su pila.
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (!error.digest) reportClientError(error);
  }, [error]);

  return (
    <div className="-mx-4 -mt-4 flex min-h-[60vh] flex-col items-center justify-center px-4 py-16 text-center md:-mx-8 md:-mt-8">
      <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-orange-400">Algo ha fallado</p>
      <h1 className="mt-1 font-display text-5xl font-extrabold uppercase leading-none text-white">Tiempo muerto</h1>
      <p className="mt-3 max-w-md text-slate-300">
        No hemos podido cargar esta pantalla. Ya nos ha llegado el aviso; prueba otra vez en unos segundos.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="bg-orange-500 px-5 py-2.5 font-display text-base font-bold uppercase tracking-wide text-slate-950 hover:bg-orange-400"
        >
          Reintentar
        </button>
        <Link href="/" className="bg-slate-900 px-5 py-2.5 font-display text-base font-bold uppercase tracking-wide text-white ring-1 ring-inset ring-slate-700 hover:bg-slate-800">
          Ir a la jornada
        </Link>
      </div>
    </div>
  );
}
