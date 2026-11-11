import type { Metadata } from "next";
import { TradeMachine } from "@/components/gm/TradeMachine";
import { BRAND } from "@/lib/brand";
import { getGmData } from "@/lib/queries";
import { SEASON } from "@/lib/trade-rules";

export const metadata: Metadata = {
  title: `GM Virtual · ${BRAND.name}`,
  description: "Simulador de traspasos de la NBA con los contratos reales y las reglas del convenio.",
};

const UPDATED_FORMAT = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });

export default async function GmSimulatorPage() {
  const data = await getGmData();

  return (
    // Márgenes negativos: el simulador ocupa todo el ancho del área de contenido
    <div className="-mx-4 -mt-4 md:-mx-8 md:-mt-8">
      <header className="border-b border-slate-800 px-4 pb-5 pt-6 md:px-8 md:pt-10">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-orange-400">Temporada {SEASON} · Simulador de traspasos</p>
        <h1 className="font-display text-5xl font-extrabold uppercase leading-none text-white md:text-6xl">GM Virtual</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-300">Monta tu traspaso y comprueba al momento si lo aprobaría la liga.</p>
        {data.contractsUpdatedAt && (
          <p className="mt-1 text-xs text-slate-400">
            Fichajes, cortes y traspasos del registro oficial de la NBA, actualizados el {UPDATED_FORMAT.format(new Date(data.contractsUpdatedAt))} (hora de España).
          </p>
        )}
      </header>
      <TradeMachine data={data} />
    </div>
  );
}
