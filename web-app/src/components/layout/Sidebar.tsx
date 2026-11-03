"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, isActive } from "./nav-items";
import { SpoilerModeSelector } from "./SpoilerModeSelector";
import { Wordmark } from "./Wordmark";
import { SearchTrigger } from "@/components/search/SearchCommand";

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-slate-800 bg-slate-950 md:flex">
      <div className="flex h-20 items-center border-b border-slate-800 px-6">
        <Wordmark />
      </div>
      <div className="border-b border-slate-800">
        <SpoilerModeSelector withLabel />
      </div>
      <div className="border-b border-slate-800">
        <SearchTrigger variant="sidebar" />
      </div>
      {/* usePathname es dato de URL: en rutas dinámicas debe ir dentro de <Suspense> */}
      <Suspense fallback={<SidebarLinks pathname={null} />}>
        <ActiveSidebarLinks />
      </Suspense>
    </aside>
  );
}

function ActiveSidebarLinks() {
  return <SidebarLinks pathname={usePathname()} />;
}

function SidebarLinks({ pathname }: { pathname: string | null }) {
  return (
    <nav className="flex flex-1 flex-col py-3">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname !== null && isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex items-center gap-3 px-6 py-3 font-display text-lg font-bold uppercase tracking-wide transition-colors",
              active
                ? "bg-gradient-to-r from-orange-500/15 to-transparent text-white"
                : "text-slate-400 hover:bg-slate-900 hover:text-white"
            )}
          >
            {/* Barra de acento a la izquierda en la sección activa */}
            <span
              aria-hidden
              className={cn("absolute inset-y-0 left-0 w-[3px] bg-orange-500 transition-opacity", active ? "opacity-100" : "opacity-0")}
            />
            <Icon className={cn("size-5", active && "text-orange-500")} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
