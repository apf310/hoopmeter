// Tests de la caché y el tope diario de las evaluaciones del GM (Tarea 7.7). Se lanzan con `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMemory, dailyLimit, evaluationId, isEvaluationOf } from "./gm-store.ts";

const team = (teamId: number) => ({ teamId, grade: "B+" as const, headline: "Titular", analysis: "Análisis." });
const evaluation = (...ids: number[]) => ({ summary: "Resumen.", teams: ids.map(team) });

describe("evaluación guardada", () => {
  it("solo vale si tiene a todos los equipos del traspaso, y a ninguno más", () => {
    assert.ok(isEvaluationOf(evaluation(1, 2), [1, 2]));
    assert.ok(isEvaluationOf(evaluation(2, 1), [1, 2]));
    assert.ok(!isEvaluationOf(evaluation(1, 3), [1, 2]));
    assert.ok(!isEvaluationOf(evaluation(1, 2, 3), [1, 2]));
    assert.ok(!isEvaluationOf(evaluation(1), [1, 2]));
  });

  it("y con todos sus textos", () => {
    assert.ok(!isEvaluationOf({ ...evaluation(1, 2), summary: "" }, [1, 2]));
    assert.ok(!isEvaluationOf({ summary: "Resumen.", teams: [team(1), { ...team(2), analysis: undefined }] }, [1, 2]));
    for (const value of [null, undefined, "texto", 3, {}, { teams: [null, null] }]) assert.ok(!isEvaluationOf(value, [1, 2]));
  });

  it("cada traspaso tiene su huella", () => {
    assert.match(evaluationId("a"), /^[0-9a-f]{64}$/);
    assert.notEqual(evaluationId("a"), evaluationId("b"));
  });
});

describe("tope diario", () => {
  it("300 si no se dice otra cosa, y lo que no se entiende no lo cambia", () => {
    assert.equal(dailyLimit(undefined), 300);
    for (const value of ["", "muchas", "-5", "2.5"]) assert.equal(dailyLimit(value), 300);
    assert.equal(dailyLimit("50"), 50);
    assert.equal(dailyLimit("0"), 0);
  });
});

describe("memoria de la instancia", () => {
  it("cuenta las nuevas del día y empieza de cero al siguiente", () => {
    let now = Date.parse("2026-11-25T10:00:00Z");
    const memory = createMemory(() => 2, () => now);
    assert.deepEqual([memory.claim(), memory.claim(), memory.claim()], [true, true, false]);
    now += 24 * 3_600_000;
    assert.equal(memory.claim(), true);
  });

  it("recuerda una evaluación un día", () => {
    let now = Date.parse("2026-11-25T10:00:00Z");
    const memory = createMemory(() => 2, () => now);
    memory.set("a", evaluation(1, 2));
    assert.deepEqual(memory.get("a"), evaluation(1, 2));
    assert.equal(memory.get("b"), null);
    now += 24 * 3_600_000;
    assert.equal(memory.get("a"), null);
  });

  it("no crece sin límite: olvida las más antiguas", () => {
    const memory = createMemory(() => 2);
    for (let i = 0; i < 250; i++) memory.set(`t${i}`, evaluation(1, 2));
    assert.equal(memory.get("t0"), null);
    assert.ok(memory.get("t249"));
  });
});
