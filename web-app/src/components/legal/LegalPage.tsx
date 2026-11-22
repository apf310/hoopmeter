import type { ReactNode } from "react";
import Link from "next/link";
import { formatLegalDate, LEGAL_PAGES, LEGAL_UPDATED } from "@/lib/legal";
import { cn } from "@/lib/utils";

/** Marco de las páginas legales (Tarea 6.26): cabecera de una franja, secciones a todo el ancho y pestañas entre ellas. */
export function LegalPage({ kicker, title, path, children }: { kicker: string; title: string; path: string; children: ReactNode }) {
  return (
    // Márgenes negativos: la página ocupa todo el ancho del área de contenido
    <div className="-mx-4 -mt-4 md:-mx-8 md:-mt-8">
      <header className="border-b border-slate-800 px-4 pb-3 pt-4 md:px-8 md:pb-5 md:pt-10">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-orange-400">{kicker}</p>
        <h1 className="font-display text-4xl font-extrabold uppercase leading-tight text-white md:text-6xl">{title}</h1>
        <p className="mt-1 text-sm text-slate-400">Última actualización: {formatLegalDate(LEGAL_UPDATED)}</p>
      </header>
      <nav aria-label="Páginas legales" className="flex overflow-x-auto border-b border-slate-800 px-1 md:px-5">
        {LEGAL_PAGES.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            aria-current={href === path ? "page" : undefined}
            className={cn(
              "relative shrink-0 px-3 py-3 font-display text-sm font-bold uppercase tracking-wide",
              href === path ? "text-white" : "text-slate-400 hover:text-white"
            )}
          >
            {label}
            {href === path && <span aria-hidden className="absolute inset-x-3 bottom-0 h-[3px] bg-orange-500" />}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}

/** Una sección del texto: título en Barlow y cuerpo en Geist con ancho de lectura. */
export function LegalSection({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 border-b border-slate-800 px-4 py-5 md:px-8 md:py-7">
      <h2 className="font-display text-2xl font-extrabold uppercase leading-tight text-white">{title}</h2>
      <div className="mt-2 max-w-3xl space-y-3 text-[15px] leading-relaxed text-slate-300 [&_a]:text-orange-400 [&_a]:underline-offset-2 hover:[&_a]:underline [&_li]:pl-1 [&_strong]:font-semibold [&_strong]:text-white [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}
