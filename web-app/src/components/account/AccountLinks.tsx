"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, UserRound } from "lucide-react";
import { useAccount, type AccountState } from "@/lib/account-store";
import { sidebarSection } from "@/lib/nav";
import { cn } from "@/lib/utils";

/** Con la sección activa marcada. usePathname es dato de URL: la Sidebar lo pone dentro de <Suspense>. */
export function ActiveSidebarAccountLink() {
  return <SidebarAccountLink active={sidebarSection(usePathname()) === "/cuenta"} />;
}

/** "Tu cuenta" (o tu alias) en la Sidebar, junto a Qué ver y el aviso (Tarea 8.5). En móvil se llega desde Juegos. */
export function SidebarAccountLink({ active }: { active: boolean }) {
  const account = useAccount();
  const alias = account.status === "ready" ? `@${account.account.alias}` : null;
  return (
    <Link
      href="/cuenta"
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-3 px-6 py-3 font-display text-base font-bold uppercase tracking-wide transition-colors",
        active ? "bg-gradient-to-r from-orange-500/15 to-transparent text-white" : "text-slate-400 hover:bg-slate-900 hover:text-white"
      )}
    >
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-[3px] bg-orange-500 transition-opacity", active ? "opacity-100" : "opacity-0")} />
      <UserRound aria-hidden className={cn("size-5 shrink-0", (active || alias) && "text-orange-500")} />
      <span className={cn("min-w-0 truncate", alias && "normal-case")}>{alias ?? "Tu cuenta"}</span>
    </Link>
  );
}

const LINE: Record<Exclude<AccountState["status"], "unknown" | "loading">, { title: (state: AccountState) => string; text: string }> = {
  "signed-out": { title: () => "Tu cuenta", text: "guarda tu ELO y tu racha" },
  "needs-alias": { title: () => "Tu cuenta", text: "elige tu alias para terminarla" },
  ready: { title: (s) => (s.status === "ready" ? `@${s.account.alias}` : ""), text: "tus retos se guardan en tu cuenta" },
  unavailable: { title: () => "Tu cuenta", text: "sin conexión ahora mismo" },
};

/** La línea de la cuenta en `/juegos` (sustituye a "Clasificación · llega con las cuentas"): mismo alto en cualquier estado. */
export function GamesAccountLine() {
  const account = useAccount();
  const line = account.status === "unknown" || account.status === "loading" ? null : LINE[account.status];
  return (
    <Link
      href="/cuenta?volver=/juegos"
      className="flex min-h-12 items-center gap-2 border-b border-slate-800 px-4 py-3 text-sm text-slate-400 outline-none transition-colors hover:bg-slate-900/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-400 md:px-8"
    >
      <UserRound aria-hidden className={cn("size-4 shrink-0", account.status === "ready" ? "text-orange-400" : "text-slate-500")} />
      {line ? (
        <span className="min-w-0 flex-1 truncate">
          <strong className={cn("font-display text-base font-bold tracking-wide text-slate-300", account.status !== "ready" && "uppercase")}>
            {line.title(account)}
          </strong>{" "}
          · {line.text}
        </span>
      ) : (
        <span aria-hidden className="h-4 flex-1 animate-pulse bg-slate-900/70" />
      )}
      <ChevronRight aria-hidden className="size-4 shrink-0 text-slate-500" />
    </Link>
  );
}
