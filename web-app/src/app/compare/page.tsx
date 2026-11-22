import { Suspense } from "react";
import type { Metadata } from "next";
import { CompareLoading, CompareView } from "@/components/compare/CompareView";
import { getDuelPlayer } from "@/lib/compare-data";
import { getPlayer } from "@/lib/queries";
import { compareMeta, pageMetadata, playerIdParam } from "@/lib/seo";

/** Con los dos jugadores, título "A vs. B" e imagen del duelo (`/og/compare`, Tarea 6.25). */
export async function generateMetadata({ searchParams }: PageProps<"/compare">): Promise<Metadata> {
  const { a, b } = await searchParams;
  const ids = [playerIdParam(a), playerIdParam(b)];
  const [playerA, playerB] = await Promise.all(ids.map((id) => (id ? getPlayer(id) : null)));
  const both = playerA && playerB;
  return pageMetadata({
    ...compareMeta(playerA, playerB),
    path: both ? `/compare?a=${playerA.id}&b=${playerB.id}` : "/compare",
    image: both ? `/og/compare?a=${playerA.id}&b=${playerB.id}` : undefined,
  });
}

const loadPlayer = (id: number | null) => (id ? getDuelPlayer(id) : null);

export default function ComparePage({ searchParams }: PageProps<"/compare">) {
  return (
    // Márgenes negativos: el comparador ocupa todo el ancho del área de contenido
    <div className="-mx-4 -mt-4 md:-mx-8 md:-mt-8">
      <header className="border-b border-slate-800 px-4 pb-3 pt-4 md:px-8 md:pb-5 md:pt-10">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-orange-400">Cara a cara</p>
        <h1 className="font-display text-4xl font-extrabold uppercase leading-none text-white md:text-6xl">Comparador</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-300">Enfrenta a dos jugadores de cualquier época, temporada contra temporada o carrera contra carrera.</p>
      </header>
      <Suspense fallback={<CompareSkeleton />}>
        <CompareContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

/**
 * Los ids llegan al instante; los datos del duelo tardan (todas las temporadas de los dos). Mientras, la cabecera
 * ya enseña foto y nombre desde el índice del buscador (Tarea 6.20), sin dos cajas vacías.
 */
async function CompareContent({ searchParams }: { searchParams: PageProps<"/compare">["searchParams"] }) {
  const { a, b } = await searchParams;
  const ids = [playerIdParam(a), playerIdParam(b)] as const;
  return (
    <Suspense fallback={<CompareLoading a={ids[0]} b={ids[1]} />}>
      <CompareDuel a={ids[0]} b={ids[1]} />
    </Suspense>
  );
}

async function CompareDuel({ a, b }: { a: number | null; b: number | null }) {
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
