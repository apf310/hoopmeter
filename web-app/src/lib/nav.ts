// Secciones de la navegación (Tarea 8.1): barra de 5 pestañas en el móvil y Sidebar en el escritorio.
// Puro (lo usan los tests con `node --test`); los iconos y textos están en `components/layout/nav-items.ts`.

/** Las cinco pestañas: Inicio · Liga · Jugadores · GM · Juegos. */
export type NavSection = "/" | "/standings" | "/players" | "/gm-simulator" | "/juegos";

/** Enlaces del escritorio fuera de las pestañas, juntos bajo ellas en la Sidebar. */
export type SidebarExtra = "/que-ver" | "/avisos" | "/cuenta";

const under = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

/**
 * Pestaña de cada pantalla. Inicio lleva también las fichas de partido, Qué ver y los avisos (se llega a ellos
 * desde la portada); Liga, la clasificación y los equipos; Jugadores, las fichas y el comparador.
 */
export function navSection(pathname: string): NavSection | null {
  if (pathname === "/" || under(pathname, "/games") || under(pathname, "/que-ver") || under(pathname, "/avisos")) return "/";
  if (under(pathname, "/standings") || under(pathname, "/teams")) return "/standings";
  if (under(pathname, "/players") || under(pathname, "/compare")) return "/players";
  if (under(pathname, "/gm-simulator")) return "/gm-simulator";
  // La cuenta (Tarea 8.5): en el móvil se llega desde Juegos
  if (under(pathname, "/juegos") || under(pathname, "/cuenta")) return "/juegos";
  return null;
}

/** En la Sidebar, Qué ver, el aviso de la mañana y la cuenta tienen enlace propio: entonces se marca ese. */
export function sidebarSection(pathname: string): NavSection | SidebarExtra | null {
  if (under(pathname, "/que-ver")) return "/que-ver";
  if (under(pathname, "/avisos")) return "/avisos";
  if (under(pathname, "/cuenta")) return "/cuenta";
  return navSection(pathname);
}
