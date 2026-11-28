// Tests del ELO de los Juegos (Tarea 8.1, revisada el 28-nov). Se lanzan con `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ANCHOR,
  ELO_K,
  eloDelta,
  eloOf,
  eloOfDay,
  eloSeason,
  expectedShare,
  FLOORS,
  PAR_PRIOR,
  parOf,
  seasonReset,
  START_ELO,
} from "./elo.ts";
import { addDays } from "./game-day.ts";
import { addPar, CHALLENGES, divisionOf, EMPTY_PROGRESS, addResult, missingPars, parseProgress, serializeProgress, type ChallengeId, type ChallengeResult } from "./games.ts";

const MAX = Object.fromEntries(CHALLENGES.map((c) => [c.id, c.maxPoints])) as Record<ChallengeId, number>;

/** `days` días seguidos desde `from` jugando los tres retos, sacando `share` (de 0 a 1) de cada uno con el par de siempre. */
function playDays(from: string, days: number, share: Partial<Record<ChallengeId, number>> | number, par?: Partial<Record<ChallengeId, number>>): ChallengeResult[] {
  const out: ChallengeResult[] = [];
  for (let i = 0; i < days; i++) {
    const day = addDays(from, i);
    for (const c of CHALLENGES) {
      const s = typeof share === "number" ? share : (share[c.id] ?? 0.5);
      out.push({ day, game: c.id, points: Math.round(s * MAX[c.id]), rows: [], par: par?.[c.id] ?? PAR_PRIOR[c.id] });
    }
  }
  return out;
}

/** Días que tarda en llegar a ese ELO jugando así (o null si no llega en `limit` días). */
function daysTo(elo: number, share: Partial<Record<ChallengeId, number>> | number, limit = 400): number | null {
  const results = playDays("2026-11-01", limit, share);
  const perDay = CHALLENGES.length;
  const state = eloOf(results);
  const index = state.entries.findIndex((e) => e.elo >= elo);
  return index < 0 ? null : Math.floor(index / perDay) + 1;
}

