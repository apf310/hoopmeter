import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { TradeMachine } from "@/components/gm/TradeMachine";
import { getSharedTrade, restoreLink } from "@/lib/gm-share";
import { pageMetadata, tradeMeta } from "@/lib/seo";
import { getGmData } from "@/lib/queries";
import { SEASON } from "@/lib/trade-rules";

const PATH = "/gm-simulator";

/**
 * El enlace de un traspaso (Tarea 7.9) se previsualiza con sus equipos y su imagen (`/og/trade`), montado con los
 * contratos de hoy. La canónica sigue siendo la del simulador: cada traspaso no es una página para los buscadores.
 */
export async function generateMetadata({ searchParams }: PageProps<"/gm-simulator">): Promise<Metadata> {
  const params = await searchParams;
  const shared = params.equipos !== undefined ? await getSharedTrade(params) : null;
  if (!shared) {
    return pageMetadata({
      title: "Simulador de traspasos NBA en español",
      description: "GM Virtual: monta traspasos de la NBA con los contratos reales, comprueba al momento si cumplen el convenio y pide la opinión de la IA.",
      path: PATH,
    });
  }
  const { trade, teams, search } = shared;
  const teamName = (id: number) => teams.find((team) => team.id === id)?.name ?? "";
  const moves = [...trade.players].sort((a, b) => b.player.salary - a.player.salary).map(({ player, to }) => ({ name: player.name, to: teamName(to) }));
  return pageMetadata({
    ...tradeMeta(teams.map((team) => team.name), moves, trade.picks.length),
    path: PATH,
    url: `${PATH}${search}`,
    image: `/og/trade${search}`,
  });
}

const UPDATED_FORMAT = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });

export default async function GmSimulatorPage({ searchParams }: PageProps<"/gm-simulator">) {
  const data = await getGmData();

  return (
    // Márgenes negativos: el simulador ocupa todo el ancho del área de contenido
    <div className="-mx-4 -mt-4 md:-mx-8 md:-mt-8">
      <header className="border-b border-slate-800 px-4 pb-3 pt-4 md:px-8 md:pb-5 md:pt-10">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-orange-400">Temporada {SEASON} · Simulador de traspasos</p>
        <h1 className="font-display text-4xl font-extrabold uppercase leading-none text-white md:text-6xl">GM Virtual</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-300">Monta tu traspaso y comprueba al momento si lo aprobaría la liga.</p>
        {data.contractsUpdatedAt && (
          <p className="mt-1 text-xs text-slate-400">
            Fichajes, cortes y traspasos del registro oficial de la NBA, actualizados el {UPDATED_FORMAT.format(new Date(data.contractsUpdatedAt))} (hora de España).
          </p>
        )}
      </header>
      <Suspense fallback={<GmSkeleton />}>
        <GmContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

/**
 * `?equipos=…` (enlace compartido, Tarea 6.9): el traspaso se reconstruye con los contratos de hoy y el cliente
 * recalcula el veredicto con `trade-rules.ts`. `?jugador=ID` (botón "Simular traspaso" de la ficha del jugador,
 * Tarea 6.8): su equipo ya elegido.
 *
 * Next incrusta en el HTML una segunda copia de lo que se puede precargar (`experimental.cachedNavigations`, activo con
 * `cacheComponents`) para que volver a la página sea instantáneo. Con los 140 KB de contratos no compensa: después de
 * `connection()` no son precargables y viajan una sola vez (Tarea 7.7).
 */
async function GmContent({ searchParams }: { searchParams: PageProps<"/gm-simulator">["searchParams"] }) {
  await connection();
  const [params, data] = await Promise.all([searchParams, getGmData()]);
  if (params.equipos !== undefined) return <TradeMachine data={data} initialTrade={restoreLink(data, params)} />;
  const playerId = Number(params.jugador);
  return <TradeMachine data={data} initialPlayerId={Number.isInteger(playerId) && playerId > 0 ? playerId : null} />;
}

function GmSkeleton() {
  return (
    <div className="animate-pulse px-4 py-5 md:px-8" aria-busy>
      <div className="h-8 w-64 bg-slate-900" />
      <div className="mt-4 grid grid-cols-5 gap-px sm:grid-cols-6 lg:grid-cols-10">
        {Array.from({ length: 30 }, (_, i) => (
          <div key={i} className="h-[72px] bg-slate-900/60" />
        ))}
      </div>
    </div>
  );
}
