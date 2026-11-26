// SEO y enlaces compartidos (Tarea 6.25). Puro: textos de los metadatos y de las imágenes de previsualización.
// Quien recibe un enlace no ha elegido nivel de spoilers, así que todo lo de aquí es Nivel 1: emparejamiento,
// fecha y hora. Nunca nota, marcador, estado ("Final", "En directo"), duración ni prórroga: las funciones solo
// reciben esos campos, y un test comprueba que un partido con resultado da exactamente el mismo texto.
import type { Metadata } from "next";
import { BRAND } from "./brand.ts";
import { formatDayMonth, formatGameTime, formatWeekday, gameDayOf, madridDayIfDifferent } from "./game-day.ts";
import { playerPath, teamPath } from "./routes.ts";

export const SITE_URL = "https://hoopmeter.com";
export const SITE_NAME = "Hoopmeter";
export const SITE_DESCRIPTION =
  "Los partidos de la NBA en hora de España y sin spoilers: cuál ver por su nota del 1 al 10, resultados solo si los pides, jugadores, clasificación y GM Virtual.";

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
  /** Dirección de lo que se comparte, si no es la canónica (un traspaso del GM): la usan las previsualizaciones. */
  url?: string;
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
export function pageMetadata({ title, description = SITE_DESCRIPTION, path, url = path, image = BRAND_IMAGE }: PageMeta): Metadata {
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
      url,
      title: fullTitle,
      description,
      ...(images && { images }),
    },
    twitter: { card: "summary_large_image", title: fullTitle, description, ...(images && { images }) },
  };
}

type TeamName = { name: string };

/** "Los Angeles Lakers" → ciudad y apodo, que es como la gente llama a los equipos. Solo los Trail Blazers son dos palabras. */
export function splitTeamName(name: string): { city: string; nickname: string } {
  const words = name.split(" ");
  const size = name.endsWith("Trail Blazers") ? 2 : 1;
  return { city: words.slice(0, -size).join(" "), nickname: words.slice(-size).join(" ") };
}

/** Lo único de un partido que puede ir en un enlace: ni marcador, ni nota, ni estado. */
type MatchupDate = { game_datetime_utc: string };

/** "Jornada del sábado 21 de noviembre · 01:30 en España (dom 22)": la de la ficha del partido. */
export function gameDateLine(game: MatchupDate): string {
  const day = gameDayOf(game.game_datetime_utc);
  const madrugada = madridDayIfDifferent(game.game_datetime_utc, day);
  const time = `${formatGameTime(game.game_datetime_utc)} en España${madrugada ? ` (${madrugada})` : ""}`;
  return `Jornada del ${formatWeekday(day, "long")} ${formatDayMonth(day)} · ${time}`;
}

