// Búsqueda instantánea de jugadores y equipos: índice compacto filtrado en memoria en el cliente.
import type { Player, Team } from "@/lib/supabase";

export type SearchTeam = Pick<Team, "id" | "name" | "abbreviation" | "conference" | "primary_color" | "secondary_color">;
export type SearchPlayer = Pick<Player, "id" | "full_name" | "position" | "team_id" | "is_active">;
export type SearchIndex = { teams: SearchTeam[]; players: SearchPlayer[] };

export type SearchResults = { teams: SearchTeam[]; players: SearchPlayer[] };

const MAX_TEAMS = 4;
const MAX_PLAYERS = 8;

/** Minúsculas, sin tildes ni puntuación: "Nikola Jokić" → "nikola jokic", "P.J. Tucker" → "pj tucker". */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[.'’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Puntuación de `name` para la consulta (0 = no coincide). Cada término debe ser
 * prefijo de alguna palabra ("lebr jam"); también valen las iniciales exactas ("sga") y,
 * como último recurso con 3+ letras, aparecer dentro del nombre.
 */
function score(name: string, query: string, terms: string[]): number {
  if (name === query) return 100;

  const words = name.split(" ");
  // La gente busca por apellido: "jordan" debe dar antes a Michael Jordan que a Jordan Poole
  if (words.length > 1 && words.at(-1) === query) return 95;
  if (name.startsWith(query)) return 90;
  if (words.length > 1 && query === words.map((w) => w[0]).join("")) return 85;
  if (terms.every((t) => words.some((w) => w.startsWith(t)))) {
    // Mejor si el primer término coincide con el apellido o el nombre de pila tal cual
    return words.some((w) => w === terms[0]) ? 80 : 70;
  }
  if (query.length >= 3 && terms.every((t) => name.includes(t))) return 40;
  return 0;
}

function rank<T>(items: T[], getKeys: (item: T) => string[], getLabel: (item: T) => string, query: string, limit: number): T[] {
  const terms = query.split(" ");
  return items
    .map((item) => ({ item, s: Math.max(...getKeys(item).map((k) => score(k, query, terms))) }))
    .filter(({ s }) => s > 0)
    .sort((a, b) => b.s - a.s || getLabel(a.item).localeCompare(getLabel(b.item), "es"))
    .slice(0, limit)
    .map(({ item }) => item);
}

export function search(index: SearchIndex, rawQuery: string, limits = { teams: MAX_TEAMS, players: MAX_PLAYERS }): SearchResults {
  const query = normalize(rawQuery);
  if (!query) return { teams: [], players: [] };

  return {
    teams: rank(index.teams, (t) => [normalize(t.name), normalize(t.abbreviation)], (t) => t.name, query, limits.teams),
    players: rank(index.players, (p) => [normalize(p.full_name)], (p) => p.full_name, query, limits.players),
  };
}

// --- Ctrl+K vacío (Tarea 6.21): búsquedas recientes y favoritos encima de los 30 escudos.
// Las recientes se guardan en el dispositivo y solo con ids: nombre, foto y equipo salen siempre del índice
// del día (un traspasado aparece con su equipo nuevo). Nada que ver con el nivel de spoilers.

export type RecentPick = { kind: "team" | "player"; id: number };
export type SearchEntry = { kind: "team"; team: SearchTeam } | { kind: "player"; player: SearchPlayer };

export const RECENT_SEARCH_KEY = "hoopmeter:search-recent";
export const MAX_RECENT = 6;

const isId = (value: unknown): value is number => Number.isInteger(value) && (value as number) > 0;

/** Lee las recientes guardadas. Cualquier dato roto se descarta: nunca rompe el buscador. */
export function parseRecent(raw: string | null): RecentPick[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw ?? "null");
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const picks: RecentPick[] = [];
  for (const item of parsed) {
    const { kind, id } = (item ?? {}) as Record<string, unknown>;
    if ((kind === "team" || kind === "player") && isId(id) && !picks.some((p) => p.kind === kind && p.id === id)) picks.push({ kind, id });
  }
  return picks.slice(0, MAX_RECENT);
}

/** La última elegida pasa la primera (sin repetirse) y la lista nunca pasa de `MAX_RECENT`. */
export function addRecent(recent: readonly RecentPick[], pick: RecentPick): RecentPick[] {
  return [pick, ...recent.filter((p) => p.kind !== pick.kind || p.id !== pick.id)].slice(0, MAX_RECENT);
}

/** Lo que pide el buscador vacío de los favoritos (mismo formato que `Favorites`, sin depender de él). */
type FavoriteRefs = { teams: { id: number }[]; players: { id: number; name: string; teamId: number | null }[] };

/**
 * Filas del buscador vacío: favoritos (equipos y después jugadores) y recientes que no lo son. Una reciente
 * que ya no está en el índice se omite; un jugador favorito que no está sale con lo que se guardó al marcarlo.
 */
export function emptySearchEntries(
  index: SearchIndex,
  recent: readonly RecentPick[],
  favorites: FavoriteRefs
): { recent: SearchEntry[]; favorites: SearchEntry[] } {
  const teams = new Map(index.teams.map((t) => [t.id, t]));
  const players = new Map(index.players.map((p) => [p.id, p]));

  const favoriteEntries: SearchEntry[] = [
    ...favorites.teams.flatMap((t): SearchEntry[] => {
      const team = teams.get(t.id);
      return team ? [{ kind: "team", team }] : [];
    }),
    ...favorites.players.map(
      (p): SearchEntry => ({
        kind: "player",
        player: players.get(p.id) ?? { id: p.id, full_name: p.name, position: null, team_id: p.teamId, is_active: true },
      })
    ),
  ];
  const isFavorite = (pick: RecentPick) =>
    pick.kind === "team" ? favorites.teams.some((t) => t.id === pick.id) : favorites.players.some((p) => p.id === pick.id);

  const recentEntries = recent.filter((pick) => !isFavorite(pick)).flatMap((pick): SearchEntry[] => {
    if (pick.kind === "team") {
      const team = teams.get(pick.id);
      return team ? [{ kind: "team", team }] : [];
    }
    const player = players.get(pick.id);
    return player ? [{ kind: "player", player }] : [];
  });

  return { recent: recentEntries, favorites: favoriteEntries };
}
