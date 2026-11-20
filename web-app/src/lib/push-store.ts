"use client";

// Aviso matinal (Tarea 6.14): alta, cambios y baja del aviso en este dispositivo (web push o FCM en la
// app nativa). La preferencia vive en localStorage; el nivel de spoilers, jamás (sigue en sessionStorage
// y la app siempre arranca en Nivel 1).
import { useSyncExternalStore } from "react";
import { Capacitor } from "@capacitor/core";
import { isNativeApp, registerNativePush, unregisterNativePush } from "@/lib/native";
import {
  DEFAULT_PUSH_STATE,
  PUSH_STORAGE_KEY,
  parsePushState,
  sameIds,
  type PushHour,
  type PushPlatform,
  type PushState,
} from "@/lib/push";

/** Clave pública VAPID (la privada solo está en el secreto VAPID_PRIVATE_KEY de GitHub). */
const VAPID_PUBLIC_KEY = "BM9HJa2yogWbV38SkR_bdiR8_FbIzOq8tesFYQ9sA69S0KmjpTJQQmWS5KjOVOJ7oa9HOh4RUJP1zBomGttzMs8";

export type PushSupport = "native" | "web" | "ios-install" | "unsupported";
export type PushErrorCode = "denied" | "unsupported" | "server" | "device";

export class PushError extends Error {
  constructor(readonly code: PushErrorCode) {
    super(code);
  }
}

const listeners = new Set<() => void>();
let current: PushState | null = null;

function snapshot(): PushState {
  if (current === null) {
    try {
      current = parsePushState(localStorage.getItem(PUSH_STORAGE_KEY));
    } catch {
      current = DEFAULT_PUSH_STATE;
    }
  }
  return current;
}

function write(next: PushState) {
  current = next;
  try {
    localStorage.setItem(PUSH_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Sin almacenamiento: dura lo que la sesión
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Preferencias del aviso. En el servidor y al hidratar, desactivado (la pantalla no salta: se pinta igual). */
export function usePushState(): PushState {
  return useSyncExternalStore(subscribe, snapshot, () => DEFAULT_PUSH_STATE);
}

export function getPushSupport(): PushSupport {
  if (isNativeApp()) return Capacitor.getPlatform() === "android" ? "native" : "unsupported";
  if ("serviceWorker" in navigator && "PushManager" in window && "Notification" in window) return "web";
  // iPhone/iPad: Safari solo admite avisos con la web añadida a la pantalla de inicio (iOS 16.4+)
  if (/iPhone|iPad|iPod/.test(navigator.userAgent)) return "ios-install";
  return "unsupported";
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function serviceWorker(): Promise<ServiceWorkerRegistration> {
  // En desarrollo y si aún no se registró, se registra aquí (ServiceWorkerRegistrar solo lo hace en producción)
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (!existing) await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  return navigator.serviceWorker.ready;
}

type Subscription = { id: string; platform: PushPlatform; keys: { p256dh: string; auth: string } | null };

/** Suscripción de este dispositivo. `ask`: pedir permiso si aún no lo dio (solo al pulsar "Activar"). */
async function deviceSubscription(ask: boolean): Promise<Subscription> {
  const support = getPushSupport();
  if (support === "native") {
    try {
      return { id: await registerNativePush(), platform: "android", keys: null };
    } catch (error) {
      throw new PushError(error instanceof Error && error.message === "denied" ? "denied" : "device");
    }
  }
  if (support !== "web") throw new PushError("unsupported");

  let permission = Notification.permission;
  if (permission === "default" && ask) permission = await Notification.requestPermission();
  if (permission !== "granted") throw new PushError("denied");

  try {
    const registration = await serviceWorker();
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(VAPID_PUBLIC_KEY) }));
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error("incomplete");
    return { id: json.endpoint, platform: "web", keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } };
  } catch {
    throw new PushError("device");
  }
}

async function save(subscription: Subscription, prefs: { hour: PushHour; withScores: boolean; teamIds: number[] }) {
  const response = await fetch("/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...subscription, ...prefs }),
  }).catch(() => null);
  if (!response?.ok) throw new PushError("server");
}

/** "Activar": pide permiso, guarda la suscripción en el servidor y la recuerda en el dispositivo. */
export async function enablePush(hour: PushHour, withScores: boolean, teamIds: number[]) {
  const subscription = await deviceSubscription(true);
  await save(subscription, { hour, withScores, teamIds });
  write({ enabled: true, hour, withScores, id: subscription.id, platform: subscription.platform, teamIds });
}

/** Cambia la hora, el tipo o los favoritos. Desactivado, solo se recuerda para cuando se active. */
export async function changePush(change: Partial<Pick<PushState, "hour" | "withScores" | "teamIds">>) {
  const state = snapshot();
  const next = { ...state, ...change };
  if (state.enabled) {
    // Las claves web no se guardan en el dispositivo: se leen de la suscripción del navegador
    const subscription = await deviceSubscription(false);
    await save(subscription, next);
    next.id = subscription.id;
    next.platform = subscription.platform;
  }
  write(next);
}

/** "Desactivar". Aunque falle la red, la suscripción del dispositivo se anula: el servidor la borra al ver que ya no existe. */
export async function disablePush() {
  const state = snapshot();
  write({ ...state, enabled: false });
  if (state.id) {
    await fetch("/api/push", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: state.id }),
    }).catch(() => null);
  }
  try {
    if (state.platform === "android") await unregisterNativePush();
    else if (state.platform === "web") await (await navigator.serviceWorker.getRegistration("/"))?.pushManager.getSubscription().then((s) => s?.unsubscribe());
  } catch {
    // Ya no existía
  }
}

let refreshed = false;

/**
 * Una vez por apertura, con el aviso activado: si el navegador o FCM cambiaron la suscripción, o cambiaron
 * los favoritos, se vuelve a guardar. Si el usuario quitó el permiso desde los ajustes, queda desactivado.
 */
export async function refreshPush(teamIds: number[]) {
  const state = snapshot();
  if (!state.enabled) return;
  const firstTime = !refreshed;
  refreshed = true;
  if (!firstTime && sameIds(state.teamIds, teamIds)) return;
  try {
    const subscription = await deviceSubscription(false);
    if (subscription.id !== state.id || !sameIds(state.teamIds, teamIds)) {
      await save(subscription, { hour: state.hour, withScores: state.withScores, teamIds });
      write({ ...state, id: subscription.id, platform: subscription.platform, teamIds });
    }
  } catch (error) {
    if (error instanceof PushError && (error.code === "denied" || error.code === "unsupported")) write({ ...state, enabled: false });
  }
}