/** Con la fecha en el título: dos equipos se cruzan hasta cuatro veces por temporada. */
export function gameMeta(game: MatchupDate, away: TeamName, home: TeamName): { title: string; description: string } {
  const day = gameDayOf(game.game_datetime_utc);
  const date = `${formatDayMonth(day, "short")} ${day.slice(0, 4)}`;
  return {
    title: `${splitTeamName(away.name).nickname} - ${splitTeamName(home.name).nickname}, ${date}: hora y nota sin spoilers`,
    description: `${away.name} en casa de ${home.name} (NBA). ${gameDateLine(game)}. Mira su nota sin spoilers.`,
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
  const what = player.is_active ? "Contrato, trayectoria y palmarés" : "Trayectoria y palmarés";
  return {
    title: player.is_active ? `${player.full_name}: estadísticas, contrato y palmarés` : `${player.full_name}: estadísticas y palmarés`,
    description: `${player.full_name}: ${who}.${stats ? ` ${stats}.` : ""} ${what} en ${SITE_NAME}.`,
  };
}

/** Sin balance ni puesto: dependen de los resultados (la cabecera del equipo sigue el nivel, Tarea 6.6). */
export function teamMeta(team: { name: string }, conference: string | null, division: string | null): { title: string; description: string } {
  const where = [conference && `Conferencia ${conference}`, division && `División ${division}`].filter(Boolean).join(" · ");
  return {
    title: `${team.name}: plantilla, salarios y calendario`,
    description: `${team.name}${where ? ` (${where})` : ""}: plantilla, estadísticas, salarios y próximos partidos en hora de España, sin spoilers.`,
  };
}

export function compareMeta(a: { full_name: string } | null, b: { full_name: string } | null): { title: string; description: string } {
  if (a && b) {
    return {
      title: `${a.full_name} vs. ${b.full_name}: estadísticas cara a cara`,
      description: `${a.full_name} contra ${b.full_name}: radares superpuestos, estadísticas y palmarés cara a cara.`,
    };
  }
  return {
    title: "Comparador de jugadores NBA de cualquier época",
    description: "Enfrenta a dos jugadores de la NBA de cualquier época: radares superpuestos, estadísticas y palmarés.",
  };
}

type TradeMove = { name: string; to: string };

/**
 * Enlace de un traspaso del GM (Tarea 7.9): equipos y quién va a cada uno. Nada de spoilers (el GM se ve en todos los
 * niveles) y nada de la IA: su nota no se guarda con el enlace.
 */
export function tradeMeta(teams: string[], players: TradeMove[], picks: number): { title: string; description: string } {
  const nicknames = teams.map((name) => splitTeamName(name).nickname);
  const shown = players.slice(0, 4).map(({ name, to }) => `${name} a los ${splitTeamName(to).nickname}`);
  const rest = players.length - shown.length;
  const extras = [rest > 0 && `${rest} ${rest === 1 ? "jugador más" : "jugadores más"}`, picks > 0 && `${picks} ${picks === 1 ? "ronda" : "rondas"} del draft`].filter(Boolean);
  const parts = [...shown, ...extras] as string[];
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} y ${parts.at(-1)}` : (parts[0] ?? "");
  return {
    title: `Traspaso ${nicknames.join(" - ")}: ¿lo aprobaría la NBA?`,
    description: `${list ? `${list[0].toUpperCase()}${list.slice(1)}. ` : ""}Compruébalo con los contratos reales en el GM Virtual de ${SITE_NAME}.`,
  };
}

/** Ids del comparador tal como llegan en la URL (`?a=2544&b=201939`). */
export function playerIdParam(value: string | string[] | undefined): number | null {
  const id = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

type SitemapEntry = { url: string; lastModified?: string; changeFrequency: "hourly" | "daily" | "weekly"; priority: number };

/** Páginas fijas del sitemap (sin `/avisos`: no tiene nada que buscar). `updates`: cuándo cambia lo que se ve en Nivel 1. */
export const STATIC_PAGES: readonly (Omit<SitemapEntry, "lastModified"> & { updates?: "daily" | "legal" })[] = [
  { url: "/", changeFrequency: "hourly", priority: 1, updates: "daily" },
  { url: "/que-ver", changeFrequency: "daily", priority: 0.9 },
  { url: "/standings", changeFrequency: "daily", priority: 0.8, updates: "daily" },
  { url: "/teams", changeFrequency: "weekly", priority: 0.7 },
  { url: "/players", changeFrequency: "daily", priority: 0.7, updates: "daily" },
  { url: "/gm-simulator", changeFrequency: "daily", priority: 0.7, updates: "daily" },
  { url: "/compare", changeFrequency: "weekly", priority: 0.6 },
  { url: "/acerca", changeFrequency: "weekly", priority: 0.3 },
  { url: "/privacidad", changeFrequency: "weekly", priority: 0.2, updates: "legal" },
  { url: "/aviso-legal", changeFrequency: "weekly", priority: 0.2, updates: "legal" },
];

type SitemapData = {
  teams: readonly { id: number; name: string }[];
  players: readonly { id: number; full_name: string; is_active: boolean }[];
  games: readonly { id: string; game_datetime_utc: string }[];
};

type SitemapDates = {
  now: number;
  /** Día del último job diario ("2026-11-25"), o null si no se sabe. */
  daily: string | null;
  /** Última versión de los textos legales. */
  legal: string;
};

/**
 * Sitemap completo: páginas fijas, equipos, jugadores y partidos de la temporada (URLs absolutas).
 *
 * `lastmod` (Tarea 7.8) no delata nada: todos los jugadores en activo y todos los equipos llevan el mismo día, el del job
 * diario (nunca cuándo jugó cada uno), y un partido, la hora a la que estaba previsto que empezara, solo cuando ya ha
 * pasado (la ficha deja de ser la previa). Nunca cuándo acabó ni cuándo se le puso la nota.
 */
export function buildSitemap({ teams, players, games }: SitemapData, { now, daily, legal }: SitemapDates): SitemapEntry[] {
  const abs = (path: string) => `${SITE_URL}${path === "/" ? "" : path}`;
  const lastModified = (date: string | null) => (date ? { lastModified: date } : {});
  return [
    ...STATIC_PAGES.map(({ updates, ...page }) => ({
      ...page,
      url: abs(page.url),
      ...lastModified(updates === "daily" ? daily : updates === "legal" ? legal : null),
    })),
    ...teams.map((t) => ({ url: abs(teamPath(t.id, t.name)), ...lastModified(daily), changeFrequency: "daily" as const, priority: 0.6 })),
    ...players.map((p) => ({
      url: abs(playerPath(p.id, p.full_name)),
      ...lastModified(p.is_active ? daily : null),
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
    ...games.map((g) => {
      const tipoff = Date.parse(g.game_datetime_utc);
      return {
        url: abs(`/games/${g.id}`),
        ...lastModified(tipoff <= now ? new Date(tipoff).toISOString() : null),
        changeFrequency: "weekly" as const,
        priority: 0.4,
      };
    }),
  ];
}
