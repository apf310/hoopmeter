// Cuentas (Tarea 8.5): lo que trae la cuenta y cómo se junta con lo del dispositivo. Puro y sin dependencias de React
// (tests con `node --test`); la sesión y la sincronización están en `account-store.ts`, el servidor en `account-server.ts`.
//
// Reglas:
//   - Resultados de los juegos: manda la cuenta. Para cada reto y día vale el de la cuenta (el primero que llegó, desde
//     cualquier dispositivo); lo que solo tiene el dispositivo se queda en él y, si lleva recibo, se manda a la cuenta
//     (`pendingReceipts`). La cuenta nunca se fía de los puntos del dispositivo: solo de los recibos.
//   - El par de cada resultado de la cuenta lo pone el servidor, así que el ELO sale igual en todos los dispositivos.
//   - Favoritos: al entrar desde un dispositivo se juntan los suyos y los de la cuenta; después, gana el cambio más
//     reciente (`favoritesSync`).
//   - El nivel de spoilers nunca pasa por aquí.
import { parOf } from "./elo.ts";
import { parseFavorites, sameFavorites, unionFavorites, type Favorites } from "./favorites.ts";
import { CHALLENGES, isMarksRow, parseProgress, type ChallengeId, type ChallengeResult, type GamesProgress } from "./games.ts";

/** La sesión de Supabase Auth en el dispositivo (las llaves de la sesión, el id y el email de Google). */
export const ACCOUNT_STORAGE_KEY = "hoopmeter:cuenta";
/** Código de un solo uso mientras se entra con Google (PKCE): lo pone Supabase con el nombre de la sesión. */
export const ACCOUNT_VERIFIER_KEY = "hoopmeter:cuenta-code-verifier";
/** Vuelta de Google a la app de Android (intent-filter de `AndroidManifest.xml`). */
export const NATIVE_AUTH_REDIRECT = "com.hoopmeter.app://auth";

export type AccountView = {
  alias: string;
  /** Último cambio de alias (ISO); null si no lo ha cambiado desde que creó la cuenta. */
  aliasChangedAt: string | null;
  createdAt: string;
  favorites: Favorites;
  /** Cuándo cambiaron los favoritos (ms del dispositivo que los cambió). */
  favoritesAt: number;
  /** Por días y, dentro de cada día, en el orden en que se jugaron. */
  results: ChallengeResult[];
};

const challengeIds = new Set<string>(CHALLENGES.map((c) => c.id));
const isText = (value: unknown): value is string => typeof value === "string" && value !== "";
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Las filas de `account_results` (`cuentas.sql`) como resultados del dispositivo, con el par que calculó el servidor. */
export function resultsFromRows(rows: unknown): ChallengeResult[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row): ChallengeResult[] => {
    const { day, game, points, rows: marks, par_n, par_median } = (row ?? {}) as Record<string, unknown>;
    if (!isText(day) || !DAY.test(day) || !challengeIds.has(game as string) || !Number.isInteger(points)) return [];
    const id = game as ChallengeId;
    const n = typeof par_n === "number" && Number.isFinite(par_n) ? par_n : 0;
    const median = typeof par_median === "number" && Number.isFinite(par_median) ? par_median : 0;
    return [{ day, game: id, points: points as number, rows: Array.isArray(marks) ? marks.filter(isMarksRow) : [], par: parOf(id, { n, median }) }];
  });
}

/** La cuenta tal como la devuelve `account_get` (o null si aún no ha elegido alias). */
export function accountFromRow(row: unknown): AccountView | null {
  if (!row || typeof row !== "object") return null;
  const { alias, alias_changed_at, created_at, favorites, favorites_at, results } = row as Record<string, unknown>;
  if (!isText(alias) || !isText(created_at)) return null;
  return {
    alias,
    aliasChangedAt: isText(alias_changed_at) ? alias_changed_at : null,
    createdAt: created_at,
    favorites: parseFavorites(JSON.stringify(favorites ?? null)),
    favoritesAt: typeof favorites_at === "number" && Number.isSafeInteger(favorites_at) && favorites_at > 0 ? favorites_at : 0,
    results: resultsFromRows(results),
  };
}

