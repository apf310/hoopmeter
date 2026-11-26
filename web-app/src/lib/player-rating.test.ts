// Tests de la media, la escala y los avisos de la ficha del jugador (Tareas 6.19 y 7.10). Se lanzan con `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RadarAttributes } from "@/lib/supabase";
import { NO_GAMES_NOTE, overallRating, RATING_MIDDLE, ratingLevel, ratingShare, sampleNote, shotPct } from "./player-rating.ts";

const radar = (extra: Partial<RadarAttributes>): RadarAttributes => ({
  season: "2026-27",
  scoring: 50,
  shooting: 50,
  playmaking: 50,
  defense: 50,
  rebounding: 50,
  efficiency: 50,
  qualified: true,
  games_played: 40,
  updated_at: "2026-11-22T10:30:00+00:00",
  ...extra,
});

describe("overallRating", () => {
  it("usa la media guardada, no las barras", () => {
    assert.equal(overallRating(radar({ overall: 97, rebounding: 99, efficiency: 99, defense: 99 })), 97);
  });

  it("todo el que ha jugado tiene media, también fuera de la rotación (Tarea 7.10)", () => {
    assert.equal(overallRating(radar({ overall: 54, qualified: false, games_played: 18 })), 54);
  });

  it("sin media si no ha jugado esta temporada o en radares anteriores a la 6.19", () => {
    assert.equal(overallRating(radar({ overall: null, qualified: false, games_played: 0 })), null);
    // Un pívot de rol con tres barras de 99 no saca una media inventada con las barras
    assert.equal(overallRating(radar({ rebounding: 99, efficiency: 99, defense: 99, scoring: 60 })), null);
  });
});

describe("escala de 40 a 99", () => {
  it("niveles: 84+, 70-83, 55-69 y menos de 55", () => {
    assert.deepEqual([99, 84, 83, 70, 69, 55, 54, 40].map(ratingLevel), ["elite", "elite", "great", "great", "good", "good", "low", "low"]);
  });

  it("se dibuja con 40 en el centro y 99 en el borde, sin salirse", () => {
    assert.equal(ratingShare(40), 0);
    assert.equal(ratingShare(99), 1);
    assert.equal(ratingShare(RATING_MIDDLE), 0.5);
    assert.equal(ratingShare(0), 0);
    assert.equal(ratingShare(120), 1);
  });
});

describe("sampleNote", () => {
  it("sin partidos esta temporada: ni media ni atributos", () => {
    assert.equal(sampleNote({ games_played: 0 }), NO_GAMES_NOTE);
  });

  it("muestra corta al principio de la temporada; nada con 20 partidos o más", () => {
    assert.equal(sampleNote({ games_played: 1 }), "Muestra corta (1 partido): media y atributos se acercan a los de un suplente hasta que juegue más.");
    assert.equal(sampleNote({ games_played: 14 }), "Muestra corta (14 partidos): media y atributos se acercan a los de un suplente hasta que juegue más.");
    assert.equal(sampleNote({ games_played: 20 }), null);
  });
});

describe("shotPct", () => {
  it("con pocos intentos enseña los aciertos, no un 100 %", () => {
    assert.equal(shotPct(1, 1, 1), "1/1");
    assert.equal(shotPct(0.5, 9, 19), "9/19");
    assert.equal(shotPct(0, 0, 0), "–");
  });

  it("con intentos suficientes o sin totales, el porcentaje", () => {
    assert.equal(shotPct(0.4, 8, 20), "40.0");
    assert.equal(shotPct(0.375), "37.5");
    assert.equal(shotPct(null), "–");
  });
});
