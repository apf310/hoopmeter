// Transiciones entre pantallas (Tarea 7.4): qué enlace se ha tocado, para que su foto o su escudo viaje a la pantalla
// de destino. Puro y sin dependencias (se prueba con `npm test`); los componentes están en `components/layout/SharedLink.tsx`.
// Solo ids de jugadores, equipos y partidos: nunca notas, marcadores ni nada que dependa de un resultado.

export type SharedTarget = { kind: "player" | "team"; id: number } | { kind: "game"; id: string };

/** Qué viaja: la foto o el escudo, o los dos escudos de un partido. */
export type SharedPart = "main" | "away" | "home";

// El nombre que sigue al id (Tarea 7.8) no cuenta: manda el id
const ROUTE = /^\/(players|teams|games)\/(\d+)(?:-[^/?#]*)?\/?(?:[?#].*)?$/;

/** Ficha a la que lleva un enlace interno, o null si es otra pantalla. */
export function sharedTarget(href: string): SharedTarget | null {
  const match = ROUTE.exec(href);
  if (!match) return null;
  if (match[1] === "games") return { kind: "game", id: match[2] };
  return { kind: match[1] === "players" ? "player" : "team", id: Number(match[2]) };
}

/** Nombre de la transición: el mismo en el origen y en el destino. */
export function sharedName(target: SharedTarget, part: SharedPart = "main"): string {
  return `${target.kind}-${target.id}-${part}`;
}

/** Escudos de un partido (visitante y local): el hueco de carga aún no sabe qué equipos juegan. */
export type GameTeams = { away: number; home: number };

export type SharedNav = {
  /** Última pantalla que se ha pedido. */
  target: string | null;
  /** Enlace concreto que se tocó: un mismo jugador puede salir varias veces en la página y solo uno viaja. */
  origin: SharedOrigin | null;
};

export type SharedOrigin = {
  instance: string;
  href: string;
  teams: GameTeams | null;
  /** Pantalla (ruta y parámetros) y posición en que estaba la lista: a ella se vuelve con "atrás". */
  from: string;
  scrollY: number;
};

export function createSharedNav() {
  let state: SharedNav = { target: null, origin: null };
  const listeners = new Set<() => void>();
  const set = (next: SharedNav) => {
    state = next;
    listeners.forEach((listener) => listener());
  };
  return {
    get: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    /** Se toca un enlace que transporta algo. */
    start(origin: SharedOrigin) {
      set({ target: origin.href, origin });
    },
    /** Cualquier otra navegación: no viaja nada. */
    plain(href: string) {
      set({ target: href, origin: null });
    },
    /** Atrás o adelante: si se vuelve a la pantalla de la que se salió, su enlace recupera lo que viajó. */
    back(href: string) {
      set({ ...state, target: href });
    },
  };
}

/** Escudos que enseña el hueco de carga de un partido: solo si es el partido que se acaba de tocar. */
export function pendingTeams(nav: SharedNav): GameTeams | null {
  return nav.origin && nav.origin.href === nav.target ? nav.origin.teams : null;
}

/** ¿Se está volviendo de la ficha (`landings`: lo que hay en pantalla) justo a la lista en la que se tocó? */
export function returnTrip(nav: SharedNav, landings: ReadonlySet<string>, arriving: string): SharedOrigin | null {
  const { origin } = nav;
  const target = origin && sharedTarget(origin.href);
  if (!target || origin.from !== arriving) return null;
  return (["main", "away", "home"] as const).some((part) => landings.has(sharedName(target, part))) ? origin : null;
}
