// Tests de los metadatos y enlaces compartidos (Tarea 6.25). Se lanzan con `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSitemap, compareMeta, gameDateLine, gameMeta, pageMetadata, playerIdParam, playerMeta, SITE_URL, splitTeamName, teamMeta, tradeMeta } from "./seo.ts";

const LAL = { name: "Los Angeles Lakers", abbreviation: "LAL" };
const BOS = { name: "Boston Celtics", abbreviation: "BOS" };
// 21-nov-2026 a las 19:30 de Nueva York = 01:30 del domingo 22 en España
const MATCHUP = { id: "0022600250", game_datetime_utc: "2026-11-22T00:30:00Z", home_team_id: 1, away_team_id: 2 };

describe("seo · partido", () => {
  it("solo emparejamiento, jornada y hora de España", () => {
    assert.equal(gameDateLine(MATCHUP), "Jornada del sábado 21 de noviembre · 01:30 en España (dom 22)");
    const meta = gameMeta(MATCHUP, LAL, BOS);
    assert.equal(meta.title, "Lakers - Celtics, 21 nov 2026: hora y nota sin spoilers");
    assert.match(meta.description, /^Los Angeles Lakers en casa de Boston Celtics \(NBA\)\. Jornada del sábado/);
  });

  it("los equipos, como los llama la gente", () => {
    assert.deepEqual(splitTeamName("Portland Trail Blazers"), { city: "Portland", nickname: "Trail Blazers" });
    assert.deepEqual(splitTeamName("Golden State Warriors"), { city: "Golden State", nickname: "Warriors" });
    assert.equal(splitTeamName("Philadelphia 76ers").nickname, "76ers");
  });

  it("sin madrugada no añade otro día", () => {
    assert.equal(gameDateLine({ game_datetime_utc: "2026-11-22T20:30:00Z" }), "Jornada del domingo 22 de noviembre · 21:30 en España");
  });

  it("un partido terminado da exactamente el mismo texto que uno sin empezar", () => {
    const played = {
      ...MATCHUP,
      status: "Final",
      home_score: 131,
      away_score: 128,
      excitement_score: 9.6,
      live_period_text: "Final/OT",
      quarters_score: { home: [30, 30, 30, 28, 13], away: [28, 30, 30, 30, 10] },
    };
    assert.deepEqual(gameMeta(played, LAL, BOS), gameMeta(MATCHUP, LAL, BOS));
    const text = JSON.stringify(gameMeta(played, LAL, BOS));
    for (const leak of ["131", "128", "9.6", "9,6", "Final", "OT", "prórroga", "directo", "ganó"]) {
      assert.ok(!text.includes(leak), `el enlace no puede decir ${leak}`);
    }
  });
});

describe("seo · fichas", () => {
  it("jugador en activo con sus promedios de temporada", () => {
    const meta = playerMeta({ full_name: "LeBron James", is_active: true }, "Alero", LAL, {
      label: "Temporada 2026-27",
      pts: 24.96,
      reb: 7.3,
      ast: 8.2,
    });
    assert.equal(meta.title, "LeBron James: estadísticas, contrato y palmarés");
    assert.equal(
      meta.description,
      "LeBron James: Alero de Los Angeles Lakers. Temporada 2026-27: 25.0 PTS · 7.3 REB · 8.2 AST. Contrato, trayectoria y palmarés en Hoopmeter."
    );
  });

  it("leyenda o jugador sin estadísticas", () => {
    const legend = playerMeta({ full_name: "Bill Russell", is_active: false }, "Pívot", null, null);
    assert.equal(legend.title, "Bill Russell: estadísticas y palmarés");
    assert.match(legend.description, /^Bill Russell: Leyenda de la NBA\. Trayectoria/);
    assert.match(playerMeta({ full_name: "Nadie", is_active: true }, null, null, null).description, /^Nadie: sin equipo\./);
  });

  it("equipo sin balance ni puesto", () => {
    const meta = teamMeta(BOS, "Este", "Atlántico");
    assert.equal(meta.title, "Boston Celtics: plantilla, salarios y calendario");
    assert.match(meta.description, /^Boston Celtics \(Conferencia Este · División Atlántico\): plantilla, estadísticas, salarios/);
    assert.ok(!/\d/.test(meta.title + meta.description));
  });

  it("comparador con y sin los dos jugadores", () => {
    assert.equal(compareMeta({ full_name: "A" }, { full_name: "B" }).title, "A vs. B: estadísticas cara a cara");
    assert.equal(compareMeta({ full_name: "A" }, null).title, "Comparador de jugadores NBA de cualquier época");
    assert.equal(playerIdParam("2544"), 2544);
    assert.equal(playerIdParam(["2544", "1"]), 2544);
    assert.equal(playerIdParam("-3"), null);
    assert.equal(playerIdParam("abc"), null);
    assert.equal(playerIdParam(undefined), null);
  });
});

