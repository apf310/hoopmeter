// SEO y enlaces compartidos (Tarea 6.25). Puro: textos de los metadatos y de las imágenes de previsualización.
// Quien recibe un enlace no ha elegido nivel de spoilers, así que todo lo de aquí es Nivel 1: emparejamiento,
// fecha y hora. Nunca nota, marcador, estado ("Final", "En directo"), duración ni prórroga: las funciones solo
// reciben esos campos, y un test comprueba que un partido con resultado da exactamente el mismo texto.
import type { Metadata } from "next";
import { BRAND } from "./brand.ts";
import { formatDayMonth, formatGameTime, formatWeekday, gameDayOf, madridDayIfDifferent } from "./game-day.ts";

export const SITE_URL = "https://hoopmeter.com";
export const SITE_NAME = "Hoopmeter";
export const SITE_DESCRIPTION =
  "La NBA en español sin spoilers: qué partido ver por su nota del 1 al 10, resultados solo si los pides, fichas de jugadores, clasificación y GM Virtual.";

/** Imagen de la marca (`app/opengraph-image.tsx`). */
export const BRAND_IMAGE = "/opengraph-image";

/** Tamaño estándar de Open Graph (WhatsApp, X, Telegram, Facebook, LinkedIn). */
export const OG_SIZE = { width: 1200, height: 630 } as const;

type PageMeta = {
  /** Sin la marca: "Clasificación" → "Clasificación · Hoopmeter". Sin título = la portada (marca y eslogan). */
  title?: string;
  description?: string;
  /** Ruta canónica, sin parámetros que cambien de un usuario a otro. */
  path: string;
  /**
   * Imagen propia (ruta del sitio); sin ella, la de la marca (la de la raíz no se hereda si la página define
   * `openGraph`). `null` = la del `opengraph-image` del segmento (partido, jugador, equipo), que esta pisaría.
   */
  image?: string | null;
};

export function pageTitle(title?: string): string {
  return title ? `${title} · ${SITE_NAME}` : `${SITE_NAME} · ${BRAND.claim}`;
}

/**
 * Metadatos completos de una página: título, descripción, canónica, Open Graph y X. Next.js no hereda
 * `openGraph` campo a campo (el hijo sustituye al padre entero), así que cada página lo lleva todo.
 */
export function pageMetadata({ title, description = SITE_DESCRIPTION, path, image = BRAND_IMAGE }: PageMeta): Metadata {
  const fullTitle = pageTitle(title);
  const images = image === null ? undefined : [{ url: image, ...OG_SIZE, alt: fullTitle }];
  return {
    title: fullTitle,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: "es_ES",
      url: path,
      title: fullTitle,
      description,
      ...(images && { images }),
    },
    twitter: { card: "summary_large_image", title: fullTitle, description, ...(images && { images }) },
  };
}

type TeamName = { name: string; abbreviation: string };
/** Lo único de un partido que puede ir en un enlace: ni marcador, ni nota, ni estado. */
type MatchupDate = { game_datetime_utc: string };

/** "Jornada del sábado 21 de noviembre · 01:30 en España (dom 22)": la de la ficha del partido. */
export function gameDateLine(game: MatchupDate): string {
  const day = gameDayOf(game.game_datetime_utc);
  const madrugada = madridDayIfDifferent(game.game_datetime_utc, day);
  const time = `${formatGameTime(game.game_datetime_utc)} en España${madrugada ? ` (${madrugada})` : ""}`;
  return `Jornada del ${formatWeekday(day, "long")} ${formatDayMonth(day)} · ${time}`;
}

export function gameMeta(game: MatchupDate, away: TeamName, home: TeamName): { title: string; description: string } {
  return {
    title: `${away.abbreviation} @ ${home.abbreviation}`,
    description: `${away.name} en casa de ${home.name}. ${gameDateLine(game)}. Mira su nota antes de verlo, sin spoilers.`,
  };
}

type PlayerLine = { label: string; pts: number | null; reb: number | null; ast: number | null };

