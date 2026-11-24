import type { ReactNode } from "react";
import { NavigationFade } from "@/components/layout/SharedLink";

/** Se monta de nuevo en cada cambio de pantalla: fundido corto (Tarea 7.4). */
export default function Template({ children }: { children: ReactNode }) {
  return <NavigationFade>{children}</NavigationFade>;
}
