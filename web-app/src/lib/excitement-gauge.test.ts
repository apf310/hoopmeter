// Tests del velocímetro de la nota (Tarea 7.1). Se lanzan con `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GAUGE_DURATION_MS,
  GAUGE_CENTER,
  GAUGE_RADIUS,
  filledZones,
  gaugeFrame,
  gaugeLashes,
  needleRotation,
  pointAt,
} from "./excitement-gauge.ts";

describe("velocímetro de la nota", () => {
  it("la aguja va de la izquierda (1,0) a la derecha (10,0) pasando por arriba", () => {
    assert.equal(needleRotation(1), 0);
    assert.equal(needleRotation(10), 180);
    assert.equal(needleRotation(5.5), 90);
    const top = pointAt(5.5, GAUGE_RADIUS);
    assert.equal(top.x, GAUGE_CENTER.x);
    assert.equal(top.y, GAUGE_CENTER.y - GAUGE_RADIUS);
  });

  it("acota la nota a la escala", () => {
    assert.equal(needleRotation(-3), 0);
    assert.equal(needleRotation(14), 180);
    assert.equal(needleRotation(Number.NaN), 0);
  });

  it("rellena los tramos de color solo hasta la nota", () => {
    assert.deepEqual(filledZones(4.2).map((z) => z.tone), ["low"]);
    assert.deepEqual(filledZones(6.7).map((z) => z.tone), ["low", "mid"]);
    assert.deepEqual(filledZones(9.1).map((z) => z.tone), ["low", "mid", "high"]);
    assert.deepEqual(filledZones(1), []);
  });

  it("las pestañas llevan el color de la escala, como el logo", () => {
    const lashes = gaugeLashes(90, 100);
    assert.equal(lashes.length, 10);
    assert.deepEqual(
      lashes.map((l) => l.tone),
      ["low", "low", "low", "low", "mid", "mid", "mid", "high", "high", "high"]
    );
  });

  it("la animación dura lo mismo para cualquier nota y acaba justo en ella", () => {
    for (const score of [1.4, 5, 6.2, 7.95, 8, 10]) {
      const end = gaugeFrame(1, score, GAUGE_DURATION_MS);
      assert.equal(end.done, true);
      assert.equal(end.needle, score);
      assert.equal(end.label, score);
      assert.equal(gaugeFrame(1, score, GAUGE_DURATION_MS - 1).done, false);
    }
  });

  it("la cifra nunca se pasa de la nota y la aguja nunca sale de la escala", () => {
    for (const score of [3.3, 7.9, 10]) {
      for (let ms = 0; ms <= GAUGE_DURATION_MS; ms += 20) {
        const frame = gaugeFrame(1, score, ms);
        assert.ok(frame.label <= score + 1e-9, `cifra ${frame.label} > ${score}`);
        assert.ok(frame.needle >= 1 && frame.needle <= 10);
      }
    }
  });
});
