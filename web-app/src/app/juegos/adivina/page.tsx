import type { Metadata } from "next";
import { Adivina } from "@/components/juegos/Adivina";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Adivina el jugador NBA del día por su radar",
  description:
    "Reto diario de baloncesto: adivina el jugador de la NBA por su radar de atributos en 6 intentos, con pistas de conferencia, posición, edad, altura y media.",
  path: "/juegos/adivina",
});

/**
 * Adivina el jugador (Tarea 8.3): la página es igual para todos y se sirve estática; el radar del día y la partida los
 * da el servidor (`/api/juegos/adivina`) al abrirla, y lo jugado hoy lo pone el navegador.
 */
export default function AdivinaPage() {
  return (
    // Márgenes negativos: la página ocupa todo el ancho del área de contenido
    <div className="-mx-4 -mt-4 md:-mx-8 md:-mt-8">
      <Adivina />
    </div>
  );
}
