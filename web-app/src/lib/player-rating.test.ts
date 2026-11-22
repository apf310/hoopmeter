// Tests de la media y los avisos de la ficha del jugador (Tarea 6.19). Se lanzan con `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RadarAttributes } from "@/lib/supabase";
import { overallRating, sampleNote, shotPct } from "./player-rating.ts";

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

  it("sin media fuera de la escala o en radares anteriores a la 6.19", () => {
    assert.equal(overallRating(radar({ overall: null, qualified: false })), null);
    // Un pívot de rol con tres barras de 99 ya no saca una media inflada por las 4 mejores
    assert.equal(overallRating(radar({ rebounding: 99, efficiency: 99, defense: 99, scoring: 60 })), null);
  });
});

describe("sampleNote", () => {
  it("avisa de quien no entra en la escala, con sus minutos por partido", () => {
    assert.equal(
      sampleNote({ qualified: false, games_played: 15, minutes: 194 }),
      "Juega poco para entrar en la escala (15 partidos, 13 min por partido): valores orientativos y sin media."
    );
    assert.equal(
      sampleNote({ qualified: false, games_played: 1 }),
      "Juega poco para entrar en la escala (1 partido): valores orientativos y sin media."
    );
  });

  it("muestra corta al principio de la temporada; nada con 20 partidos o más", () => {
    assert.equal(sampleNote({ qualified: true, games_played: 14, minutes: 515 }), "Muestra corta (14 partidos): aún puede moverse bastante.");
    assert.equal(sampleNote({ qualified: true, games_played: 20, minutes: 700 }), null);
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
