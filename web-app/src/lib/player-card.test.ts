import assert from "node:assert/strict";
import { test } from "node:test";
import { backHonours, backRows, cardSeals, cardTier, legendLine, legendWeight, MAX_SEALS, rookieYear, splitName, surnameSize, tiltAt } from "./player-card.ts";
import { cardVideoPose, CARD_VIDEO_DURATION, faceAt, REST_ANGLE } from "./card-video.ts";

const award = (award_name: string, season: string) => ({ award_name, season });
const MVP = "NBA Most Valuable Player";

test("sellos: rookie con su año, Los Nuestros y solo los premios que tiene (Tarea 7.11)", () => {
  assert.deepEqual(cardSeals({ active: true, rookieYear: 2026, spanish: true, awards: [], latestMvpSeason: "2025-26" }), [
    { kind: "rookie", year: 2026 },
    { kind: "spain" },
  ]);
  assert.deepEqual(cardSeals({ active: true, rookieYear: null, spanish: false, awards: [], latestMvpSeason: "2025-26" }), []);
  const doncic = Array.from({ length: 6 }, (_, i) => award("NBA All-Star", `20${19 + i}-${20 + i}`));
  assert.deepEqual(cardSeals({ active: true, rookieYear: null, spanish: false, awards: doncic, latestMvpSeason: "2025-26" }), [{ kind: "star", count: 6 }]);
});

test("en activo, el sello de MVP solo lo lleva el vigente; en las leyendas, cualquiera que lo ganara", () => {
  const jokic = [award(MVP, "2020-21"), award(MVP, "2021-22"), award(MVP, "2023-24"), award("NBA Champion", "2022-23")];
  assert.deepEqual(cardSeals({ active: true, rookieYear: null, spanish: false, awards: jokic, latestMvpSeason: "2024-25" }), [{ kind: "ring", count: 1 }]);
  assert.deepEqual(cardSeals({ active: true, rookieYear: null, spanish: false, awards: jokic, latestMvpSeason: "2023-24" }), [
    { kind: "mvp", count: 3 },
    { kind: "ring", count: 1 },
  ]);
  const jordan = [
    ...Array.from({ length: 5 }, (_, i) => award(MVP, `${1987 + i}`)),
    ...Array.from({ length: 6 }, (_, i) => award("NBA Champion", `${1990 + i}`)),
    ...Array.from({ length: 14 }, (_, i) => award("NBA All-Star", `${1984 + i}`)),
  ];
  const seals = cardSeals({ active: false, rookieYear: null, spanish: false, awards: jordan, latestMvpSeason: "2025-26" });
  assert.deepEqual(seals, [
    { kind: "mvp", count: 5 },
    { kind: "ring", count: 6 },
    { kind: "star", count: 14 },
  ]);
  // Nunca más de los que caben, y el rookie solo en activo
  const all = cardSeals({ active: true, rookieYear: 2026, spanish: true, awards: jordan.concat(award(MVP, "2025-26")), latestMvpSeason: "2025-26" });
  assert.equal(all.length, MAX_SEALS);
  assert.deepEqual(all.map((s) => s.kind), ["rookie", "spain", "mvp"]);
  assert.equal(cardSeals({ active: false, rookieYear: 2026, spanish: false, awards: [], latestMvpSeason: null }).length, 0);
});

test("rookie: del draft de este verano, o sin partidos antes de esta temporada", () => {
  const row = (season_id: string, games_played: number) => ({ season_id, season_type: "Regular Season", games_played });
  assert.equal(rookieYear({ is_active: true, draft_year: 2026 }, [], "2026-27"), 2026);
  assert.equal(rookieYear({ is_active: false, draft_year: 2026 }, [], "2026-27"), null);
  // No elegido: su carrera son sus partidos de esta temporada
  assert.equal(rookieYear({ is_active: true, draft_year: null }, [row("2026-27", 12), row("Career", 12)], "2026-27"), 2026);
  // Veterano: partidos antes, o carrera aún sin historial (no se escribe hasta tenerlo)
  assert.equal(rookieYear({ is_active: true, draft_year: 2018 }, [row("2025-26", 70), row("2026-27", 16), row("Career", 600)], "2026-27"), null);
  assert.equal(rookieYear({ is_active: true, draft_year: 2019 }, [row("2026-27", 16)], "2026-27"), null);
});

