"use client";

// La cuenta en el dispositivo (Tarea 8.5): sesión de Supabase Auth con Google, alias y sincronización de favoritos y
// resultados. Supabase solo se descarga si hay sesión guardada o al pulsar "Entrar con Google": quien no tiene cuenta no
// carga nada de esto.
//
// Al abrir la app con sesión: se pide la cuenta (`/api/cuenta`, que comprueba el token), se suben los favoritos si son
// más recientes (o bajan los de la cuenta), se mandan los recibos de lo jugado sin cuenta y los resultados de la cuenta
// pasan al dispositivo (mandan ellos). Con la sesión abierta, cada reto acabado y cada cambio de favoritos van a la cuenta
// al momento. El nivel de spoilers nunca pasa por aquí: la app sigue abriéndose en "Todo oculto".
import { useSyncExternalStore } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import {
  ACCOUNT_STORAGE_KEY,
  ACCOUNT_VERIFIER_KEY,
  favoritesSync,
  NATIVE_AUTH_REDIRECT,
  pendingReceipts,
  readAccountView,
  type AccountView,
} from "@/lib/account";
import { deviceFavorites, replaceFavorites, setFavoritesEditListener } from "@/lib/favorites-store";
import { parseFavorites, sameFavorites } from "@/lib/favorites";
import { forgetReceipts, gamesProgressNow, replaceGameResults, setResultListener } from "@/lib/games-store";
import { parseProgress, type ChallengeResult } from "@/lib/games";
import { closeAuthBrowser, isNativeApp, openAuthBrowser } from "@/lib/native";

export type AccountState =
  /** En el servidor y al hidratar: aún no se sabe. */
  | { status: "unknown" }
  | { status: "signed-out"; notice?: string }
  | { status: "loading" }
  /** Ha entrado con Google, pero aún no ha elegido alias: no hay cuenta. */
  | { status: "needs-alias"; email: string | null }
  | { status: "ready"; email: string | null; account: AccountView }
  /** Hay sesión, pero la cuenta no responde (sin conexión o Supabase caído): nada se pierde. */
  | { status: "unavailable"; email: string | null; message: string };

const UNKNOWN: AccountState = { status: "unknown" };
const API = "/api/cuenta";
/** Al volver a la app, se vuelve a pedir la cuenta si hace más de esto. */
const REFRESH_MS = 10 * 60_000;
const CLAIM_BATCH = 500;

let state: AccountState = UNKNOWN;
const listeners = new Set<() => void>();
let lastSync = 0;

