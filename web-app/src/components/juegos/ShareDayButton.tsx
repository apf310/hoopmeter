"use client";

import { useEffect, useState } from "react";
import { Check, Share2 } from "lucide-react";
import { shareText, type ChallengeResult } from "@/lib/games";
import { isNativeApp, shareTextNatively } from "@/lib/native";
import { cn } from "@/lib/utils";

/**
 * Comparte el día en emojis (Tarea 8.1): menú de compartir en el móvil y copiar en el escritorio (como el enlace del
 * GM). Solo el icono, con `aria-label` y *tooltip*. Nunca lleva la solución.
 */
export function ShareDayButton({ day, results, streakDays }: { day: string; results: ChallengeResult[]; streakDays: number }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  useEffect(() => {
    if (status === "idle") return;
    const timer = setTimeout(() => setStatus("idle"), 2500);
    return () => clearTimeout(timer);
  }, [status]);

  async function share() {
    const text = shareText({ day, results, streakDays, url: `${window.location.origin}/juegos` });
    try {
      if (isNativeApp()) return await shareTextNatively(text);
      if (navigator.share && window.matchMedia("(pointer: coarse)").matches) return await navigator.share({ text });
      await navigator.clipboard.writeText(text);
      setStatus("copied");
    } catch (error) {
      // Cerrar el menú de compartir sin elegir nada no es un fallo
      if (!(error instanceof DOMException && error.name === "AbortError")) setStatus("error");
    }
  }

  return (
    <span className="flex shrink-0 items-center gap-2">
      <span role="status" className={cn("text-xs", status === "error" ? "text-red-300" : "text-emerald-300")}>
        {status === "copied" ? "Copiado" : status === "error" ? "No se pudo copiar" : ""}
      </span>
      <button
        type="button"
        onClick={share}
        aria-label="Compartir resultado"
        title="Compartir resultado"
        className="inline-flex size-11.5 items-center justify-center border border-white/25 bg-slate-950/60 text-white outline-none transition-colors hover:border-orange-500 hover:bg-orange-500 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-orange-400 md:size-10"
      >
        {status === "copied" ? <Check className="size-5 text-emerald-400" /> : <Share2 className="size-5" />}
      </button>
    </span>
  );
}
