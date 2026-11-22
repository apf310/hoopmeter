"use client";

import { useState } from "react";
import { Check, Trash2 } from "lucide-react";
import { clearRecentSearches } from "@/components/search/SearchCommand";
import { clearFavorites } from "@/lib/favorites-store";
import { forgetPush } from "@/lib/push-store";

/**
 * "Borrar los datos de este dispositivo" (Tarea 6.26): da de baja el aviso de la mañana (el servidor borra
 * la suscripción) y quita favoritos, cookie y búsquedas recientes. El nivel de spoilers no se toca: vive en
 * sessionStorage y ya vuelve solo a "Todo oculto". Sin confirmación: no hay nada que no se pueda volver a elegir.
 */
export function DeleteDeviceData() {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");

  async function run() {
    setState("busy");
    clearFavorites();
    clearRecentSearches();
    await forgetPush().catch(() => null);
    setState("done");
  }

  return (
    <div className="flex flex-wrap items-center gap-3 pt-1">
      <button
        type="button"
        onClick={run}
        disabled={state === "busy"}
        className="inline-flex h-11.5 items-center gap-2 bg-slate-900 px-4 font-display text-base font-bold uppercase tracking-wide text-white ring-1 ring-inset ring-slate-700 hover:bg-slate-800 disabled:opacity-60"
      >
        <Trash2 className="size-4.5 text-red-400" aria-hidden />
        Borrar los datos de este dispositivo
      </button>
      <p role="status" className="text-sm text-slate-400">
        {state === "done" && (
          <span className="inline-flex items-center gap-1.5 text-emerald-400">
            <Check className="size-4" aria-hidden />
            Hecho: sin favoritos, sin búsquedas y sin aviso.
          </span>
        )}
      </p>
    </div>
  );
}
