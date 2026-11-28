import type { Metadata } from "next";
import { AccountScreen } from "@/components/account/AccountScreen";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = {
  ...pageMetadata({
    title: "Tu cuenta",
    description: "Guarda tu ELO, tu racha y tus favoritos en todos tus dispositivos. Opcional y gratis, con Google.",
    path: "/cuenta",
  }),
  // Es de cada uno: nada que buscar en Google
  robots: { index: false, follow: true },
};

/** Tu cuenta (Tarea 8.5). Página estática: todo es del dispositivo y se pinta al saber si hay sesión. */
export default function AccountPage() {
  return (
    // Márgenes negativos: la página ocupa todo el ancho del área de contenido
    <div className="-mx-4 -mt-4 md:-mx-8 md:-mt-8">
      <AccountScreen />
    </div>
  );
}
