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

export function search(index: SearchIndex, rawQuery: string): SearchResults {
  const query = normalize(rawQuery);
  if (!query) return { teams: [], players: [] };

  return {
    teams: rank(index.teams, (t) => [normalize(t.name), normalize(t.abbreviation)], (t) => t.name, query, MAX_TEAMS),
    players: rank(index.players, (p) => [normalize(p.full_name)], (p) => p.full_name, query, MAX_PLAYERS),
  };
}
