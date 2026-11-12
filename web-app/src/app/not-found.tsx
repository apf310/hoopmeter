import Link from "next/link";
import { LogoMark } from "@/components/layout/LogoMark";

/** Página 404 propia: en español y con la marca, en vez de la de Next.js en inglés. */
export default function NotFound() {
  return (
    <div className="-mx-4 -mt-4 flex min-h-[60vh] flex-col items-center justify-center px-4 py-16 text-center md:-mx-8 md:-mt-8">
      <LogoMark className="size-24" />
      <p className="mt-6 font-display text-xs font-semibold uppercase tracking-[0.3em] text-orange-400">Error 404</p>
      <h1 className="mt-1 font-display text-5xl font-extrabold uppercase leading-none text-white">Fuera de la pista</h1>
      <p className="mt-3 max-w-md text-slate-300">Esta página no existe o se ha movido. Puede que el enlace esté mal escrito.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/" className="bg-orange-500 px-5 py-2.5 font-display text-base font-bold uppercase tracking-wide text-slate-950 hover:bg-orange-400">
          Ir a la jornada
        </Link>
        <Link href="/players" className="bg-slate-900 px-5 py-2.5 font-display text-base font-bold uppercase tracking-wide text-white ring-1 ring-inset ring-slate-700 hover:bg-slate-800">
          Buscar un jugador
        </Link>
      </div>
    </div>
  );
}
