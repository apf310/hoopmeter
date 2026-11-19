// Tests del color de la nota. Se lanzan con `npm test` junto con los del GM, el comparador y el buscador.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatExcitementScore, getExcitementTone } from "./spoilers.ts";

describe("color de la nota (Tarea 6.5)", () => {
  it("8 o más es partidazo (verde)", () => {
    assert.equal(getExcitementTone(8), "high");
    assert.equal(getExcitementTone(9.7), "high");
    assert.equal(getExcitementTone(10), "high");
  });

  it("de 5 a 7.9 se deja ver (ámbar): el partido normal ronda el 6", () => {
    assert.equal(getExcitementTone(5), "mid");
    assert.equal(getExcitementTone(6), "mid");
    assert.equal(getExcitementTone(7.9), "mid");
  });

  it("menos de 5 es flojo (rojo): se decidió antes del último cuarto", () => {
    assert.equal(getExcitementTone(4.9), "low");
    assert.equal(getExcitementTone(1), "low");
  });

  it("sin nota aún, gris", () => {
    assert.equal(getExcitementTone(null), "pending");
    assert.equal(getExcitementTone(Number.NaN), "pending");
    assert.equal(formatExcitementScore(null), "–");
  });

  it("se muestra con un decimal y acotada a 1-10", () => {
    assert.equal(formatExcitementScore(6), "6.0");
    assert.equal(formatExcitementScore(10.4), "10.0");
    assert.equal(formatExcitementScore(0.2), "1.0");
  });
});
