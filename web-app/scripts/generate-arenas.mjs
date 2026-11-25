// Pabellones de la temporada para los datos estructurados de los partidos (Tarea 7.8): el de cada equipo y los partidos
// que se juegan en otro sitio (París, Ciudad de México, la Copa...). Sale del calendario oficial de la NBA.
// Uso: npm run arenas   (cada verano con el calendario nuevo, y si la NBA anuncia un partido en otro pabellón)
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "lib", "arenas.ts");
const SCHEDULE = "https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json";
// La CDN rechaza (403) clientes sin cabeceras de navegador
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
  Referer: "https://www.nba.com/",
  Origin: "https://www.nba.com",
};
const US_STATES = new Set(
  "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ")
);
const CANADA = new Set(["ON", "QC", "BC", "AB"]);

/** Fuera de EE. UU. y Canadá la NBA pone el país en el sitio del estado (o nada). Sin pabellón anunciado, null. */
function toVenue(game) {
  if (!game.arenaName) return null;
  const state = game.arenaState || "";
  const venue = { name: game.arenaName, city: game.arenaCity };
  if (US_STATES.has(state)) return { ...venue, region: state, country: "US" };
  if (CANADA.has(state)) return { ...venue, region: state, country: "CA" };
  return /^[A-Z]{2}$/.test(state) ? { ...venue, country: state } : venue;
}

const response = await fetch(SCHEDULE, { headers: HEADERS });
if (!response.ok) throw new Error(`El calendario de la NBA responde ${response.status}`);
const { seasonYear, gameDates } = (await response.json()).leagueSchedule;
// Temporada regular, playoffs, play-in y final de la Copa
const games = gameDates.flatMap((date) => date.games).filter((g) => /^00[2456]/.test(g.gameId));

const counts = new Map();
for (const game of games) {
  const home = game.homeTeam.teamId;
  if (!home || !game.arenaName || game.isNeutral) continue;
  const key = JSON.stringify(toVenue(game));
  const own = counts.get(home) ?? new Map();
  counts.set(home, own.set(key, (own.get(key) ?? 0) + 1));
}
const homes = new Map([...counts].map(([id, own]) => [id, [...own].sort((a, b) => b[1] - a[1])[0][0]]).sort((a, b) => a[0] - b[0]));
if (homes.size !== 30) throw new Error(`Salen ${homes.size} equipos con pabellón y tienen que ser 30`);
const others = games
  .filter((game) => JSON.stringify(toVenue(game)) !== homes.get(game.homeTeam.teamId))
  .sort((a, b) => a.gameId.localeCompare(b.gameId));

const literal = (venue) =>
  venue &&
  `{ ${Object.entries(venue)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join(", ")} }`;
const source = `// GENERADO con \`npm run arenas\` desde el calendario oficial de la NBA: no editar a mano.
// Pabellón de cada equipo y partidos de la temporada que se juegan en otro sitio (datos estructurados, Tarea 7.8).

export type Venue = { name: string; city: string; region?: string; country?: string };

export const ARENAS_SEASON = ${JSON.stringify(seasonYear)};

export const ARENAS: Record<number, Venue> = {
${[...homes].map(([id, key]) => `  ${id}: ${literal(JSON.parse(key))},`).join("\n")}
};

/** Null: la NBA aún no ha dicho dónde (eliminatorias de la Copa sin equipos). */
export const OTHER_VENUES: Record<string, Venue | null> = {
${others.map((game) => `  "${game.gameId}": ${literal(toVenue(game))},`).join("\n")}
};
`;
await writeFile(OUT, source);
console.log(`${seasonYear}: 30 pabellones y ${others.length} partidos en otro sitio o aún sin sitio en ${OUT}`);