describe("elo", () => {
  it("el par del día: la mediana de quienes lo han acabado, acercada a lo de siempre con pocos datos", () => {
    assert.equal(parOf("carrera", null), PAR_PRIOR.carrera);
    assert.equal(parOf("carrera", { n: 0, median: 0 }), PAR_PRIOR.carrera);
    // 20 partidas pesan como lo de siempre: mitad y mitad
    assert.equal(parOf("carrera", { n: 20, median: 5 }), Math.round(((0.25 + PAR_PRIOR.carrera) / 2) * 1000) / 1000);
    // Con muchas, casi lo que pasó
    assert.ok(Math.abs(parOf("mas-o-menos", { n: 5000, median: 30 }) - 0.5) < 0.01);
    // Nunca 0 ni 1 (el esperado se volvería infinito)
    assert.equal(parOf("adivina", { n: 100_000, median: 20 }), 0.95);
    assert.equal(parOf("adivina", { n: 100_000, median: 0 }), 0.05);
  });

  it("quien juega como la mitad de la gente se queda en Titular (1.000) y no gana ni pierde", () => {
    for (const c of CHALLENGES) {
      assert.ok(Math.abs(expectedShare(ANCHOR, PAR_PRIOR[c.id]) - PAR_PRIOR[c.id]) < 1e-9);
      assert.equal(eloDelta(ANCHOR, c.id, PAR_PRIOR[c.id] * MAX[c.id], PAR_PRIOR[c.id]), 0);
    }
    assert.equal(divisionOf(ANCHOR).division.name, "Titular");
  });

  it("un día difícil para todos no castiga: sacar el par nunca baja el ELO", () => {
    // Una leyenda de los años 50 en Carrera oculta: la mitad saca 4 de 20
    const hardPar = parOf("carrera", { n: 2000, median: 4 });
    assert.equal(eloDelta(ANCHOR, "carrera", 4, hardPar), 0);
    // Con el par de siempre, esos 4 puntos habrían bajado el ELO
    assert.ok(eloDelta(ANCHOR, "carrera", 4, PAR_PRIOR.carrera) < 0);
  });

  it("cada reto mueve como mucho su K (¿Más o menos? el doble): nunca más de 60 al día", () => {
    assert.deepEqual(ELO_K, { "mas-o-menos": 30, adivina: 15, carrera: 15 });
    for (const c of CHALLENGES) {
      for (const elo of [0, 500, 1000, 1500, 3000]) {
        for (const share of [0, 0.5, 1]) {
          const d = eloDelta(elo, c.id, share * MAX[c.id], 0.5);
          assert.ok(Math.abs(d) <= ELO_K[c.id], `${c.id} ${elo} ${share} → ${d}`);
        }
      }
    }
    const best = eloOf(playDays("2026-11-01", 1, 1));
    assert.ok(best.elo <= 60);
  });

  it("justo con quien llega tarde, pero sin atajos: subir lleva semanas", () => {
    // Perfecto todos los días: ni en dos semanas sale de Sexto Hombre, ni llega a MVP en menos de un mes
    const perfectTitular = daysTo(800, 1)!;
    const perfectMvp = daysTo(1_250, 1)!;
    const perfectHall = daysTo(1_400, 1)!;
    assert.ok(perfectTitular > 14, `Titular en ${perfectTitular} días`);
    assert.ok(perfectMvp > 30, `MVP en ${perfectMvp} días`);
    assert.ok(perfectHall > perfectMvp + 7, `Hall of Fame en ${perfectHall} días`);
    // Muy bueno (9 de cada 10): All-Star en unas semanas y MVP en más de un mes; con 8 de cada 10, nunca MVP
    assert.ok(daysTo(1_100, 0.9)! < 60);
    assert.ok(daysTo(1_250, 0.9)! > 40);
    assert.equal(daysTo(1_250, 0.8), null);
    // Como la mitad de la gente: Titular, nunca All-Star
    assert.ok(daysTo(800, PAR_PRIOR) !== null);
    assert.equal(daysTo(1_100, PAR_PRIOR), null);
  });

  it("cada uno acaba donde le toca: quien empezó antes no se queda arriba sin jugar bien", () => {
    // Uno lleva un año jugando como la mitad; otro llega ahora y juega muy bien: le alcanza y le pasa
    const veteran = eloOf(playDays("2025-11-01", 365, PAR_PRIOR));
    const veteranNow = veteran.elo;
    assert.ok(veteranNow >= 900 && veteranNow <= 1_050, `veterano ${veteranNow}`);
    const newcomer = eloOf(playDays("2026-11-01", 120, 0.9));
    assert.ok(newcomer.elo > veteranNow, `nuevo ${newcomer.elo}`);
    // Pero no en dos semanas
    assert.ok(eloOf(playDays("2026-11-01", 14, 1)).elo < veteranNow);
  });

  it("se baja si se juega peor de lo esperado, pero Sexto Hombre y Titular no se pierden", () => {
    assert.deepEqual(FLOORS, [400, 800]);
    const climb = playDays("2026-11-01", 40, 0.9);
    const top = eloOf(climb).elo;
    const crash = eloOf([...climb, ...playDays("2026-12-11", 60, 0)]);
    assert.ok(crash.entries.some((e) => e.delta < 0));
    assert.equal(crash.elo, 800, "se queda en el suelo de Titular");
    assert.ok(top > 800);
    // Con poco ELO apenas se pierde (como en las primeras divisiones de cualquier juego), y nunca por debajo de 0
    const early = eloOf([...playDays("2026-11-01", 2, 1), ...playDays("2026-11-03", 3, 0)]);
    assert.ok(early.elo <= eloOf(playDays("2026-11-01", 2, 1)).elo);
    assert.ok(early.elo >= START_ELO);
  });

  it("temporada nueva el 1 de octubre: lo que pasa de Titular se queda en la mitad", () => {
    assert.equal(eloSeason("2027-09-30"), 2026);
    assert.equal(eloSeason("2027-10-01"), 2027);
    assert.equal(seasonReset(1_400), 1_100);
    assert.equal(seasonReset(700), 700);
    const before = eloOf(playDays("2026-11-01", 200, 1));
    assert.ok(before.elo > 1_400);
    const after = eloOf([...playDays("2026-11-01", 200, 1), { day: "2027-10-01", game: "adivina", points: 11, rows: [], par: 0.55 }]);
    const first = after.entries.at(-1)!;
    assert.ok(first.elo < before.elo - 200, "baja al empezar la temporada");
    assert.ok(after.best < before.best, "lo mejor de la temporada empieza de nuevo");
    assert.ok(Math.abs(after.best - seasonReset(before.elo)) <= ELO_K.adivina);
  });

  it("por días y, dentro del día, en el orden en que se jugaron: lo que dio un reto no cambia al jugar el siguiente", () => {
    const a: ChallengeResult = { day: "2026-11-02", game: "carrera", points: 20, rows: [], par: 0.45 };
    const b: ChallengeResult = { day: "2026-11-02", game: "mas-o-menos", points: 50, rows: [], par: 0.6 };
    const c: ChallengeResult = { day: "2026-11-01", game: "adivina", points: 14, rows: [] };
    const state = eloOf([a, b, c]);
    assert.deepEqual(state.entries.map((e) => e.game), ["adivina", "carrera", "mas-o-menos"]);
    // La Carrera se jugó antes: su cambio es el mismo con y sin el ¿Más o menos? de después
    assert.equal(eloOf([a, c]).entries[1].delta, state.entries[1].delta);
    assert.equal(eloOfDay(state, "2026-11-02"), state.entries[1].delta + state.entries[2].delta);
    assert.equal(eloOfDay(state, "2026-11-03"), 0);
    // Sin par, el de siempre
    assert.equal(state.entries[0].delta, eloDelta(0, "adivina", 14, PAR_PRIOR.adivina));
    // Guardado y leído, el orden del día se mantiene
    let progress = EMPTY_PROGRESS;
    for (const r of [c, a, b]) progress = addResult(progress, r);
    assert.deepEqual(parseProgress(serializeProgress(progress)).results.map((r) => r.game), ["adivina", "carrera", "mas-o-menos"]);
  });

  it("el par se guarda con el resultado, una sola vez, y se pide solo para hoy y ayer", () => {
    const result: ChallengeResult = { day: "2026-11-27", game: "carrera", points: 10, rows: ["xc"] };
    let progress = addResult(EMPTY_PROGRESS, result);
    assert.deepEqual(missingPars(progress, "2026-11-28").map((r) => r.game), ["carrera"]);
    assert.deepEqual(missingPars(progress, "2026-11-29"), []);
    progress = addPar(progress, "2026-11-27", "carrera", 0.41);
    assert.equal(progress.results[0].par, 0.41);
    assert.equal(addPar(progress, "2026-11-27", "carrera", 0.6), progress, "no cambia después");
    assert.equal(addPar(progress, "2026-11-27", "adivina", 0.6), progress, "sin resultado no hay par");
    assert.deepEqual(missingPars(progress, "2026-11-28"), []);
    assert.deepEqual(parseProgress(serializeProgress(progress)).results, progress.results);
    // Lo guardado, sin fiarse: un par imposible se ignora
    const raw = JSON.stringify({ results: [{ ...result, par: 7 }] });
    assert.equal(parseProgress(raw).results[0].par, undefined);
  });
});
