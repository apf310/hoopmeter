// Datos estructurados de schema.org para buscadores (Tarea 7.8). Puro, con tests. Como todo lo que ve quien no ha elegido
// nivel, solo Nivel 1: los de un partido son los mismos antes, durante y después (sin marcador, estado, nota, duración ni
// hora de final), y los de un jugador o un equipo solo llevan datos fijos (sin promedios, balance ni puesto).
import { ARENAS, ARENAS_SEASON, OTHER_VENUES, type Venue } from "./arenas.ts";
import { seasonOf } from "./game-day.ts";
import { playerHeadshotUrl, teamLogoUrl } from "./nba-cdn.ts";
import { countryLabel } from "./places.ts";
import { playerPath, teamPath } from "./routes.ts";
import { gameMeta, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "./seo.ts";

export type JsonLd = { "@context": "https://schema.org"; "@type": string } & Record<string, unknown>;

const CONTEXT = "https://schema.org";
const SPORT = "Baloncesto";
const NBA = { "@type": "SportsOrganization", name: "NBA", url: "https://www.nba.com/" };
const abs = (path: string) => `${SITE_URL}${path}`;

/** Sin las claves vacías: un dato que no se sabe no se pone. */
function compact(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value != null));
}

type TeamRef = { id: number; name: string };
const teamRef = (team: TeamRef) => ({ "@type": "SportsTeam", name: team.name, sport: SPORT, url: abs(teamPath(team.id, team.name)) });

/** Portada: el nombre del sitio en los resultados de Google. */
export function siteJsonLd(): JsonLd {
  return {
    "@context": CONTEXT,
    "@type": "WebSite",
    name: SITE_NAME,
    alternateName: "hoopmeter.com",
    url: `${SITE_URL}/`,
    description: SITE_DESCRIPTION,
    inLanguage: "es",
    publisher: { "@type": "Organization", name: SITE_NAME, url: `${SITE_URL}/`, logo: abs("/icons/icon-512.png") },
  };
}

/** Pabellón de un partido, o null si no se sabe seguro (otra temporada, final de la Copa sin anunciar). */
export function gameVenue(gameId: string, homeTeamId: number, season: string): Venue | null {
  if (season !== ARENAS_SEASON) return null;
  if (gameId in OTHER_VENUES) return OTHER_VENUES[gameId];
  // La final de la Copa siempre es en campo neutral
  return gameId.startsWith("006") ? null : (ARENAS[homeTeamId] ?? null);
}

/** Lo único de un partido que entra: ni marcador, ni nota, ni estado. */
type GameFacts = { id: string; game_datetime_utc: string };
type GameTeam = TeamRef & { abbreviation: string };

/**
 * Partido. Google exige el sitio donde se juega: sin él no se ponen datos. Sin `eventStatus` (Google entiende
 * "programado"), `endDate` ni nada que dependa de cómo fue.
 */
export function gameJsonLd(game: GameFacts, away: GameTeam, home: GameTeam): JsonLd | null {
  const venue = gameVenue(game.id, home.id, seasonOf(game.game_datetime_utc));
  if (!venue) return null;
  const url = abs(`/games/${game.id}`);
  return {
    "@context": CONTEXT,
    "@type": "SportsEvent",
    name: `${away.name} - ${home.name}`,
    description: gameMeta(game, away, home).description,
    sport: SPORT,
    url,
    image: `${url}/opengraph-image`,
    startDate: new Date(game.game_datetime_utc).toISOString(),
    location: {
      "@type": "Place",
      name: venue.name,
      address: compact({
        "@type": "PostalAddress",
        addressLocality: venue.city,
        addressRegion: venue.region,
        addressCountry: venue.country,
      }),
    },
    homeTeam: teamRef(home),
    awayTeam: teamRef(away),
    organizer: NBA,
  };
}

export function teamJsonLd(team: TeamRef & { abbreviation: string }): JsonLd {
  return {
    "@context": CONTEXT,
    "@type": "SportsTeam",
    name: team.name,
    alternateName: team.abbreviation,
    sport: SPORT,
    url: abs(teamPath(team.id, team.name)),
    logo: abs(teamLogoUrl(team.id)),
    memberOf: NBA,
  };
}

/** "2.11 m" → 2.11; "129 kg" → 129. */
function measure(text: string | null, unitCode: "MTR" | "KGM"): Record<string, unknown> | null {
  const value = Number.parseFloat(text ?? "");
  return Number.isFinite(value) && value > 0 ? { "@type": "QuantitativeValue", value, unitCode } : null;
}

type PlayerFacts = {
  id: number;
  full_name: string;
  is_active: boolean;
  height: string | null;
  weight: string | null;
  country: string | null;
  birth_date: string | null;
};

export function playerJsonLd(player: PlayerFacts, team: TeamRef | null): JsonLd {
  const country = countryLabel(player.country);
  return {
    "@context": CONTEXT,
    "@type": "Person",
    ...compact({
      name: player.full_name,
      url: abs(playerPath(player.id, player.full_name)),
      image: playerHeadshotUrl(player.id),
      jobTitle: player.is_active ? "Jugador de baloncesto" : "Exjugador de baloncesto",
      birthDate: player.birth_date?.slice(0, 10),
      nationality: country && { "@type": "Country", name: country },
      height: measure(player.height, "MTR"),
      weight: measure(player.weight, "KGM"),
      memberOf: team && teamRef(team),
    }),
  };
}

/** Texto para el `<script>`: sin `<`, que podría cerrarlo antes de tiempo. */
export function jsonLdText(data: JsonLd): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
