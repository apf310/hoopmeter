// Tests de los metadatos y enlaces compartidos (Tarea 6.25). Se lanzan con `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSitemap, compareMeta, gameDateLine, gameMeta, pageMetadata, playerIdParam, playerMeta, SITE_URL, teamMeta } from "./seo.ts";

const LAL = { name: "Los Angeles Lakers", abbreviation: "LAL" };
const BOS = { name: "Boston Celtics", abbreviation: "BOS" };
// 21-nov-2026 a las 19:30 de Nueva York = 01:30 del domingo 22 en España
const MATCHUP = { id: "0022600250", game_datetime_utc: "2026-11-22T00:30:00Z", home_team_id: 1, away_team_id: 2 };

describe("seo · partido", () => {
  it("solo emparejamiento, jornada y hora de España", () => {
    assert.equal(gameDateLine(MATCHUP), "Jornada del sábado 21 de noviembre · 01:30 en España (dom 22)");
    const meta = gameMeta(MATCHUP, LAL, BOS);
    assert.equal(meta.title, "LAL @ BOS");
    assert.match(meta.description, /^Los Angeles Lakers en casa de Boston Celtics\. Jornada del sábado/);
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
    assert.equal(meta.title, "LeBron James");
    assert.equal(
      meta.description,
      "LeBron James: Alero de Los Angeles Lakers. Temporada 2026-27: 25.0 PTS · 7.3 REB · 8.2 AST. Radar, trayectoria y palmarés en Hoopmeter."
    );
  });

  it("leyenda o jugador sin estadísticas", () => {
    assert.match(playerMeta({ full_name: "Bill Russell", is_active: false }, "Pívot", null, null).description, /^Bill Russell: Leyenda de la NBA\. Radar/);
    assert.match(playerMeta({ full_name: "Nadie", is_active: true }, null, null, null).description, /^Nadie: sin equipo\./);
  });

  it("equipo sin balance ni puesto", () => {
    const meta = teamMeta(BOS, "Este", "Atlántico");
    assert.equal(meta.description, "Boston Celtics (Conferencia Este · División Atlántico): plantilla, próximos partidos y situación salarial, sin spoilers.");
    assert.ok(!/\d/.test(meta.description));
  });

  it("comparador con y sin los dos jugadores", () => {
    assert.equal(compareMeta({ full_name: "A" }, { full_name: "B" }).title, "A vs. B");
    assert.equal(compareMeta({ full_name: "A" }, null).title, "Comparador");
    assert.equal(playerIdParam("2544"), 2544);
    assert.equal(playerIdParam(["2544", "1"]), 2544);
    assert.equal(playerIdParam("-3"), null);
    assert.equal(playerIdParam("abc"), null);
    assert.equal(playerIdParam(undefined), null);
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
    const withImage = pageMetadata({ path: "/compare", image: "/og/compare?a=1&b=2" });
    assert.equal(withImage.title, "Hoopmeter · Qué partido ver, sin spoilers");
    assert.deepEqual(withImage.openGraph?.images, [{ url: "/og/compare?a=1&b=2", width: 1200, height: 630, alt: withImage.title }]);
  });

  it("sitemap con URLs absolutas y sin duplicados", () => {
    const entries = buildSitemap([1, 2], [2544], [{ id: "0022600250" }]);
    const urls = entries.map((e) => e.url);
    assert.equal(urls[0], SITE_URL);
    assert.ok(urls.includes(`${SITE_URL}/teams/2`));
    assert.ok(urls.includes(`${SITE_URL}/players/2544`));
    assert.ok(urls.includes(`${SITE_URL}/games/0022600250`));
    assert.ok(!urls.some((u) => u.includes("/avisos") || u.includes("/api/")));
    assert.equal(new Set(urls).size, urls.length);
  });
});
