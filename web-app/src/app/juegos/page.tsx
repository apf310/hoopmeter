import type { Metadata } from "next";
import { GamesHub } from "@/components/juegos/GamesHub";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Juegos NBA: retos diarios de baloncesto",
  description:
    "Retos de baloncesto cada día: ¿Más o menos?, Adivina el jugador y Carrera oculta. Suma puntos, sube de división y no pierdas la racha.",
  path: "/juegos",
});

/**
 * Juegos (Tarea 8.1): la página es igual para todos y se sirve estática; día del reto, puntos y racha
 * los pone el navegador (reloj y almacenamiento del dispositivo).
 */
export default function JuegosPage() {
  return (
    // Márgenes negativos: la página ocupa todo el ancho del área de contenido
    <div className="-mx-4 -mt-4 md:-mx-8 md:-mt-8">
      <GamesHub />
    </div>
  );
}
