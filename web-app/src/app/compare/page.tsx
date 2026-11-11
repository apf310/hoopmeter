import { Suspense } from "react";
import type { Metadata } from "next";
import { CompareView } from "@/components/compare/CompareView";
import { BRAND } from "@/lib/brand";
import { getDuelPlayer } from "@/lib/compare-data";

export const metadata: Metadata = {
  title: `Comparador · ${BRAND.name}`,
  description: "Enfrenta a dos jugadores de cualquier época: radares superpuestos, estadísticas y palmarés.",
};

async function loadPlayer(id: string | string[] | undefined) {
  const playerId = Number(id);
  return Number.isInteger(playerId) && playerId > 0 ? getDuelPlayer(playerId) : null;
}

export default function ComparePage({ searchParams }: PageProps<"/compare">) {
  return (
    // Márgenes negativos: el comparador ocupa todo el ancho del área de contenido
    <div className="-mx-4 -mt-4 md:-mx-8 md:-mt-8">
      <header className="border-b border-slate-800 px-4 pb-5 pt-6 md:px-8 md:pt-10">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-orange-400">Cara a cara</p>
        <h1 className="font-display text-5xl font-extrabold uppercase leading-none text-white md:text-6xl">Comparador</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-300">Enfrenta a dos jugadores de cualquier época, temporada contra temporada o carrera contra carrera.</p>
      </header>
      <Suspense fallback={<CompareSkeleton />}>
        <CompareContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function CompareContent({ searchParams }: { searchParams: PageProps<"/compare">["searchParams"] }) {
  const { a, b } = await searchParams;
  const [playerA, playerB] = await Promise.all([loadPlayer(a), loadPlayer(b)]);
  return <CompareView a={playerA} b={playerB} />;
}

function CompareSkeleton() {
  return (
    <div className="animate-pulse" aria-busy>
      <div className="grid h-[300px] grid-cols-2 gap-px border-b border-slate-800 md:h-[380px]">
        <div className="bg-slate-900" />
        <div className="bg-slate-900" />
      </div>
      <div className="m-4 h-96 bg-slate-900/60 md:m-8" />
    </div>
  );
}
