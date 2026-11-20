import type { Metadata } from "next";
import { PushSettings } from "@/components/push/PushSettings";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Aviso de la mañana · ${BRAND.name}`,
  description: "Un aviso cada mañana con la jornada de anoche lista para ver. Nunca resultados.",
};

/** Aviso matinal sin spoilers (Tarea 6.14). Todo es del dispositivo: el HTML no lleva datos de partidos. */
export default function PushPage() {
  return (
    // Márgenes negativos: la página ocupa todo el ancho del área de contenido
    <div className="-mx-4 -mt-4 md:-mx-8 md:-mt-8">
      <header className="border-b border-slate-800 px-4 pb-3 pt-4 md:px-8 md:pb-5 md:pt-10">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-orange-400">Sin resultados, nunca</p>
        <h1 className="font-display text-4xl font-extrabold uppercase leading-tight text-white md:text-6xl">Aviso de la mañana</h1>
      </header>
      <PushSettings />
    </div>
  );
}
