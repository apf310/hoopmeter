"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Eye, EyeOff, Star, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { announceLevelIntent, useSpoiler } from "@/context/SpoilerContext";
import type { SpoilerLevel } from "@/lib/spoilers";

/** Tiempo que hay que mantener pulsado "Resultados" para ver spoilers. */
const HOLD_MS = 1000;
const HINT_MS = 2200;

const LEVELS: { level: SpoilerLevel; short: string; label: string; icon: LucideIcon }[] = [
  { level: 1, short: "Ocultar", label: "Todo oculto", icon: EyeOff },
  { level: 2, short: "Nota", label: "Solo nota", icon: Star },
  { level: 3, short: "Resultados", label: "Resultados visibles", icon: Eye },
];

type SpoilerModeSelectorProps = {
  /** Versión Sidebar: antetítulo + estado en texto y segmentos con nombre. */
  withLabel?: boolean;
  className?: string;
};

/**
 * Selector de 3 niveles. Proteger más (→ 1 o 2) es un toque; ver resultados (→ 3) exige
 * mantener pulsado HOLD_MS, así un toque accidental o un roce al hacer scroll nunca destripa nada.
 */
export function SpoilerModeSelector({ withLabel = false, className }: SpoilerModeSelectorProps) {
  const { spoilerLevel, setSpoilerLevel } = useSpoiler();
  const hold = useHoldToConfirm(() => setSpoilerLevel(3), () => announceLevelIntent(3));
  const current = LEVELS.find((l) => l.level === spoilerLevel) ?? LEVELS[0];
  const spoilers = spoilerLevel === 3;

  return (
    <div className={cn("relative", withLabel && "px-6 py-3", className)}>
      {withLabel && (
        <div className="mb-2 flex items-baseline justify-between">
          <span className="font-display text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">Spoilers</span>
          <span
            className={cn(
              "font-display text-base font-bold uppercase leading-none transition-colors",
              spoilers ? "text-orange-400" : "text-emerald-400"
            )}
          >
            {current.label}
          </span>
        </div>
      )}

      <div
        role="radiogroup"
        aria-label="Nivel de spoilers"
        className={cn(
          "flex rounded-full bg-slate-950 p-1 ring-1 ring-inset transition-colors duration-300",
          spoilers ? "ring-orange-500/40" : "ring-emerald-500/40"
        )}
      >
        {LEVELS.map(({ level, short, label, icon: Icon }) => {
          const active = level === spoilerLevel;
          const needsHold = level === 3 && !active;
          return (
            <button
              key={level}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={needsHold ? `${label} (mantén pulsado)` : label}
              title={needsHold ? "Mantén pulsado para ver resultados" : label}
              onClick={needsHold ? undefined : () => setSpoilerLevel(level)}
              onPointerEnter={() => announceLevelIntent(level)}
              onPointerDownCapture={() => announceLevelIntent(level)}
              {...(needsHold ? hold.handlers : {})}
              className={cn(
                "relative flex flex-1 touch-manipulation select-none items-center justify-center gap-1.5 overflow-hidden rounded-full outline-none transition-colors duration-300 [-webkit-touch-callout:none]",
                "focus-visible:ring-2 focus-visible:ring-orange-400",
                withLabel ? "h-8 px-2" : "h-7 w-9",
                active
                  ? level === 3
                    ? "bg-orange-500 text-slate-950 shadow-[0_0_14px] shadow-orange-500/50"
                    : "bg-emerald-500 text-slate-950 shadow-[0_0_14px] shadow-emerald-500/50"
                  : "text-slate-500 hover:text-slate-200"
              )}
            >
              {/* Relleno de progreso mientras se mantiene pulsado */}
              {needsHold && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-0 origin-left bg-orange-500/45 ease-linear motion-reduce:transition-none",
                    hold.holding ? "scale-x-100 transition-transform duration-1000" : "scale-x-0 transition-transform duration-150"
                  )}
                />
              )}
              <Icon className="relative size-4" />
              {withLabel && <span className="relative font-display text-xs font-bold uppercase tracking-wide">{short}</span>}
            </button>
          );
        })}
      </div>

      <p
        aria-live="polite"
        className={cn(
          "pointer-events-none whitespace-nowrap text-xs font-medium text-orange-300 transition-opacity",
          withLabel ? "mt-2 text-center" : "absolute right-0 top-full z-30 mt-2 rounded-md bg-slate-800 px-2.5 py-1.5 shadow-lg",
          hold.hint ? "opacity-100" : "opacity-0"
        )}
      >
        {hold.hint ? "Mantén pulsado para ver resultados" : ""}
      </p>
    </div>
  );
}

/** Pulsación larga: confirma tras HOLD_MS; si se suelta antes, cancela y muestra la pista. */
function useHoldToConfirm(onConfirm: () => void, onStart: () => void) {
  const [holding, setHolding] = useState(false);
  const [hint, setHint] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (hintTimer.current) clearTimeout(hintTimer.current);
    },
    []
  );

  const start = () => {
    if (timer.current) return;
    setHint(false);
    setHolding(true);
    onStart();
    timer.current = setTimeout(() => {
      timer.current = null;
      setHolding(false);
      navigator.vibrate?.(25);
      onConfirm();
    }, HOLD_MS);
  };

  // Soltar, salir del botón o empezar a hacer scroll (pointercancel) antes de tiempo: no pasa nada
  const cancel = () => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
    setHint(true);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(false), HINT_MS);
  };

  const isHoldKey = (e: KeyboardEvent) => e.key === "Enter" || e.key === " ";

  return {
    holding,
    hint,
    handlers: {
      onPointerDown: (e: PointerEvent) => {
        if (e.button === 0) start();
      },
      onPointerUp: cancel,
      onPointerLeave: cancel,
      onPointerCancel: cancel,
      onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
      onKeyDown: (e: KeyboardEvent) => {
        if (!isHoldKey(e)) return;
        e.preventDefault();
        if (!e.repeat) start();
      },
      onKeyUp: (e: KeyboardEvent) => {
        if (isHoldKey(e)) cancel();
      },
    },
  };
}
