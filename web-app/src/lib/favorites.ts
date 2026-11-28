// Favoritos sin cuenta (Tarea 6.10): equipos y jugadores guardados en el dispositivo.
// Puro y sin dependencias (lo usan los tests con `node --test`); el almacén y el hook están en
// `favorites-store.ts`.
//
// Regla de spoilers: los favoritos solo cambian el ORDEN y el DESTACADO de los partidos, nunca lo
// que se ve de ellos. Nada de aquí depende del resultado, de la nota ni del estado de un partido, y
// el nivel de spoilers no se guarda con los favoritos (la app siempre arranca en Nivel 1).

export type FavoriteTeam = { id: number; name: string; abbreviation: string };
/** `teamId` = su equipo cuando se marcó o se visitó su ficha por última vez (la portada lo actualiza con el buscador). */
export type FavoritePlayer = { id: number; name: string; teamId: number | null };
export type Favorites = { teams: FavoriteTeam[]; players: FavoritePlayer[] };

export const FAVORITES_STORAGE_KEY = "hoopmeter:favorites";
/** Tope por tipo: el almacenamiento nunca crece sin control y la franja sigue siendo un acceso rápido. */
export const MAX_FAVORITES = 30;

export const EMPTY_FAVORITES: Favorites = Object.freeze({ teams: [], players: [] }) as Favorites;

const isId = (value: unknown): value is number => Number.isInteger(value) && (value as number) > 0;
const isText = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";

/** Lee lo guardado. Cualquier dato roto o inesperado se descarta: nunca rompe la app. */
export function parseFavorites(raw: string | null): Favorites {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw ?? "null");
  } catch {
    return EMPTY_FAVORITES;
  }
  if (!parsed || typeof parsed !== "object") return EMPTY_FAVORITES;
  const { teams, players } = parsed as { teams?: unknown; players?: unknown };

  const teamList: FavoriteTeam[] = [];
  for (const item of Array.isArray(teams) ? teams : []) {
    const { id, name, abbreviation } = (item ?? {}) as Record<string, unknown>;
    if (isId(id) && isText(name) && isText(abbreviation) && !teamList.some((t) => t.id === id)) {
      teamList.push({ id, name, abbreviation });
    }
  }
  const playerList: FavoritePlayer[] = [];
  for (const item of Array.isArray(players) ? players : []) {
    const { id, name, teamId } = (item ?? {}) as Record<string, unknown>;
    if (isId(id) && isText(name) && !playerList.some((p) => p.id === id)) {
      playerList.push({ id, name, teamId: isId(teamId) ? teamId : null });
    }
  }
  if (teamList.length === 0 && playerList.length === 0) return EMPTY_FAVORITES;
  return { teams: teamList.slice(0, MAX_FAVORITES), players: playerList.slice(0, MAX_FAVORITES) };
}

/**
 * Lo que se guarda: los favoritos y, desde la Tarea 8.5, cuándo los cambiaste en este dispositivo (`at`, ms): con la
 * cuenta, gana el cambio más reciente entre tus dispositivos.
 */
export function serializeFavorites(favorites: Favorites, at = 0): string {
  return JSON.stringify({ teams: favorites.teams, players: favorites.players, ...(at > 0 ? { at } : {}) });
}

/** Cuándo se cambiaron los favoritos guardados (0 si no se sabe: guardados antes de las cuentas). */
export function parseFavoritesAt(raw: string | null): number {
  try {
    const at = (JSON.parse(raw ?? "null") as { at?: unknown } | null)?.at;
    return typeof at === "number" && Number.isSafeInteger(at) && at > 0 ? at : 0;
  } catch {
    return 0;
  }
}

/** Mismos favoritos y en el mismo orden. */
export const sameFavorites = (a: Favorites, b: Favorites): boolean =>
  JSON.stringify([a.teams, a.players]) === JSON.stringify([b.teams, b.players]);

/**
 * Los de los dos sitios juntos (al entrar en la cuenta desde un dispositivo, Tarea 8.5): primero los de `first`, después
 * los que solo tiene `second`, sin pasar del tope.
 */
export function unionFavorites(first: Favorites, second: Favorites): Favorites {
  const teams = [...first.teams, ...second.teams.filter((t) => !isFavoriteTeam(first, t.id))].slice(0, MAX_FAVORITES);
  const players = [...first.players, ...second.players.filter((p) => !isFavoritePlayer(first, p.id))].slice(0, MAX_FAVORITES);
  return teams.length === 0 && players.length === 0 ? EMPTY_FAVORITES : { teams, players };
}

// --- Copia en cookie: solo ids, para que el servidor pinte la portada ya ordenada y con la franja
// de favoritos (sin saltos al hidratar). Nunca el nivel de spoilers ni nombres.
// Formato "equipo.equipo_jugador-equipo.jugador-0" (0 = sin equipo): caracteres válidos en una cookie.

