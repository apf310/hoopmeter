"use client";

import Link from "next/link";
import { Bell, BellRing } from "lucide-react";
import { usePushState } from "@/lib/push-store";
import { cn } from "@/lib/utils";

/** Acceso a "Aviso de la mañana" (Tarea 6.14), junto al botón de compartir de la portada. */
export function PushBell({ className }: { className?: string }) {
  const { enabled } = usePushState();
  const Icon = enabled ? BellRing : Bell;
  return (
    <Link
      href="/avisos"
      aria-label={enabled ? "Aviso de la mañana: activado" : "Aviso de la mañana"}
      title="Aviso de la mañana"
      className={cn(
        "relative inline-flex size-10 items-center justify-center border border-white/25 bg-slate-950/60 text-white outline-none transition-colors hover:border-orange-500 hover:bg-orange-500 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-orange-400",
        className
      )}
    >
      <Icon className="size-5" />
      {enabled && <span aria-hidden className="absolute right-1.5 top-1.5 size-2 bg-orange-500" />}
    </Link>
  );
}
