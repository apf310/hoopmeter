"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, BellRing } from "lucide-react";
import { usePushState } from "@/lib/push-store";
import { cn } from "@/lib/utils";

/** Con la sección activa marcada. usePathname es dato de URL: la Sidebar lo pone dentro de <Suspense>. */
export function ActiveSidebarPushLink() {
  return <SidebarPushLink active={usePathname() === "/avisos"} />;
}

/** "Aviso de la mañana" en la Sidebar (escritorio), bajo las secciones y junto a Qué ver. En móvil: la campana de la portada. */
export function SidebarPushLink({ active }: { active: boolean }) {
  const { enabled } = usePushState();
  const Icon = enabled ? BellRing : Bell;
  return (
    <Link
      href="/avisos"
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex shrink-0 items-center gap-3 px-6 py-3 font-display text-base font-bold uppercase tracking-wide transition-colors",
        active ? "bg-gradient-to-r from-orange-500/15 to-transparent text-white" : "text-slate-400 hover:bg-slate-900 hover:text-white"
      )}
    >
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-[3px] bg-orange-500 transition-opacity", active ? "opacity-100" : "opacity-0")} />
      <Icon className={cn("size-5", (active || enabled) && "text-orange-500")} />
      Aviso de la mañana
    </Link>
  );
}
