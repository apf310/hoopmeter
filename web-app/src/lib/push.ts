// Aviso matinal sin spoilers (Tarea 6.14): preferencias del dispositivo y validación de suscripciones.
// Puro, sin dependencias (lo usan el cliente, la ruta /api/push y los tests). El texto del aviso lo
// escribe el servidor (backend-data/processors/morning_digest.py): aquí solo hay ejemplos para la UI.
import { favoriteTeamReasons, MAX_FAVORITES, type Favorites } from "./favorites.ts";

/** Horas de España que se pueden elegir (igual que HOURS en morning_digest.py y el check de push.sql). */
export const PUSH_HOURS = [8, 9, 10] as const;
export type PushHour = (typeof PUSH_HOURS)[number];
export const DEFAULT_PUSH_HOUR: PushHour = 8;
export type PushPlatform = "web" | "android";

/**
 * Lo que recuerda el dispositivo (localStorage). Es la preferencia del aviso, NUNCA el nivel de
 * spoilers: "con notas" solo cambia el texto del aviso, la app sigue arrancando en Nivel 1.
 */
export type PushState = {
  enabled: boolean;
  hour: PushHour;
  withScores: boolean;
  /** Endpoint web push o token FCM con el que se guardó (null si nunca se activó). */
  id: string | null;
  platform: PushPlatform | null;
  /** Favoritos que se enviaron por última vez: si cambian, se vuelve a guardar. */
  teamIds: number[];
};

export const PUSH_STORAGE_KEY = "hoopmeter:push";
export const DEFAULT_PUSH_STATE: PushState = Object.freeze({
  enabled: false,
  hour: DEFAULT_PUSH_HOUR,
  withScores: false,
  id: null,
  platform: null,
  teamIds: [],
}) as PushState;

export const isPushHour = (value: unknown): value is PushHour => PUSH_HOURS.includes(value as PushHour);

const isPlatform = (value: unknown): value is PushPlatform => value === "web" || value === "android";

const teamIdList = (value: unknown): number[] | null =>
  Array.isArray(value) && value.length <= MAX_FAVORITES && value.every((id) => Number.isInteger(id) && id > 0) ? value : null;

/** Lo guardado, o los valores por defecto si falta o está corrupto (desactivado: ante la duda, sin avisos). */
export function parsePushState(raw: string | null): PushState {
  try {
    const parsed: unknown = JSON.parse(raw ?? "null");
    if (!parsed || typeof parsed !== "object") return DEFAULT_PUSH_STATE;
    const p = parsed as Record<string, unknown>;
    const id = typeof p.id === "string" && p.id.length > 0 ? p.id : null;
    const platform = isPlatform(p.platform) ? p.platform : null;
    return {
      enabled: p.enabled === true && id !== null && platform !== null,
      hour: isPushHour(p.hour) ? p.hour : DEFAULT_PUSH_HOUR,
      withScores: p.withScores === true,
      id,
      platform,
      teamIds: teamIdList(p.teamIds) ?? [],
    };
  } catch {
    return DEFAULT_PUSH_STATE;
  }
}

/** Equipos cuyo partido nombra el aviso: los favoritos y los equipos de los jugadores favoritos. */
export function pushTeamIds(favorites: Favorites): number[] {
  return [...favoriteTeamReasons(favorites).keys()].sort((a, b) => a - b).slice(0, MAX_FAVORITES);
}

export const sameIds = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((id, i) => id === b[i]);

/** Servicios de push de los navegadores (igual que push.sql y notify_morning.py). */
const WEB_PUSH_ENDPOINT =
  /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com|[a-z0-9.-]+\.push\.apple\.com)\//;
const FCM_TOKEN = /^[A-Za-z0-9_:-]+$/;
const B64URL = /^[A-Za-z0-9_-]+=*$/;

export type PushSubscriptionBody = {
  id: string;
  platform: PushPlatform;
  keys: { p256dh: string; auth: string } | null;
  hour: PushHour;
  withScores: boolean;
  teamIds: number[];
};

/** Valida lo que llega a POST /api/push (la base de datos vuelve a validarlo en push_subscribe). */
export function parseSubscriptionBody(body: unknown): PushSubscriptionBody | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.id !== "string" || !isPlatform(b.platform) || !isPushHour(b.hour) || typeof b.withScores !== "boolean") return null;
  const teamIds = teamIdList(b.teamIds);
  if (!teamIds) return null;

  if (b.platform === "web") {
    if (b.id.length < 20 || b.id.length > 1000 || /\s/.test(b.id) || !WEB_PUSH_ENDPOINT.test(b.id)) return null;
    const keys = b.keys as Record<string, unknown> | null | undefined;
    const p256dh = keys?.p256dh;
    const auth = keys?.auth;
    if (typeof p256dh !== "string" || typeof auth !== "string") return null;
    if (p256dh.length > 200 || auth.length > 100 || !B64URL.test(p256dh) || !B64URL.test(auth)) return null;
    return { id: b.id, platform: "web", keys: { p256dh, auth }, hour: b.hour, withScores: b.withScores, teamIds };
  }
  if (b.id.length < 20 || b.id.length > 400 || !FCM_TOKEN.test(b.id)) return null;
  return { id: b.id, platform: "android", keys: null, hour: b.hour, withScores: b.withScores, teamIds };
}

/** Ejemplos de la pantalla de avisos (el texto real lo escribe el servidor con la jornada de anoche). */
export const PUSH_EXAMPLES = {
  title: "La jornada de anoche ya está lista",
  withoutScores: "8 partidos, incluido un Celtics-Magic.",
  withScores: "8 partidos y 2 partidazos: el mejor, un Celtics-Magic (9,1).",
} as const;
