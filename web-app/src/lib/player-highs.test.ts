import assert from "node:assert/strict";
import { test } from "node:test";
import { highsBeforeDay, highsNow, pickHighs, withoutHighs, type CareerHigh, type StoredHighs } from "./player-highs.ts";

const high = (value: number, date: string | null, vs = "CHI"): CareerHigh => ({ value, date, vs, game_id: null });

/** Lo guardado tras una noche en la que hizo `pts` puntos: con 30 en la temporada y 40 de récord de carrera. */
function afterNight(pts: number): StoredHighs {
  const night = high(pts, "2026-11-24");
  const season = high(30, "2026-11-10");
  const career = high(40, "2024-01-01");
  const assists = high(9, "2026-11-10");
  return {
    career: { PTS: pts >= 40 ? night : career, AST: assists },
    careerBefore: pts >= 40 ? { PTS: career } : {},
    season: { id: "2026-27", highs: { PTS: pts >= 30 ? night : season, AST: assists }, before: pts >= 30 ? { PTS: season } : {} },
  };
}

test("la misma ficha en los Niveles 1 y 2 pase lo que pase en la última jornada", () => {
  const quiet = highsBeforeDay(afterNight(8), "2026-11-24");
  assert.deepEqual(highsBeforeDay(afterNight(30), "2026-11-24"), quiet); // igualó el de la temporada
  assert.deepEqual(highsBeforeDay(afterNight(61), "2026-11-24"), quiet); // récord de su carrera
  assert.equal(quiet.season?.highs.PTS.value, 30);
  assert.equal(quiet.career?.PTS.value, 40);
});

test("en cuanto empieza otra jornada, el récord ya se enseña", () => {
  assert.equal(highsBeforeDay(afterNight(61), "2026-11-25").season?.highs.PTS.value, 61);
  assert.equal(highsBeforeDay(afterNight(61), "2026-11-25").career?.PTS.value, 61);
});

test("el Nivel 3, siempre al día", () => {
  assert.equal(highsNow(afterNight(61)).season?.highs.PTS.value, 61);
  assert.equal(highsNow(afterNight(61)).career?.PTS.value, 61);
});

test("nunca sale un récord de la jornada empezada o posterior, aunque falte el de antes", () => {
  const current = { PTS: high(55, "2026-11-24"), REB: high(20, "2026-11-25"), AST: high(9, "2026-11-10") };
  // Sin migrar (aún no hay `*_before`) o con el calendario retrasado
  assert.deepEqual(Object.keys(pickHighs(current, null, "2026-11-24")!), ["AST"]);
  assert.deepEqual(Object.keys(pickHighs(current, { PTS: high(50, "2026-11-24"), REB: high(18, "2026-11-25") }, "2026-11-24")!), ["AST"]);
});

test("debut de anoche: todavía no tiene récords", () => {
  const stored: StoredHighs = {
    career: { PTS: high(20, "2026-11-24") },
    careerBefore: {},
    season: { id: "2026-27", highs: { PTS: high(20, "2026-11-24") }, before: {} },
  };
  assert.deepEqual(highsBeforeDay(stored, "2026-11-24"), { career: {}, season: { id: "2026-27", highs: {} } });
});

test("sin ninguna jornada empezada, o récords antiguos sin fecha: se enseñan", () => {
  assert.equal(pickHighs({ PTS: high(61, "2026-11-24") }, null, null)?.PTS.value, 61);
  assert.equal(pickHighs({ PTS: high(100, null) }, null, "2026-11-24")?.PTS.value, 100);
  assert.equal(pickHighs(null, null, "2026-11-24"), null);
});

test("la trayectoria que viaja al navegador no lleva récords", () => {
  const advanced = { min: 34.1, career_highs: {}, career_highs_before: {}, season_highs: { PTS: high(55, "2026-11-24") }, season_highs_before: {} };
  assert.deepEqual(withoutHighs(advanced), { min: 34.1 });
});
