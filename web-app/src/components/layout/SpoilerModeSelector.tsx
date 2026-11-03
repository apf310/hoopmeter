"use client";

import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSpoiler } from "@/context/SpoilerContext";

type SpoilerModeSelectorProps = {
  /** Muestra el estado en texto junto al interruptor (toda la fila es pulsable). */
  withLabel?: boolean;
  className?: string;
};

/** Interruptor deslizante: izquierda = Cero Spoilers (Nivel 1), derecha = Con Spoilers (Nivel 3). */
export function SpoilerModeSelector({ withLabel = false, className }: SpoilerModeSelectorProps) {
  const { spoilerMode, toggleSpoilerMode } = useSpoiler();
  const full = spoilerMode === "FULL";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={full}
      aria-label="Mostrar spoilers"
      title={full ? "Ocultar spoilers" : "Mostrar spoilers"}
      onClick={toggleSpoilerMode}
      className={cn(
        "group flex items-center gap-3 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
        withLabel && "w-full justify-between rounded-none px-6 py-3 transition-colors hover:bg-slate-900",
        className
      )}
    >
      {withLabel && (
        <span aria-hidden className="flex flex-col items-start leading-tight">
          <span className="font-display text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">Spoilers</span>
          <span
            className={cn(
              "font-display text-lg font-bold uppercase leading-tight transition-colors",
              full ? "text-orange-400" : "text-emerald-400"
            )}
          >
            {full ? "Visibles" : "Ocultos"}
          </span>
        </span>
      )}

      {/* Pista: 72px de ancho, 4px de padding → la bola (28px) recorre 36px */}
      <span
        aria-hidden
        className={cn(
          "relative inline-flex h-9 w-18 shrink-0 items-center rounded-full bg-slate-950 p-1 ring-1 ring-inset transition-colors duration-300",
          full ? "ring-orange-500/40" : "ring-emerald-500/40"
        )}
      >
        <span
          className={cn(
            "absolute top-1 left-1 size-7 rounded-full transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none",
            full
              ? "translate-x-9 bg-orange-500 shadow-[0_0_14px] shadow-orange-500/50"
              : "translate-x-0 bg-emerald-500 shadow-[0_0_14px] shadow-emerald-500/50"
          )}
        />
        <span className="relative flex w-full justify-between">
          <span className="flex size-7 items-center justify-center">
            <EyeOff
              className={cn(
                "size-4 transition-colors duration-300",
                full ? "text-slate-500" : "text-slate-950"
              )}
            />
          </span>
          <span className="flex size-7 items-center justify-center">
            <Eye
              className={cn(
                "size-4 transition-colors duration-300",
                full ? "text-slate-950" : "text-slate-500"
              )}
            />
          </span>
        </span>
      </span>
    </button>
  );
}