export const FAVORITES_COOKIE = "hm_fav";
export type FavoriteIds = { teams: number[]; players: { id: number; teamId: number | null }[] };

export function encodeFavoritesCookie(favorites: Favorites): string {
  const teams = favorites.teams.map((t) => t.id).join(".");
  const players = favorites.players.map((p) => `${p.id}-${p.teamId ?? 0}`).join(".");
  return teams || players ? `${teams}_${players}` : "";
}

export function decodeFavoritesCookie(value: string | undefined): FavoriteIds {
  const [teamPart = "", playerPart = ""] = (value ?? "").split("_");
  const teams = [...new Set(teamPart.split(".").map(Number).filter(isId))].slice(0, MAX_FAVORITES);
  const players: FavoriteIds["players"] = [];
  for (const chunk of playerPart.split(".")) {
    const [id, teamId] = chunk.split("-").map(Number);
    if (isId(id) && !players.some((p) => p.id === id)) players.push({ id, teamId: isId(teamId) ? teamId : null });
  }
  return { teams, players: players.slice(0, MAX_FAVORITES) };
}

export function isFavoriteTeam(favorites: Favorites, teamId: number): boolean {
  return favorites.teams.some((t) => t.id === teamId);
}

export function isFavoritePlayer(favorites: Favorites, playerId: number): boolean {
  return favorites.players.some((p) => p.id === playerId);
}

/** Marca o desmarca un equipo. Los nuevos van al final (la franja respeta el orden en que se marcaron). */
export function toggleTeam(favorites: Favorites, team: FavoriteTeam): Favorites {
  if (isFavoriteTeam(favorites, team.id)) return { ...favorites, teams: favorites.teams.filter((t) => t.id !== team.id) };
  if (favorites.teams.length >= MAX_FAVORITES) return favorites;
  return { ...favorites, teams: [...favorites.teams, { id: team.id, name: team.name, abbreviation: team.abbreviation }] };
}

export function togglePlayer(favorites: Favorites, player: FavoritePlayer): Favorites {
  if (isFavoritePlayer(favorites, player.id)) return { ...favorites, players: favorites.players.filter((p) => p.id !== player.id) };
  if (favorites.players.length >= MAX_FAVORITES) return favorites;
  return { ...favorites, players: [...favorites.players, { id: player.id, name: player.name, teamId: player.teamId }] };
}

/**
 * Pone al día el equipo (y el nombre) de un jugador favorito. Devuelve el MISMO objeto si no cambia
 * nada, para no escribir ni repintar en balde.
 */
export function updatePlayerTeams(favorites: Favorites, current: Map<number, { teamId: number | null; name?: string }>): Favorites {
  let changed = false;
  const players = favorites.players.map((p) => {
    const now = current.get(p.id);
    if (!now) return p;
    const name = now.name && isText(now.name) ? now.name : p.name;
    if (now.teamId === p.teamId && name === p.name) return p;
    changed = true;
    return { ...p, teamId: now.teamId, name };
  });
  return changed ? { ...favorites, players } : favorites;
}

/**
 * Equipos que hacen "tuyo" un partido, con el motivo que se lee en el destacado
 * ("Tu equipo" o "Equipo de Luka Dončić"). Un equipo marcado manda sobre sus jugadores.
 */
export function favoriteTeamReasons(favorites: Favorites): Map<number, string> {
  const reasons = new Map<number, string>();
  for (const team of favorites.teams) reasons.set(team.id, "Tu equipo");
  const byTeam = new Map<number, string[]>();
  for (const player of favorites.players) {
    if (player.teamId === null || reasons.has(player.teamId)) continue;
    byTeam.set(player.teamId, [...(byTeam.get(player.teamId) ?? []), player.name]);
  }
  for (const [teamId, names] of byTeam) reasons.set(teamId, `Equipo de ${names.join(", ")}`);
  return reasons;
}

type Matchup = { home_team_id: number; away_team_id: number };

export function isFavoriteGame(game: Matchup, teams: ReadonlyMap<number, unknown> | ReadonlySet<number>): boolean {
  return teams.has(game.home_team_id) || teams.has(game.away_team_id);
}

/**
 * Partidos de tus favoritos primero; dentro de cada grupo, el orden de entrada (la hora).
 * Solo mira los equipos: el orden es el mismo en los tres niveles de spoilers.
 */
export function sortFavoritesFirst<T extends Matchup>(games: T[], teams: ReadonlyMap<number, unknown> | ReadonlySet<number>): T[] {
  if (teams.size === 0) return games;
  const mine = games.filter((g) => isFavoriteGame(g, teams));
  if (mine.length === 0 || mine.length === games.length) return games;
  return [...mine, ...games.filter((g) => !isFavoriteGame(g, teams))];
}
