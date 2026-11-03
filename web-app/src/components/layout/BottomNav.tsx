"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, isActive } from "./nav-items";

export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-slate-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {/* usePathname es dato de URL: en rutas dinámicas debe ir dentro de <Suspense> */}
      <Suspense fallback={<BottomNavItems pathname={null} />}>
        <ActiveBottomNavItems />
      </Suspense>
    </nav>
  );
}

function ActiveBottomNavItems() {
  return <BottomNavItems pathname={usePathname()} />;
}

function BottomNavItems({ pathname }: { pathname: string | null }) {
  return (
    <ul className="flex items-stretch justify-around">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname !== null && isActive(pathname, href);
        return (
          <li key={href} className="flex-1">
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex flex-col items-center gap-1 pb-2 pt-2.5 font-display text-[11px] font-bold uppercase tracking-wider transition-colors",
                active ? "text-white" : "text-slate-400 hover:text-white"
              )}
            >
              {/* Barra de acento superior en la sección activa */}
              <span
                aria-hidden
                className={cn(
                  "absolute inset-x-3 -top-px h-[3px] bg-orange-500 transition-opacity",
                  active ? "opacity-100" : "opacity-0"
                )}
              />
              <Icon className={cn("size-5", active && "text-orange-500")} />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
