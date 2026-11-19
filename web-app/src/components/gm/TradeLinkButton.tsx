"use client";

import { useEffect, useState } from "react";
import { Check, Link2 } from "lucide-react";
import { isNativeApp, shareLinkNatively } from "@/lib/native";
import { cn } from "@/lib/utils";

/**
 * Comparte el enlace del traspaso (Tarea 6.9): menú de compartir en el móvil y copiar en el escritorio.
 * Mismo aspecto que el botón de compartir imagen: solo el icono, con `aria-label` y *tooltip*.
 */
export function TradeLinkButton({ search, title }: { search: string; title: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  useEffect(() => {
    if (status === "idle") return;
    const timer = setTimeout(() => setStatus("idle"), 2500);
    return () => clearTimeout(timer);
  }, [status]);

  async function share() {
    const url = `${window.location.origin}${window.location.pathname}${search}`;
    try {
      if (isNativeApp()) return await shareLinkNatively(url, title);
      // En el escritorio el menú del sistema estorba: se copia y listo
      if (navigator.share && window.matchMedia("(pointer: coarse)").matches) return await navigator.share({ title, url });
      await navigator.clipboard.writeText(url);
      setStatus("copied");
    } catch (error) {
      // Cerrar el menú de compartir sin elegir nada no es un fallo
      if (!(error instanceof DOMException && error.name === "AbortError")) setStatus("error");
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={share}
        aria-label={`Compartir enlace: ${title}`}
        title="Compartir enlace"
        className="inline-flex size-10 items-center justify-center border border-white/25 bg-slate-950/60 text-white outline-none transition-colors hover:border-orange-500 hover:bg-orange-500 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-orange-400"
      >
        {status === "copied" ? <Check className="size-5 text-emerald-400" /> : <Link2 className="size-5" />}
      </button>
      <span role="status" className={cn("text-xs", status === "error" ? "text-red-300" : "text-emerald-300")}>
        {status === "copied" ? "Enlace copiado" : status === "error" ? "No se pudo copiar el enlace" : ""}
      </span>
    </span>
  );
}
