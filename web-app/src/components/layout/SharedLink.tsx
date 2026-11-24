"use client";

import { createContext, useContext, useEffect, useId, useLayoutEffect, useSyncExternalStore, ViewTransition, type ComponentProps, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createSharedNav, returnTrip, sharedName, sharedTarget, type GameTeams, type SharedNav, type SharedPart, type SharedTarget } from "@/lib/shared-nav";

// Transiciones entre pantallas (Tarea 7.4). React solo anima las navegaciones en las que entra `NavigationFade` o viaja
// un `Shared`: cambiar de nivel de spoilers, filtrar o cargar datos nunca pasa por aquí.

const nav = createSharedNav();
const IDLE: SharedNav = { target: null, origin: null };
const serverSnapshot = () => IDLE;

export function useSharedNav(): SharedNav {
  return useSyncExternalStore(nav.subscribe, nav.get, serverSnapshot);
}

const currentScreen = () => window.location.pathname + window.location.search;

/** Para las navegaciones por código (`router.push`): no viaja nada. */
export const notePlainNavigation = nav.plain;

const SharedContext = createContext<{ instance: string; target: SharedTarget } | null>(null);

type SharedLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  href: string;
  /** Escudos del partido, para pintarlos ya mientras carga la ficha. */
  teams?: GameTeams;
};

/** Enlace a una ficha cuya foto o escudo (`Shared`) viaja hasta la pantalla de destino. */
export function SharedLink({ href, teams, onClick, children, ...props }: SharedLinkProps) {
  const instance = useId();
  const target = sharedTarget(href);
  return (
    <Link
      {...props}
      href={href}
      onClick={(event) => {
        nav.start({ instance, href, teams: teams ?? null, from: currentScreen(), scrollY: window.scrollY });
        onClick?.(event);
      }}
    >
      {target ? <SharedContext value={{ instance, target }}>{children}</SharedContext> : children}
    </Link>
  );
}

/** Lo que viaja dentro de un `SharedLink`: un solo elemento. Solo lleva nombre en el enlace que se ha tocado. */
export function Shared({ part = "main", children }: { part?: SharedPart; children: ReactNode }) {
  const link = useContext(SharedContext);
  const { origin } = useSharedNav();
  const on = link !== null && origin?.instance === link.instance;
  const name = on ? sharedName(link.target, part) : undefined;
  return (
    // `contents`: no ocupa sitio. La marca es para el viaje de vuelta (`travelBack`)
    <span className="contents" data-shared-origin={name}>
      <ViewTransition name={name} share="shared" default="none">
        {children}
      </ViewTransition>
    </span>
  );
}

/** Dónde aterriza: la cabecera de la ficha, o su hueco de carga. */
export function SharedLanding({ target, part = "main", children }: { target: SharedTarget; part?: SharedPart; children: ReactNode }) {
  const name = sharedName(target, part);
  return (
    <span className="contents" data-shared-landing={name}>
      <ViewTransition name={name} share="shared" default="none">
        {children}
      </ViewTransition>
    </span>
  );
}

/**
 * Fundido corto al cambiar de pantalla. El elemento no se ve: al entrar con cada pantalla, React arranca la transición y,
 * como el contenido queda fuera de él, el navegador funde la página entera (barras incluidas, que son iguales).
 */
export function NavigationFade({ children }: { children: ReactNode }) {
  return (
    <>
      <ViewTransition enter="screen" default="none">
        <span aria-hidden className="pointer-events-none fixed left-0 top-0 size-0" />
      </ViewTransition>
      {children}
    </>
  );
}

const onScreen = (element: Element) => element.getClientRects().length > 0;

/** Elementos que viajan, con su nombre: los de la ficha que se ve o los de la lista de la que se salió (oculta). */
function travellers(attribute: "data-shared-origin" | "data-shared-landing", shown: boolean): Map<string, HTMLElement> {
  const found = new Map<string, HTMLElement>();
  for (const marker of document.querySelectorAll(`[${attribute}]`)) {
    const element = marker.firstElementChild;
    if (element instanceof HTMLElement && onScreen(element) === shown) found.set(marker.getAttribute(attribute)!, element);
  }
  return found;
}

const RETURN_MS = 800;
const replayed = new WeakSet<Event>();
let returnScroll: number | null = null;

/**
 * "Atrás" desde la ficha hasta la lista en la que se tocó. React no anima lo que pasa dentro de un `popstate` (tiene que
 * ser síncrono), así que el evento se entrega a Next.js un instante después y ya lo anima como cualquier navegación. La
 * lista seguía montada y oculta: basta con poner el mismo nombre a los dos extremos, que nunca se ven a la vez.
 * Si algo no encaja no se toca nada y la vuelta es la de siempre.
 */
function travelBack(event: PopStateEvent) {
  // Con "reducir movimiento" o si el propio sistema ya anima el gesto de volver, nada
  if (!document.startViewTransition || event.hasUAVisualTransition) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const landings = travellers("data-shared-landing", true);
  const trip = returnTrip(nav.get(), new Set(landings.keys()), currentScreen());
  if (!trip) return;
  const origins = travellers("data-shared-origin", false);
  const ends = [...landings, ...origins].filter(([name]) => landings.has(name) && origins.has(name));
  if (ends.length === 0) return;

  event.stopImmediatePropagation();
  const scrollY = window.scrollY;
  for (const [name, element] of ends) {
    element.style.setProperty("view-transition-name", name);
    element.style.setProperty("view-transition-class", "shared");
  }
  setTimeout(() => {
    // El navegador ya ha movido el scroll al de la lista: la ficha sale desde donde estaba
    window.scrollTo({ top: scrollY, behavior: "instant" });
    returnScroll = trip.scrollY;
    const replay = new PopStateEvent("popstate", { state: event.state });
    replayed.add(replay);
    window.dispatchEvent(replay);
  }, 0);
  setTimeout(() => {
    returnScroll = null;
    for (const [, element] of ends) {
      element.style.removeProperty("view-transition-name");
      element.style.removeProperty("view-transition-class");
    }
  }, RETURN_MS);
}

function onPopState(event: PopStateEvent) {
  if (replayed.has(event)) return;
  nav.back(window.location.pathname);
  travelBack(event);
}

// Al cargar el módulo, no en un efecto: tiene que ir antes que el router de Next.js, que también escucha en `window`
if (typeof window !== "undefined") window.addEventListener("popstate", onPopState, true);

/** Anota cada navegación que no sale de un `SharedLink` (que se anota solo, justo después) y anima la vuelta. */
export function SharedNavListener() {
  const pathname = usePathname();

  // Dentro de la transición, con la lista ya visible: se queda donde estaba
  useLayoutEffect(() => {
    if (returnScroll === null) return;
    window.scrollTo({ top: returnScroll, behavior: "instant" });
    returnScroll = null;
  }, [pathname]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (anchor) nav.plain(anchor.getAttribute("href") ?? "");
    };
    // En captura: antes que el onClick del propio enlace
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
