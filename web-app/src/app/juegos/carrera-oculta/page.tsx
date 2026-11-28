import type { Metadata } from "next";
import { Carrera } from "@/components/juegos/Carrera";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Carrera oculta: adivina el jugador NBA por sus temporadas",
  description:
    "Reto diario de baloncesto: adivina de quién es la carrera por sus temporadas (edad, partidos, puntos, rebotes y asistencias), con sus equipos o sin ellos, en 6 intentos.",
  path: "/juegos/carrera-oculta",
});

/**
 * Carrera oculta (Tarea 8.4): la página es igual para todos y se sirve estática; la carrera del día y la partida las
 * da el servidor (`/api/juegos/carrera`) al abrirla, y lo jugado hoy lo pone el navegador.
 */
export default function CarreraPage() {
  return (
    // Márgenes negativos: la página ocupa todo el ancho del área de contenido
    <div className="-mx-4 -mt-4 md:-mx-8 md:-mt-8">
      <Carrera />
    </div>
  );
}