/** "Temporada 2026-27: 25.1 PTS · 7.3 REB · 8.2 AST" (promedios del job diario: valen en Nivel 1). */
export function playerLineText(line: PlayerLine | null): string | null {
  if (!line || line.pts == null) return null;
  const stat = (value: number | null, label: string) => (value == null ? null : `${value.toFixed(1)} ${label}`);
  return `${line.label}: ${[stat(line.pts, "PTS"), stat(line.reb, "REB"), stat(line.ast, "AST")].filter(Boolean).join(" · ")}`;
}

export function playerMeta(
  player: { full_name: string; is_active: boolean },
  position: string | null,
  team: { name: string } | null,
  line: PlayerLine | null
): { title: string; description: string } {
  const who = player.is_active
    ? [position, team ? `de ${team.name}` : "sin equipo"].filter(Boolean).join(" ")
    : "Leyenda de la NBA";
  const stats = playerLineText(line);
  return {
    title: player.full_name,
    description: `${player.full_name}: ${who}.${stats ? ` ${stats}.` : ""} Radar, trayectoria y palmarés en ${SITE_NAME}.`,
  };
}

/** Sin balance ni puesto: dependen de los resultados (la cabecera del equipo sigue el nivel, Tarea 6.6). */
export function teamMeta(team: { name: string }, conference: string | null, division: string | null): { title: string; description: string } {
  const where = [conference && `Conferencia ${conference}`, division && `División ${division}`].filter(Boolean).join(" · ");
  return {
    title: team.name,
    description: `${team.name}${where ? ` (${where})` : ""}: plantilla, próximos partidos y situación salarial, sin spoilers.`,
  };
}

export function compareMeta(a: { full_name: string } | null, b: { full_name: string } | null): { title: string; description: string } {
  if (a && b) {
    return {
      title: `${a.full_name} vs. ${b.full_name}`,
      description: `${a.full_name} contra ${b.full_name}: radares superpuestos, estadísticas y palmarés cara a cara.`,
    };
  }
  return {
    title: "Comparador",
    description: "Enfrenta a dos jugadores de cualquier época: radares superpuestos, estadísticas y palmarés.",
  };
}

/** Ids del comparador tal como llegan en la URL (`?a=2544&b=201939`). */
export function playerIdParam(value: string | string[] | undefined): number | null {
  const id = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

type SitemapEntry = { url: string; lastModified?: string; changeFrequency: "hourly" | "daily" | "weekly"; priority: number };

/** Páginas fijas del sitemap (sin `/avisos`: no tiene nada que buscar). */
export const STATIC_PAGES: readonly SitemapEntry[] = [
  { url: "/", changeFrequency: "hourly", priority: 1 },
  { url: "/que-ver", changeFrequency: "daily", priority: 0.9 },
  { url: "/standings", changeFrequency: "daily", priority: 0.8 },
  { url: "/teams", changeFrequency: "weekly", priority: 0.7 },
  { url: "/players", changeFrequency: "daily", priority: 0.7 },
  { url: "/gm-simulator", changeFrequency: "daily", priority: 0.7 },
  { url: "/compare", changeFrequency: "weekly", priority: 0.6 },
  { url: "/acerca", changeFrequency: "weekly", priority: 0.3 },
  { url: "/privacidad", changeFrequency: "weekly", priority: 0.2 },
  { url: "/aviso-legal", changeFrequency: "weekly", priority: 0.2 },
];

/** Sitemap completo: páginas fijas, equipos, jugadores y partidos de la temporada (URLs absolutas). */
export function buildSitemap(
  teamIds: readonly number[],
  playerIds: readonly number[],
  games: readonly { id: string }[]
): { url: string; changeFrequency: SitemapEntry["changeFrequency"]; priority: number }[] {
  const abs = (path: string) => `${SITE_URL}${path === "/" ? "" : path}`;
  return [
    ...STATIC_PAGES.map((p) => ({ ...p, url: abs(p.url) })),
    ...teamIds.map((id) => ({ url: abs(`/teams/${id}`), changeFrequency: "daily" as const, priority: 0.6 })),
    ...playerIds.map((id) => ({ url: abs(`/players/${id}`), changeFrequency: "weekly" as const, priority: 0.5 })),
    ...games.map((g) => ({ url: abs(`/games/${g.id}`), changeFrequency: "weekly" as const, priority: 0.4 })),
  ];
}
