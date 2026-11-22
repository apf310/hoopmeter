"use client";

// Almacén de favoritos (Tarea 6.10) en localStorage: sobrevive al cerrar la app, a diferencia del
// nivel de spoilers (sessionStorage, siempre vuelve al 1), que NUNCA se guarda aquí.
import { useEffect, useSyncExternalStore } from "react";
import { loadSearchIndex } from "@/components/search/SearchCommand";
import {
  EMPTY_FAVORITES,
  FAVORITES_COOKIE,
  FAVORITES_STORAGE_KEY,
  encodeFavoritesCookie,
  parseFavorites,
  serializeFavorites,
  togglePlayer,
  toggleTeam,
  updatePlayerTeams,
  type FavoritePlayer,
  type FavoriteTeam,
  type Favorites,
} from "@/lib/favorites";

const listeners = new Set<() => void>();
// En memoria además de en el almacenamiento: en modo privado sin localStorage los favoritos
// funcionan durante la sesión aunque no se guarden.
let current: Favorites | null = null;

function load(): Favorites {
  try {
    return parseFavorites(localStorage.getItem(FAVORITES_STORAGE_KEY));
  } catch {
    return EMPTY_FAVORITES;
  }
}

// La cookie solo lleva ids y dura lo máximo que permiten los navegadores (400 días)
function writeCookie(favorites: Favorites) {
  const value = encodeFavoritesCookie(favorites);
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = value
    ? `${FAVORITES_COOKIE}=${value}; Path=/; Max-Age=34560000; SameSite=Lax${secure}`
    : `${FAVORITES_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

function snapshot(): Favorites {
  if (current === null) {
    current = load();
    // Si la cookie se perdió (o es de otra versión), se rehace: la próxima portada ya sale ordenada
    const cookie = document.cookie.split("; ").find((c) => c.startsWith(`${FAVORITES_COOKIE}=`))?.slice(FAVORITES_COOKIE.length + 1) ?? "";
    if (cookie !== encodeFavoritesCookie(current)) writeCookie(current);
  }
  return current;
}

function update(change: (favorites: Favorites) => Favorites) {
  const prev = snapshot();
  const next = change(prev);
  if (next === prev) return;
  current = next;
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, serializeFavorites(next));
  } catch {
    // Sin almacenamiento: se quedan solo en memoria.
  }
  writeCookie(next);
  listeners.forEach((listener) => listener());
}

// Otra pestaña cambió los favoritos: se releen
function onStorage(event: StorageEvent) {
  if (event.key !== null && event.key !== FAVORITES_STORAGE_KEY) return;
  current = load();
  writeCookie(current);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

/**
 * Favoritos del dispositivo. En el servidor y al hidratar, `initial`: vacíos salvo en la portada,
 * que los recibe de la cookie para pintarse ya ordenada (mismo HTML en servidor y cliente).
 */
export function useFavorites(initial: Favorites = EMPTY_FAVORITES): Favorites {
  return useSyncExternalStore(subscribe, snapshot, () => initial);
}

/** "Borrar los datos de este dispositivo" (/privacidad, Tarea 6.26): favoritos y cookie fuera. */
export function clearFavorites() {
  current = EMPTY_FAVORITES;
  try {
    localStorage.removeItem(FAVORITES_STORAGE_KEY);
  } catch {
    // Sin almacenamiento: ya solo estaban en memoria.
  }
  writeCookie(EMPTY_FAVORITES);
  listeners.forEach((listener) => listener());
}

export const toggleFavoriteTeam = (team: FavoriteTeam) => update((f) => toggleTeam(f, team));
export const toggleFavoritePlayer = (player: FavoritePlayer) => update((f) => togglePlayer(f, player));

/** Al ver la ficha de un jugador favorito se apunta su equipo de hoy (por si lo traspasaron). */
export function syncFavoritePlayer(player: FavoritePlayer) {
  update((f) => updatePlayerTeams(f, new Map([[player.id, { teamId: player.teamId, name: player.name }]])));
}

/**
 * Con jugadores favoritos, pone al día sus equipos con el índice del buscador (ya cacheado una hora):
 * un traspaso nunca deja sus partidos sin destacar. Hasta entonces vale el equipo guardado.
 */
export function useFreshFavoritePlayerTeams(favorites: Favorites) {
  const hasPlayers = favorites.players.length > 0;
  useEffect(() => {
    if (!hasPlayers) return;
    let cancelled = false;
    loadSearchIndex().then(
      (index) => {
        if (cancelled) return;
        update((f) => {
          const wanted = new Set(f.players.map((p) => p.id));
          const found = index.players.filter((p) => wanted.has(p.id));
          return updatePlayerTeams(f, new Map(found.map((p) => [p.id, { teamId: p.team_id ?? null, name: p.full_name }])));
        });
      },
      () => {}
    );
    return () => {
      cancelled = true;
    };
  }, [hasPlayers]);
}