function set(next: AccountState) {
  state = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** La cuenta en este dispositivo ("unknown" en el servidor y al hidratar). */
export function useAccount(): AccountState {
  return useSyncExternalStore(subscribe, () => state, () => UNKNOWN);
}

export class AccountError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
    readonly data: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------------------------------------
// Sesión (Supabase Auth, bajo demanda)

let client: Promise<SupabaseClient> | null = null;

function authClient(): Promise<SupabaseClient> {
  client ??= import("@supabase/supabase-js").then(({ createClient }) => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY");
    return createClient(url, key, {
      auth: { storageKey: ACCOUNT_STORAGE_KEY, flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
  });
  client.catch(() => {
    client = null;
  });
  return client;
}

function hasStoredSession(): boolean {
  try {
    return localStorage.getItem(ACCOUNT_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

async function currentSession(): Promise<Session | null> {
  const { data } = await (await authClient()).auth.getSession();
  return data.session;
}

/** Cierra la sesión en este dispositivo (lo guardado en él se queda) y borra sus llaves. */
async function endLocalSession() {
  try {
    if (hasStoredSession()) await (await authClient()).auth.signOut({ scope: "local" });
  } catch {
    // Sin conexión: basta con borrar las llaves
  }
  try {
    localStorage.removeItem(ACCOUNT_STORAGE_KEY);
    localStorage.removeItem(ACCOUNT_VERIFIER_KEY);
  } catch {
    // Sin almacenamiento: no había nada
  }
}

async function call<T>(method: "GET" | "POST" | "DELETE", body?: Record<string, unknown>): Promise<T> {
  const session = await currentSession();
  if (!session) throw new AccountError("Tu sesión ha caducado: vuelve a entrar.", 401, "session");
  let response: Response;
  try {
    response = await fetch(API, {
      method,
      cache: "no-store",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new AccountError("Se ha perdido la conexión.", 0, "network");
  }
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new AccountError(typeof data.error === "string" ? data.error : "No se ha podido conectar.", response.status, typeof data.code === "string" ? data.code : null, data);
  }
  return data as T;
}

const messageOf = (error: unknown) => (error instanceof AccountError ? error.message : "No se ha podido conectar.");

// ---------------------------------------------------------------------------------------------------------
// Sincronización

const readResults = (value: unknown): ChallengeResult[] => parseProgress(JSON.stringify({ results: Array.isArray(value) ? value : [] })).results;

/** Manda a la cuenta los recibos de lo que aún no tiene y devuelve la cuenta con todos sus resultados. */
async function claimPending(account: AccountView): Promise<AccountView> {
  let current = account;
  for (;;) {
    const receipts = pendingReceipts(gamesProgressNow(), current.results).slice(0, CLAIM_BATCH);
    if (receipts.length === 0) return current;
    const { results } = await call<{ results: unknown }>("POST", { action: "claim", receipts });
    // Estén o no en la cuenta (un recibo de otra cuenta no vale), no se vuelven a mandar
    forgetReceipts(new Set(receipts));
    current = { ...current, results: readResults(results) };
    if (receipts.length < CLAIM_BATCH) return current;
  }
}

async function pushFavorites(account: AccountView, favorites: AccountView["favorites"], at: number): Promise<AccountView> {
  const saved = await call<{ favorites: unknown; at: unknown }>("POST", { action: "favorites", favorites, at });
  const next = { ...account, favorites: parseFavorites(JSON.stringify(saved.favorites ?? null)), favoritesAt: typeof saved.at === "number" ? saved.at : at };
  // Otro dispositivo los cambió aún más tarde: valen esos
  if (!sameFavorites(next.favorites, favorites)) replaceFavorites(next.favorites, next.favoritesAt);
  return next;
}

/** Junta lo del dispositivo y la cuenta. `linking` = acaba de entrar desde este dispositivo: los favoritos se juntan. */
async function sync(account: AccountView, linking: boolean): Promise<AccountView> {
  let next = account;
  try {
    const plan = favoritesSync(deviceFavorites(), { favorites: account.favorites, at: account.favoritesAt }, { linking, now: Date.now() });
    if (plan.local) replaceFavorites(plan.local.favorites, plan.local.at);
    if (plan.push) next = await pushFavorites(next, plan.push.favorites, plan.push.at);
  } catch (error) {
    console.error("[cuenta] favoritos sin sincronizar:", messageOf(error));
  }
  try {
    next = await claimPending(next);
  } catch (error) {
    console.error("[cuenta] resultados sin mandar:", messageOf(error));
  }
  replaceGameResults(next.results);
  lastSync = Date.now();
  return next;
}

const emailOf = (session: Session | null) => session?.user.email ?? null;

async function load({ linking }: { linking: boolean }) {
  if (state.status !== "ready") set({ status: "loading" });
  let email: string | null = null;
  try {
    const session = await currentSession();
    if (!session) return set({ status: "signed-out" });
    email = emailOf(session);
    const { account } = await call<{ account: unknown }>("GET");
    const view = readAccountView(account);
    if (!view) return set({ status: "needs-alias", email });
    set({ status: "ready", email, account: view });
    const synced = await sync(view, linking);
    if (state.status === "ready") set({ status: "ready", email, account: synced });
  } catch (error) {
    if (error instanceof AccountError && error.status === 401) {
      await endLocalSession();
      return set({ status: "signed-out", notice: "Tu sesión ha caducado: vuelve a entrar." });
    }
    if (state.status !== "ready") set({ status: "unavailable", email, message: messageOf(error) });
  }
}

// Con la sesión abierta: cada reto acabado y cada cambio de favoritos, a la cuenta al momento

async function onResult(): Promise<boolean> {
  if (state.status !== "ready") return false;
  const { email } = state;
  try {
    const account = await claimPending(state.account);
    replaceGameResults(account.results);
    if (state.status === "ready") set({ status: "ready", email, account });
    return true;
  } catch (error) {
    console.error("[cuenta] resultado sin mandar:", messageOf(error));
    return false;
  }
}

let favoritesTimer: ReturnType<typeof setTimeout> | null = null;

function onFavoritesEdited() {
  if (state.status !== "ready") return;
  if (favoritesTimer) clearTimeout(favoritesTimer);
  favoritesTimer = setTimeout(() => {
    favoritesTimer = null;
    if (state.status !== "ready") return;
    const { email, account } = state;
    const { favorites, at } = deviceFavorites();
    pushFavorites(account, favorites, at).then(
      (next) => state.status === "ready" && set({ status: "ready", email, account: next }),
      // Sin conexión: al volver a abrir la app suben (son más recientes que los de la cuenta)
      (error) => console.error("[cuenta] favoritos sin subir:", messageOf(error))
    );
  }, 800);
}

// ---------------------------------------------------------------------------------------------------------
// Lo que usan las pantallas

let started = false;

/** Al abrir la app (`AccountSync`): si hay sesión guardada, la cuenta; si no, nada que descargar. */
export function startAccount() {
  if (started) return;
  started = true;
  setResultListener(onResult);
  setFavoritesEditListener(onFavoritesEdited);
  // Ya está entrando (vuelta de Google en `/cuenta`): no hay que pedir nada más
  if (state.status !== "unknown") return;
  if (!hasStoredSession()) return set({ status: "signed-out" });
  void load({ linking: false });
}

/** Al volver a la app: la cuenta otra vez si hace rato (otro dispositivo pudo cambiar algo). */
export function refreshAccount() {
  if ((state.status === "ready" || state.status === "unavailable") && Date.now() - lastSync > REFRESH_MS) void load({ linking: false });
}

/** "Volver a intentarlo" cuando la cuenta no respondía. */
export const retryAccount = () => load({ linking: false });

/**
 * "Entrar con Google". En la web, la página va a Google y vuelve a `/cuenta?code=…` (`completeSignIn`); en la app de
 * Android, se abre en el navegador del sistema y vuelve con `com.hoopmeter.app://auth?code=…` (`completeNativeSignIn`).
 */
export async function signInWithGoogle(back: string | null): Promise<void> {
  const { auth } = await authClient();
  const queryParams = { prompt: "select_account" };
  if (isNativeApp()) {
    const { data, error } = await auth.signInWithOAuth({ provider: "google", options: { redirectTo: NATIVE_AUTH_REDIRECT, skipBrowserRedirect: true, queryParams } });
    if (error || !data.url) throw new AccountError("No se ha podido abrir Google.", 0, "oauth");
    await openAuthBrowser(data.url);
    return;
  }
  const redirectTo = new URL("/cuenta", window.location.origin);
  if (back) redirectTo.searchParams.set("volver", back);
  const { error } = await auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectTo.toString(), queryParams } });
  if (error) throw new AccountError("No se ha podido abrir Google.", 0, "oauth");
}

const exchanges = new Map<string, Promise<void>>();

/** La vuelta de Google con su código de un solo uso: la sesión y, después, la cuenta (con los favoritos juntos). */
export function completeSignIn(code: string): Promise<void> {
  let exchange = exchanges.get(code);
  if (!exchange) {
    exchange = (async () => {
      set({ status: "loading" });
      try {
        const { error } = await (await authClient()).auth.exchangeCodeForSession(code);
        if (error) throw error;
      } catch {
        return set({ status: "signed-out", notice: "No se ha podido entrar con Google. Inténtalo otra vez." });
      }
      await load({ linking: true });
    })();
    exchanges.set(code, exchange);
  }
  return exchange;
}

/** Google no ha dejado entrar (o se ha cancelado). */
export function failSignIn(cancelled: boolean) {
  set({ status: "signed-out", notice: cancelled ? "Has cancelado la entrada con Google." : "No se ha podido entrar con Google. Inténtalo otra vez." });
}

/** La vuelta de Google en la app de Android. true si trae un código (entonces se abre `/cuenta`). */
export async function completeNativeSignIn(url: string): Promise<boolean> {
  await closeAuthBrowser();
  let params: URLSearchParams;
  try {
    params = new URL(url).searchParams;
  } catch {
    return false;
  }
  const code = params.get("code");
  if (code) {
    void completeSignIn(code);
    return true;
  }
  if (params.get("error")) failSignIn(params.get("error") === "access_denied");
  return params.has("error");
}

/** Crea la cuenta con su alias. null si ha ido bien; si no, el texto del error (y el código, "taken"…). */
export async function createAccount(alias: string): Promise<{ error: string; code: string | null } | null> {
  const email = state.status === "needs-alias" ? state.email : null;
  try {
    const { account } = await call<{ account: unknown }>("POST", { action: "create", alias, adult: true });
    const view = readAccountView(account);
    if (!view) return { error: "No se ha podido crear la cuenta.", code: null };
    set({ status: "ready", email, account: view });
    const synced = await sync(view, true);
    if (state.status === "ready") set({ status: "ready", email, account: synced });
    return null;
  } catch (error) {
    return { error: messageOf(error), code: error instanceof AccountError ? error.code : null };
  }
}

/** Cambia el alias. null si ha ido bien; si no, el error y, si es pronto, cuándo se podrá (`next`, ISO). */
export async function renameAlias(alias: string): Promise<{ error: string; code: string | null; next: string | null } | null> {
  try {
    const result = await call<{ alias: string }>("POST", { action: "rename", alias });
    if (state.status === "ready") {
      const changed = result.alias !== state.account.alias;
      const aliasChangedAt = changed ? new Date().toISOString() : state.account.aliasChangedAt;
      set({ ...state, account: { ...state.account, alias: result.alias, aliasChangedAt } });
    }
    return null;
  } catch (error) {
    const next = error instanceof AccountError && typeof error.data.next === "string" ? error.data.next : null;
    return { error: messageOf(error), code: error instanceof AccountError ? error.code : null, next };
  }
}

/** Cierra la sesión: lo guardado en el dispositivo se queda (para quitarlo, "Borrar los datos de este dispositivo"). */
export async function signOut() {
  await endLocalSession();
  set({ status: "signed-out" });
}

/** Borra la cuenta y todo lo suyo en el servidor, y cierra la sesión. null si ha ido bien; si no, el error. */
export async function deleteAccount(): Promise<string | null> {
  try {
    await call("DELETE");
  } catch (error) {
    return error instanceof AccountError && error.status === 401 ? "Tu sesión ha caducado: vuelve a entrar para borrarla." : messageOf(error);
  }
  await endLocalSession();
  set({ status: "signed-out", notice: "Cuenta borrada. Lo de este dispositivo sigue aquí hasta que lo borres." });
  return null;
}

/** "Borrar los datos de este dispositivo" (/privacidad): también la sesión. La cuenta sigue en el servidor. */
export async function forgetAccountOnDevice() {
  await endLocalSession();
  if (state.status !== "unknown") set({ status: "signed-out" });
}
