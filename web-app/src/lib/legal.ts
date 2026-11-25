// Páginas legales (Tarea 6.26): quién responde de la app, cómo contactar y qué guarda el dispositivo.
// Puro, sin dependencias de React: lo usan /privacidad, /aviso-legal, /acerca y sus tests. Si la app
// empieza a guardar algo nuevo (cuentas, publicidad), se añade aquí y se cambia `LEGAL_UPDATED`. La analítica
// (Tarea 6.27, Vercel Web Analytics) no guarda nada en el dispositivo: no va en DEVICE_DATA.
import { FAVORITES_COOKIE, FAVORITES_STORAGE_KEY } from "./favorites.ts";
import { PUSH_STORAGE_KEY } from "./push.ts";
import { RECENT_SEARCH_KEY } from "./search.ts";
import { DEFERRED_POSITION_PREFIX } from "./deferred-position.ts";
import { SPOILER_STORAGE_KEY } from "./spoilers.ts";

export const LEGAL = {
  /** Persona física responsable del tratamiento (RGPD) y titular del sitio (LSSI). */
  owner: "Alejandro Peláez Fernández",
  email: "hoopmeter@alpelabs.dev",
  country: "España",
  /** Edad mínima para consentir por uno mismo en España (art. 7 LOPDGDD). */
  minAge: 14,
} as const;

/** Fecha de la última versión de los textos (ISO). */
export const LEGAL_UPDATED = "2026-11-25";

export const LEGAL_PAGES = [
  { href: "/acerca", label: "Acerca de" },
  { href: "/privacidad", label: "Privacidad y cookies" },
  { href: "/aviso-legal", label: "Aviso legal" },
] as const;

/** Aviso corto de no afiliación (pie de página y "Acerca de"). */
export const NBA_DISCLAIMER =
  "Hoopmeter es un proyecto independiente: no está afiliado, patrocinado ni respaldado por la NBA ni por sus equipos.";

export type DeviceItem = {
  /** Nombre exacto en el navegador (los prefijos acaban en ":"). */
  key: string;
  where: "cookie" | "localStorage" | "sessionStorage";
  what: string;
  lasts: string;
  /** Lo borra el botón "Borrar los datos de este dispositivo". */
  clearable: boolean;
};

/**
 * Todo lo que la app guarda en el dispositivo. Son técnicos y los pide el propio usuario (art. 22.2 LSSI):
 * no hace falta banner de cookies. El test comprueba que están todas las claves de la app.
 */
export const DEVICE_DATA: readonly DeviceItem[] = [
  {
    key: SPOILER_STORAGE_KEY,
    where: "sessionStorage",
    what: "El nivel de spoilers elegido, para no perderlo al cambiar de pantalla.",
    lasts: "Hasta cerrar la pestaña o la app, o 15 minutos en segundo plano. Al abrir, siempre vuelve a «Todo oculto».",
    clearable: false,
  },
  {
    key: DEFERRED_POSITION_PREFIX,
    where: "sessionStorage",
    what: "Por dónde vas en cada partido que ves en diferido.",
    lasts: "Hasta cerrar la pestaña o la app.",
    clearable: false,
  },
  {
    key: FAVORITES_STORAGE_KEY,
    where: "localStorage",
    what: "Tus equipos y jugadores favoritos (ids, nombre y equipo).",
    lasts: "Hasta que los quites o borres los datos.",
    clearable: true,
  },
  {
    key: FAVORITES_COOKIE,
    where: "cookie",
    what: "Solo los ids de tus favoritos, para que la portada llegue ya ordenada. El servidor la lee y no la guarda.",
    lasts: "400 días (lo máximo que permiten los navegadores) o hasta borrar los datos.",
    clearable: true,
  },
  {
    key: RECENT_SEARCH_KEY,
    where: "localStorage",
    what: "Tus últimas búsquedas (solo ids de equipos y jugadores).",
    lasts: "Hasta que pulses «Borrar» en el buscador o borres los datos.",
    clearable: true,
  },
  {
    key: PUSH_STORAGE_KEY,
    where: "localStorage",
    what: "Si tienes activado el aviso de la mañana, su hora y su tipo.",
    lasts: "Hasta que lo desactives o borres los datos.",
    clearable: true,
  },
];

/** "22 de noviembre de 2026". */
export function formatLegalDate(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`)
  );
}

/** Enlace de correo con el asunto ya escrito ("Borrar mis datos", "Ejercer mis derechos"...). */
export function mailto(subject: string): string {
  return `mailto:${LEGAL.email}?subject=${encodeURIComponent(subject)}`;
}