/** La cuenta que llega de `/api/cuenta`, sin fiarse: lo que no cuadra, fuera. */
export function readAccountView(value: unknown): AccountView | null {
  if (!value || typeof value !== "object") return null;
  const { alias, aliasChangedAt, createdAt, favorites, favoritesAt, results } = value as Record<string, unknown>;
  if (!isText(alias) || !isText(createdAt)) return null;
  return {
    alias,
    aliasChangedAt: isText(aliasChangedAt) ? aliasChangedAt : null,
    createdAt,
    favorites: parseFavorites(JSON.stringify(favorites ?? null)),
    favoritesAt: typeof favoritesAt === "number" && Number.isSafeInteger(favoritesAt) && favoritesAt > 0 ? favoritesAt : 0,
    results: parseProgress(JSON.stringify({ results: Array.isArray(results) ? results : [] })).results,
  };
}

const keyOf = (r: Pick<ChallengeResult, "day" | "game">) => `${r.day}|${r.game}`;

/**
 * Lo jugado en el dispositivo con los resultados de la cuenta: para cada reto y día manda la cuenta; lo que solo tiene
 * el dispositivo se queda. Devuelve el mismo objeto si no cambia nada.
 */
export function mergeAccountResults(progress: GamesProgress, account: readonly ChallengeResult[]): GamesProgress {
  const inAccount = new Set(account.map(keyOf));
  const localOnly = progress.results.filter((r) => !inAccount.has(keyOf(r)));
  // `sort` es estable: dentro de un día, primero los de la cuenta en su orden y después los del dispositivo
  const results = [...account, ...localOnly].sort((a, b) => (a.day === b.day ? 0 : a.day < b.day ? -1 : 1));
  return JSON.stringify(results) === JSON.stringify(progress.results) ? progress : { ...progress, results };
}

/** Recibos del dispositivo de retos que la cuenta aún no tiene, en el orden en que se jugaron. */
export function pendingReceipts(progress: GamesProgress, account: readonly ChallengeResult[]): string[] {
  const inAccount = new Set(account.map(keyOf));
  return progress.results.filter((r) => r.receipt && !inAccount.has(keyOf(r))).map((r) => r.receipt!);
}

export type FavoritesPlan = {
  /** Lo que se queda en el dispositivo, si cambia. */
  local?: { favorites: Favorites; at: number };
  /** Lo que se sube a la cuenta, si cambia. */
  push?: { favorites: Favorites; at: number };
};

/**
 * Qué hacer con los favoritos. Al entrar desde un dispositivo (`linking`), juntos: primero los del dispositivo y después
 * los que solo tiene la cuenta. Después, gana el cambio más reciente (quitar uno en el móvil lo quita en el ordenador).
 */
export function favoritesSync(
  device: { favorites: Favorites; at: number },
  account: { favorites: Favorites; at: number },
  { linking, now }: { linking: boolean; now: number }
): FavoritesPlan {
  if (linking) {
    const joined = unionFavorites(device.favorites, account.favorites);
    if (sameFavorites(joined, account.favorites)) {
      return sameFavorites(device.favorites, joined) ? {} : { local: { favorites: joined, at: account.at } };
    }
    const at = Math.max(now, account.at + 1);
    return { local: { favorites: joined, at }, push: { favorites: joined, at } };
  }
  if (sameFavorites(device.favorites, account.favorites)) return {};
  if (device.at > account.at) return { push: device };
  return { local: account };
}

/** Lo que pasa a la cuenta al crearla: cuántos retos con recibo y cuántos favoritos. */
export function transferSummary(progress: GamesProgress, favorites: Favorites): { results: number; favorites: number } {
  return { results: progress.results.filter((r) => r.receipt).length, favorites: favorites.teams.length + favorites.players.length };
}