test("reverso: las cuatro últimas temporadas en activo; en las leyendas, sus tres mejores y la carrera", () => {
  const season = (season_id: string, pts: number) => ({ season_id, season_type: "Regular Season", games_played: 80, team_id: 1, pts, reb: 5, ast: 4 });
  const career = [season("2019-20", 10), season("2020-21", 30), season("2021-22", 20), season("2022-23", 25), season("2023-24", 12), season("Career", 19)];
  const abbr = () => "CHI";
  assert.deepEqual(
    backRows(career, true, abbr).map((r) => r[0]),
    ["2020-21", "2021-22", "2022-23", "2023-24"]
  );
  assert.deepEqual(
    backRows(career, false, abbr).map((r) => [r[0], r[1]]),
    [
      ["2020-21", "CHI"],
      ["2021-22", "CHI"],
      ["2022-23", "CHI"],
      ["Carrera", ""],
    ]
  );
  assert.deepEqual(backRows([{ ...season("2026-27", 0), games_played: 0 }], true, abbr), []);
  assert.deepEqual(backHonours([{ label: "Campeón de la NBA", count: 6 }, { label: "MVP", count: 5 }, { label: "Rookie del Año", count: 1 }, { label: "All-Star", count: 14 }]), [
    "6 × Campeón de la NBA",
    "5 × MVP",
    "Rookie del Año",
  ]);
});

test("vídeo de la carta: se enciende, da una vuelta entera con el reverso a mitad y acaba de frente", () => {
  const start = cardVideoPose(0);
  const end = cardVideoPose(CARD_VIDEO_DURATION);
  assert.equal(start.light, 0);
  assert.equal(start.caption, 0);
  assert.equal(end.light, 1);
  assert.equal(end.rise, 1);
  assert.ok(end.caption > 0.99);
  assert.equal(faceAt(end.ry), "front");
  assert.ok(Math.abs(end.ry - (REST_ANGLE + Math.PI * 2)) < 0.15);
  // A mitad de vídeo se para en el reverso al menos un segundo, para que se lea
  for (let t = 3.2; t <= 4.3; t += 0.1) assert.equal(faceAt(cardVideoPose(t).ry), "back", `${t}`);
  // El giro nunca da marcha atrás durante la vuelta
  for (let t = 1.5; t < 6; t += 0.1) assert.ok(cardVideoPose(t + 0.1).ry >= cardVideoPose(t).ry - 1e-9);
});

test("el material sale de la media, con los mismos cortes que las barras (Tarea 7.10)", () => {
  assert.equal(cardTier(true, 99), "elite");
  assert.equal(cardTier(true, 84), "elite");
  assert.equal(cardTier(true, 83), "great");
  assert.equal(cardTier(true, 70), "great");
  assert.equal(cardTier(true, 69), "good");
  assert.equal(cardTier(true, 55), "good");
  assert.equal(cardTier(true, 54), "base");
  assert.equal(cardTier(true, 40), "base");
  // Sin partidos esta temporada: cartón, nunca la del año pasado
  assert.equal(cardTier(true, null), "base");
  assert.equal(cardTier(false, null), "legend");
});

test("la leyenda lleva sus dos mayores logros, en singular si toca", () => {
  assert.equal(legendLine({ champion: 6, mvp: 5, fmvp: 6, allstar: 14 }), "6 anillos · 5 MVP");
  assert.equal(legendLine({ champion: 1, allstar: 1 }), "1 anillo · 1 All-Star");
  assert.equal(legendLine({ mvp: 2, allstar: 11 }), "2 MVP · 11 All-Star");
  assert.equal(legendLine({ allstar: 8 }), "8 All-Star");
  assert.equal(legendLine({ champion: 0 }), "");
  assert.equal(legendLine({}), "");
});

test("la tira empieza por los más laureados", () => {
  assert.ok(legendWeight({ champion: 6, mvp: 5, fmvp: 6, allstar: 14 }) > legendWeight({ champion: 2, allstar: 6 }));
  assert.equal(legendWeight({}), 0);
});

test("nombre y apellidos, también con uno solo", () => {
  assert.deepEqual(splitName("Nikola Jokić"), { first: "Nikola", last: "Jokić" });
  assert.deepEqual(splitName("Michael Porter Jr."), { first: "Michael", last: "Porter Jr." });
  assert.deepEqual(splitName("Nenê"), { first: "", last: "Nenê" });
});

test("los apellidos largos encogen hasta caber", () => {
  for (const tier of ["legend", "elite", "great", "good", "base"] as const) {
    const width = tier === "legend" ? 78 : tier === "base" ? 82 : 65;
    for (const surname of ["Ball", "Antetokounmpo", "Gilgeous-Alexander", "Alexander-Walker"]) {
      assert.ok(surnameSize(surname, tier) * surname.length * 0.49 <= width + 1, `${surname} en ${tier}`);
    }
  }
  assert.equal(surnameSize("Ball", "elite"), 14.6);
});

test("la inclinación nunca pasa del tope aunque el dedo se salga", () => {
  assert.deepEqual(tiltAt(0.5, 0.5), { rx: 0, ry: 0, mx: 50, my: 50, on: 1 });
  assert.deepEqual(tiltAt(-3, 9), tiltAt(0, 1));
  assert.equal(tiltAt(5, 0).ry, 13);
  assert.equal(tiltAt(0, -2).rx, 11);
});
