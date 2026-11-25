// Tests de los datos estructurados (Tarea 7.8). Se lanzan con `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ARENAS, ARENAS_SEASON, OTHER_VENUES } from "./arenas.ts";
import { gameJsonLd, gameVenue, jsonLdText, playerJsonLd, siteJsonLd, teamJsonLd } from "./structured-data.ts";
import { SEASON } from "./trade-rules.ts";

const LAL = { id: 1610612747, name: "Los Angeles Lakers", abbreviation: "LAL" };
const BOS = { id: 1610612738, name: "Boston Celtics", abbreviation: "BOS" };
const GAME = { id: "0022600250", game_datetime_utc: "2026-11-22T00:30:00+00:00" };

const JOKIC = {
  id: 203999,
  full_name: "Nikola Jokić",
  is_active: true,
  height: "2.11 m",
  weight: "129 kg",
  country: "Serbia",
  birth_date: "1995-02-19",
};

describe("datos estructurados · partido", () => {
  it("emparejamiento, hora y sitio", () => {
    const data = gameJsonLd(GAME, LAL, BOS)!;
    assert.equal(data["@type"], "SportsEvent");
    assert.equal(data.name, "Los Angeles Lakers - Boston Celtics");
    assert.equal(data.startDate, "2026-11-22T00:30:00.000Z");
    assert.equal(data.url, "https://hoopmeter.com/games/0022600250");
    assert.deepEqual(data.location, {
      "@type": "Place",
      name: "TD Garden",
      address: { "@type": "PostalAddress", addressLocality: "Boston", addressRegion: "MA", addressCountry: "US" },
    });
    assert.equal((data.homeTeam as { url: string }).url, "https://hoopmeter.com/teams/1610612738-boston-celtics");
    assert.equal((data.awayTeam as { name: string }).name, "Los Angeles Lakers");
  });

  it("un partido terminado da exactamente lo mismo que uno sin empezar", () => {
    const played = {
      ...GAME,
      status: "Final",
      home_score: 131,
      away_score: 128,
      excitement_score: 9.6,
      live_period_text: "Final/OT",
      quarters_score: { home: [30, 30, 30, 28, 13], away: [28, 30, 30, 30, 10] },
    };
    const teams = [
      { ...LAL, wins: 12, losses: 4, conf_rank: 1, standings_extra: { streak: "W3" } },
      { ...BOS, wins: 10, losses: 6, conf_rank: 3, standings_extra: { streak: "L1" } },
    ] as const;
    const data = gameJsonLd(played, teams[0], teams[1])!;
    assert.deepEqual(data, gameJsonLd(GAME, LAL, BOS));
    for (const key of ["eventStatus", "endDate", "duration", "subEvent", "result", "winner", "aggregateRating", "review"]) {
      assert.ok(!(key in data), key);
    }
    const text = JSON.stringify(data);
    for (const leak of ["131", "128", "9.6", "Final", "OT", "W3"]) assert.ok(!text.includes(leak), leak);
  });

  it("nunca un pabellón que no es", () => {
    // París: no se juega en San Antonio
    assert.equal(gameVenue("0022600075", 1610612759, "2026-27")!.city, "Paris");
    // Eliminatoria de la Copa sin anunciar y final de la Copa: no se sabe
    assert.equal(gameVenue("0022601230", BOS.id, "2026-27"), null);
    assert.equal(gameVenue("0062700001", BOS.id, "2026-27"), null);
    // Otra temporada: la tabla no vale
    assert.equal(gameVenue("0022500250", BOS.id, "2025-26"), null);
    assert.equal(gameJsonLd({ id: "0022500250", game_datetime_utc: "2025-11-22T00:30:00Z" }, LAL, BOS), null);
    assert.equal(gameVenue("0022600999", 1, "2026-27"), null);
  });

  it("pabellones de la temporada en curso (npm run arenas con el calendario nuevo)", () => {
    // SEASON cambia en julio y la NBA publica el calendario en agosto: hasta septiembre puede faltar
    if (Date.now() >= Date.parse(`${SEASON.slice(0, 4)}-09-01T00:00:00Z`)) assert.equal(ARENAS_SEASON, SEASON);
    assert.equal(Object.keys(ARENAS).length, 30);
    for (const venue of [...Object.values(ARENAS), ...Object.values(OTHER_VENUES)]) {
      if (venue) assert.ok(venue.name && venue.city);
    }
  });
});

describe("datos estructurados · jugador, equipo y sitio", () => {
  it("jugador: solo datos fijos", () => {
    const data = playerJsonLd(JOKIC, { id: 1610612743, name: "Denver Nuggets" });
    assert.deepEqual(data, {
      "@context": "https://schema.org",
      "@type": "Person",
      name: "Nikola Jokić",
      url: "https://hoopmeter.com/players/203999-nikola-jokic",
      image: "https://cdn.nba.com/headshots/nba/latest/1040x760/203999.png",
      jobTitle: "Jugador de baloncesto",
      birthDate: "1995-02-19",
      nationality: { "@type": "Country", name: "Serbia" },
      height: { "@type": "QuantitativeValue", value: 2.11, unitCode: "MTR" },
      weight: { "@type": "QuantitativeValue", value: 129, unitCode: "KGM" },
      memberOf: { "@type": "SportsTeam", name: "Denver Nuggets", sport: "Baloncesto", url: "https://hoopmeter.com/teams/1610612743-denver-nuggets" },
    });
    const full = { ...JOKIC, radar_attributes: { overall: 95 }, team_id: 1610612743 };
    assert.deepEqual(playerJsonLd(full, { id: 1610612743, name: "Denver Nuggets" }), data);
  });

  it("sin equipo o sin datos, no se inventa nada", () => {
    const legend = playerJsonLd({ ...JOKIC, is_active: false, height: null, weight: "", country: null, birth_date: null }, null);
    assert.equal(legend.jobTitle, "Exjugador de baloncesto");
    for (const key of ["memberOf", "height", "weight", "nationality", "birthDate"]) assert.ok(!(key in legend), key);
  });

  it("equipo: ni balance ni puesto", () => {
    const full = { ...BOS, wins: 10, losses: 6, conf_rank: 3, standings_extra: { streak: "W3" } };
    assert.deepEqual(teamJsonLd(full), {
      "@context": "https://schema.org",
      "@type": "SportsTeam",
      name: "Boston Celtics",
      alternateName: "BOS",
      sport: "Baloncesto",
      url: "https://hoopmeter.com/teams/1610612738-boston-celtics",
      logo: "https://hoopmeter.com/logos/1610612738.svg",
      memberOf: { "@type": "SportsOrganization", name: "NBA", url: "https://www.nba.com/" },
    });
  });

  it("sitio y texto que no puede cerrar el script", () => {
    assert.equal(siteJsonLd().name, "Hoopmeter");
    const text = jsonLdText({ "@context": "https://schema.org", "@type": "Person", name: "</script><b>" });
    assert.ok(!text.includes("<"));
    assert.equal(JSON.parse(text).name, "</script><b>");
  });
});
