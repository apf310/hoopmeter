import type { Metadata } from "next";
import { MasOMenos } from "@/components/juegos/MasOMenos";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "¿Más o menos? Salarios, medias y promedios de la NBA",
  description:
    "Reto diario de baloncesto: ¿cobra más o menos?, ¿tiene más media?, ¿promedia más puntos? 30 preguntas contrarreloj solo para ti y un modo infinito.",
  path: "/juegos/mas-o-menos",
});

/**
 * ¿Más o menos? (Tarea 8.2): la página es igual para todos y se sirve estática; las preguntas las da el servidor al
 * empezar (`/api/juegos/mas-o-menos`) y lo jugado hoy lo pone el navegador.
 */
export default function MasOMenosPage() {
  return (
    // Márgenes negativos: la página ocupa todo el ancho del área de contenido
    <div className="-mx-4 -mt-4 md:-mx-8 md:-mt-8">
      <MasOMenos />
    </div>
  );
}
