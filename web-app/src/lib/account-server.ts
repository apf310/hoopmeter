// Cuentas en el servidor (Tarea 8.5): quién llama (token de Supabase Auth) y las funciones de `cuentas.sql`. Solo servidor.
//
// La base de datos se fía de lo que le diga la web (con la clave del GM): por eso aquí se comprueba siempre el token de
// la sesión con Supabase Auth antes de pasar el id del usuario, y los resultados solo llegan con recibo válido.
import { accountFromRow, resultsFromRows, type AccountView } from "./account";
import { verifyReceipt, receiptKey, type Receipt } from "./game-receipt";
import { callGameDb, gameSecret } from "./game-runs";
import { parseFavorites, type Favorites } from "./favorites";
import type { ChallengeResult } from "./games";
import { getSupabase } from "./supabase";

/** Sin la clave del GM (en local) no hay cuentas: la web lo dice y todo sigue funcionando sin ellas. */
export const accountsEnabled = () => gameSecret() !== null;

/**
 * El usuario de la sesión que manda la app (`Authorization: Bearer …`), comprobado con Supabase Auth; null si el token no
 * vale (caducado, de una cuenta borrada…). Si Supabase Auth no responde, lanza: la app no debe cerrar la sesión por eso.
 */
export async function accountUser(request: Request): Promise<string | null> {
  const token = request.headers.get("authorization")?.match(/^Bearer ([\w.-]{20,4096})$/)?.[1];
  if (!token) return null;
  const { data, error } = await getSupabase().auth.getUser(token);
  if (error) {
    if (error.status !== undefined && error.status >= 400 && error.status < 500) return null;
    throw new Error(`Supabase Auth: ${error.message}`);
  }
  return data.user?.id ?? null;
}

const db = (name: string, args: Record<string, unknown>) => callGameDb(name, { p_secret: gameSecret(), ...args });

export async function getAccount(user: string): Promise<AccountView | null> {
  return accountFromRow(await db("account_get", { p_user: user }));
}

export async function createAccount(user: string, alias: string, key: string): Promise<"ok" | "taken" | "exists"> {
  const status = await db("account_create", { p_user: user, p_alias: alias, p_key: key });
  return status === "taken" ? "taken" : status === "exists" ? "exists" : "ok";
}

export type RenameStatus = { status: "ok" | "same" | "taken" } | { status: "too-soon"; next: string };

export async function renameAccount(user: string, alias: string, key: string): Promise<RenameStatus> {
  const result = (await db("account_rename", { p_user: user, p_alias: alias, p_key: key })) as { status?: unknown; next?: unknown } | null;
  if (result?.status === "too-soon" && typeof result.next === "string") return { status: "too-soon", next: result.next };
  return { status: result?.status === "taken" ? "taken" : result?.status === "same" ? "same" : "ok" };
}

/** Máximo de recibos de una vez: más de un año jugando los tres retos cada día. */
export const MAX_CLAIM = 500;

/**
 * Apunta en la cuenta los resultados de los recibos buenos (los demás no cuentan) y devuelve todos los de la cuenta.
 * Un recibo repetido, de una partida ya apuntada en otra cuenta o de un reto que ya tenía resultado ese día no cambia nada.
 */
export async function claimResults(user: string, tokens: readonly unknown[]): Promise<ChallengeResult[]> {
  const key = receiptKey();
  const seen = new Set<string>();
  const valid: Receipt[] = [];
  for (const token of tokens.slice(0, MAX_CLAIM)) {
    const receipt = key ? verifyReceipt(token, key) : null;
    if (!receipt || seen.has(receipt.run)) continue;
    seen.add(receipt.run);
    valid.push(receipt);
  }
  const rows = valid.map((r) => ({ game: r.game, day: r.day, points: r.points, total_ms: r.ms, rows: r.rows, run_id: r.run }));
  return resultsFromRows(await db("account_claim", { p_user: user, p_results: rows }));
}

/** Guarda los favoritos si son más recientes que los de la cuenta; devuelve los que valen. */
export async function saveFavorites(user: string, favorites: Favorites, at: number): Promise<{ favorites: Favorites; at: number }> {
  const saved = (await db("account_favorites", { p_user: user, p_favorites: favorites, p_at: at })) as { favorites?: unknown; favorites_at?: unknown } | null;
  const savedAt = typeof saved?.favorites_at === "number" ? saved.favorites_at : at;
  return { favorites: parseFavorites(JSON.stringify(saved?.favorites ?? null)), at: savedAt };
}

/** Borra la cuenta y el usuario de Auth (el id y el email de Google). */
export async function deleteAccount(user: string): Promise<void> {
  await db("account_delete", { p_user: user });
}
