// Tests de la evaluación del GM por partes (Tarea 6.24). Se lanzan con `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parsePartialJson, partialEvaluation, splitLines } from "./trade-evaluation-stream.ts";

const GRADES = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F"];
const TEAMS = [
  { id: 1, abbreviation: "BOS" },
  { id: 2, abbreviation: "ORL" },
];
const FULL = JSON.stringify({
  teams: [
    { team: "BOS", analysis: "Boston gana tiro.", headline: "Tiro para Boston", grade: "A-" },
    { team: "ORL", analysis: "Orlando pierde a \"su\" escolta.\nY ronda.", headline: "Orlando se queda corto", grade: "C+" },
  ],
  summary: "Gana Boston.",
});

describe("parsePartialJson", () => {
  it("lee el JSON completo igual que JSON.parse", () => {
    assert.deepEqual(parsePartialJson(FULL), JSON.parse(FULL));
  });

  it("nunca falla con ningún prefijo de la respuesta", () => {
    for (let end = 0; end <= FULL.length; end++) {
      const value = parsePartialJson(FULL.slice(0, end));
      assert.ok(end === 0 || value !== undefined, `prefijo de ${end} caracteres`);
    }
  });

  it("enseña el texto que se está escribiendo, sin el escape a medias", () => {
    assert.deepEqual(parsePartialJson('{"teams":[{"team":"BOS","analysis":"Boston ga'), { teams: [{ team: "BOS", analysis: "Boston ga" }] });
    assert.deepEqual(parsePartialJson('{"a":"x\\'), { a: "x" });
    assert.deepEqual(parsePartialJson('{"a":"x\\u00'), { a: "x" });
    assert.deepEqual(parsePartialJson('{"a":"x\\u00e1'), { a: "xá" });
  });

  it("quita claves sin valor y comas finales", () => {
    assert.deepEqual(parsePartialJson('{"teams":[{"team":"BOS","anal'), { teams: [{ team: "BOS" }] });
    assert.deepEqual(parsePartialJson('{"teams":[{"team":"BOS",'), { teams: [{ team: "BOS" }] });
    assert.deepEqual(parsePartialJson('{"teams":[{"team":"BOS"},'), { teams: [{ team: "BOS" }] });
    assert.deepEqual(parsePartialJson('{"teams":'), {});
  });

  it("sin textos a medias, una nota solo sale entera", () => {
    assert.deepEqual(parsePartialJson('{"grade":"A', false), {});
    assert.deepEqual(parsePartialJson('{"grade":"A-"', false), { grade: "A-" });
  });
});

describe("partialEvaluation", () => {
  it("con la respuesta entera da los dos equipos con su nota", () => {
    assert.deepEqual(partialEvaluation(FULL, TEAMS, GRADES), {
      teams: [
        { teamId: 1, analysis: "Boston gana tiro.", headline: "Tiro para Boston", grade: "A-" },
        { teamId: 2, analysis: 'Orlando pierde a "su" escolta.\nY ronda.', headline: "Orlando se queda corto", grade: "C+" },
      ],
      summary: "Gana Boston.",
    });
  });

  it("nunca enseña la mitad de una nota ni una nota fuera de la escala", () => {
    const cut = FULL.indexOf('"A-"') + 2; // ...,"grade":"A
    const teams = partialEvaluation(FULL.slice(0, cut), TEAMS, GRADES)!.teams;
    assert.equal(teams[0].grade, undefined);
    assert.equal(teams[0].headline, "Tiro para Boston");
    const invented = partialEvaluation('{"teams":[{"team":"BOS","grade":"Z"}]}', TEAMS, GRADES)!;
    assert.equal(invented.teams[0].grade, undefined);
  });

  it("solo equipos del traspaso, en su orden, y la sigla tiene que estar entera", () => {
    const raw = '{"teams":[{"team":"ORL","analysis":"x"},{"team":"LAL","analysis":"y"},{"team":"BO';
    assert.deepEqual(
      partialEvaluation(raw, TEAMS, GRADES)!.teams.map((team) => team.teamId),
      [2],
    );
  });

  it("sin nada legible todavía, no hay evaluación", () => {
    assert.equal(partialEvaluation("", TEAMS, GRADES), null);
    assert.deepEqual(partialEvaluation("{", TEAMS, GRADES), { teams: [], summary: undefined });
  });
});

describe("splitLines", () => {
  it("separa los eventos completos y guarda el que está a medias", () => {
    assert.deepEqual(splitLines('{"a":1}\n{"b":2}\n{"c"'), { lines: ['{"a":1}', '{"b":2}'], rest: '{"c"' });
    assert.deepEqual(splitLines("\n\n"), { lines: [], rest: "" });
  });
});
