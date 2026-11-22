import Link from "next/link";
import { LEGAL_PAGES, NBA_DISCLAIMER } from "@/lib/legal";

/** Pie de todas las páginas (Tarea 6.26): páginas legales y aviso de no afiliación a la NBA. */
export function SiteFooter() {
  return (
    <footer className="border-t border-slate-800 px-4 py-5 text-xs text-slate-500 md:px-8">
      <nav aria-label="Información legal" className="flex flex-wrap gap-x-1">
        {LEGAL_PAGES.map(({ href, label }) => (
          // Zona táctil de 40 px sin que el pie ocupe más
          <Link key={href} href={href} className="-my-2 px-2 py-2 font-medium text-slate-400 first:-ml-2 hover:text-white">
            {label}
          </Link>
        ))}
      </nav>
      <p className="mt-2 max-w-3xl leading-relaxed">{NBA_DISCLAIMER}</p>
    </footer>
  );
}