describe("seo · traspaso del GM (Tarea 7.9)", () => {
  it("equipos y quién va a cada uno", () => {
    const meta = tradeMeta(["Los Angeles Lakers", "Boston Celtics"], [{ name: "LeBron James", to: "Boston Celtics" }, { name: "Jayson Tatum", to: "Los Angeles Lakers" }], 1);
    assert.equal(meta.title, "Traspaso Lakers - Celtics: ¿lo aprobaría la NBA?");
    assert.equal(meta.description, "LeBron James a los Celtics, Jayson Tatum a los Lakers y 1 ronda del draft. Compruébalo con los contratos reales en el GM Virtual de Hoopmeter.");
  });

  it("resume los traspasos grandes y los de solo rondas", () => {
    const players = ["A", "B", "C", "D", "E", "F"].map((name) => ({ name, to: "Portland Trail Blazers" }));
    const big = tradeMeta(["Portland Trail Blazers", "Miami Heat", "Utah Jazz"], players, 0);
    assert.equal(big.title, "Traspaso Trail Blazers - Heat - Jazz: ¿lo aprobaría la NBA?");
    assert.match(big.description, /^A a los Trail Blazers, B .*, D a los Trail Blazers y 2 jugadores más\. /);
    assert.match(tradeMeta(["Miami Heat", "Utah Jazz"], [], 2).description, /^2 rondas del draft\. Compruébalo/);
  });
});

describe("seo · metadatos y sitemap", () => {
  it("cada página lleva su Open Graph completo", () => {
    const meta = pageMetadata({ title: "Clasificación", description: "D", path: "/standings" });
    assert.equal(meta.title, "Clasificación · Hoopmeter");
    assert.deepEqual(meta.alternates, { canonical: "/standings" });
    assert.equal((meta.openGraph as { title: string }).title, "Clasificación · Hoopmeter");
    assert.equal((meta.twitter as { card: string }).card, "summary_large_image");
    assert.deepEqual(meta.openGraph?.images, [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Clasificación · Hoopmeter" }]);
    const segment = pageMetadata({ title: "LAL @ BOS", path: "/games/1", image: null });
    assert.equal(segment.openGraph?.images, undefined, "null deja la imagen del segmento");
    assert.equal(segment.twitter?.images, undefined);
    const shared = pageMetadata({ path: "/gm-simulator", url: "/gm-simulator?equipos=1,2", image: "/og/trade?equipos=1,2" });
    assert.deepEqual(shared.alternates, { canonical: "/gm-simulator" }, "un traspaso no es una página para buscadores");
    assert.equal((shared.openGraph as { url: string }).url, "/gm-simulator?equipos=1,2", "pero la previsualización es la del traspaso");
    const withImage = pageMetadata({ path: "/compare", image: "/og/compare?a=1&b=2" });
    assert.equal(withImage.title, "Hoopmeter · Qué partido ver, sin spoilers");
    assert.deepEqual(withImage.openGraph?.images, [{ url: "/og/compare?a=1&b=2", width: 1200, height: 630, alt: withImage.title }]);
  });

  it("sitemap con URLs absolutas, con nombre y sin duplicados", () => {
    const entries = buildSitemap(SITEMAP, DATES);
    const urls = entries.map((e) => e.url);
    assert.equal(urls[0], SITE_URL);
    assert.ok(urls.includes(`${SITE_URL}/teams/1610612743-denver-nuggets`));
    assert.ok(urls.includes(`${SITE_URL}/players/203999-nikola-jokic`));
    assert.ok(urls.includes(`${SITE_URL}/games/0022600250`));
    assert.ok(!urls.some((u) => u.includes("/avisos") || u.includes("/api/")));
    assert.equal(new Set(urls).size, urls.length);
  });

  it("lastmod: el mismo día para todos los jugadores en activo y equipos, y nada en las leyendas", () => {
    const at = (path: string) => buildSitemap(SITEMAP, DATES).find((e) => e.url === `${SITE_URL}${path}`)!.lastModified;
    assert.equal(at("/players/203999-nikola-jokic"), "2026-11-25");
    assert.equal(at("/players/2544-lebron-james"), "2026-11-25");
    assert.equal(at("/teams/1610612743-denver-nuggets"), "2026-11-25");
    assert.equal(at("/standings"), "2026-11-25");
    assert.equal(at("/players/893-michael-jordan"), undefined);
    assert.equal(at("/que-ver"), undefined);
    assert.equal(at("/privacidad"), "2026-11-22");
    assert.ok(!buildSitemap(SITEMAP, { ...DATES, daily: null }).some((e) => e.lastModified === null));
  });

  it("lastmod de un partido: la hora prevista del salto inicial, y solo si ya ha pasado", () => {
    const games = [
      { id: "0022600250", game_datetime_utc: "2026-11-22T00:30:00+00:00" },
      { id: "0022600300", game_datetime_utc: "2026-11-29T00:30:00+00:00" },
    ];
    const dates = buildSitemap({ ...SITEMAP, games }, DATES).filter((e) => e.url.includes("/games/")).map((e) => e.lastModified);
    assert.deepEqual(dates, ["2026-11-22T00:30:00.000Z", undefined]);
    // Uno terminado, con prórroga y con nota da lo mismo que uno que sigue en juego
    const played = games.map((g) => ({ ...g, status: "Final", home_score: 131, away_score: 128, excitement_score: 9.6, live_period_text: "Final/OT", is_processed: true }));
    assert.deepEqual(buildSitemap({ ...SITEMAP, games: played }, DATES), buildSitemap({ ...SITEMAP, games }, DATES));
  });
});

const SITEMAP = {
  teams: [{ id: 1610612743, name: "Denver Nuggets" }],
  players: [
    { id: 203999, full_name: "Nikola Jokić", is_active: true },
    { id: 2544, full_name: "LeBron James", is_active: true },
    { id: 893, full_name: "Michael Jordan", is_active: false },
  ],
  games: [{ id: "0022600250", game_datetime_utc: "2026-11-22T00:30:00+00:00" }],
};
const DATES = { now: Date.parse("2026-11-25T12:00:00Z"), daily: "2026-11-25", legal: "2026-11-22" };
