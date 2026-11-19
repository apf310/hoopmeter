// Tests de la plantilla ordenable de la ficha de equipo (Tarea 6.7). Se lanzan con `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_ROSTER_SORT, nextSort, sortRoster, type RosterRow } from "./team-roster.ts";

const row = (id: number, name: string, min: number | null, salary: number | null = null): RosterRow => ({
  id,
  name,
  position: "G",
  gp: min === null ? null : 10,
  min,
  pts: min === null ? null : min / 2,
  reb: null,
  ast: null,
  fg3Pct: null,
  salary,
  salaryStatus: salary === null ? "pending" : "confirmed",
});

const roster = [row(1, "Zion", 30, 5_000_000), row(2, "Álex", null, 40_000_000), row(3, "Bruno", 34), row(4, "Carlos", 12, 2_000_000)];
const ids = (rows: RosterRow[]) => rows.map((r) => r.id);

describe("sortRoster", () => {
  it("por defecto, por minutos de mayor a menor y sin partidos al final", () => {
    assert.deepEqual(ids(sortRoster(roster, DEFAULT_ROSTER_SORT)), [3, 1, 4, 2]);
  });

  it("los vacíos siguen al final al invertir el orden", () => {
    assert.deepEqual(ids(sortRoster(roster, { key: "min", dir: "asc" })), [4, 1, 3, 2]);
    assert.deepEqual(ids(sortRoster(roster, { key: "salary", dir: "asc" })), [4, 1, 2, 3]);
  });

  it("nombres en orden alfabético español (sin tildes por medio)", () => {
    assert.deepEqual(ids(sortRoster(roster, { key: "name", dir: "asc" })), [2, 3, 4, 1]);
  });

  it("no muta la lista original", () => {
    const copy = [...roster];
    sortRoster(roster, { key: "salary", dir: "desc" });
    assert.deepEqual(roster, copy);
  });
});

describe("nextSort", () => {
  it("la misma columna invierte; otra empieza en su orden natural", () => {
    assert.deepEqual(nextSort(DEFAULT_ROSTER_SORT, "min"), { key: "min", dir: "asc" });
    assert.deepEqual(nextSort(DEFAULT_ROSTER_SORT, "salary"), { key: "salary", dir: "desc" });
    assert.deepEqual(nextSort(DEFAULT_ROSTER_SORT, "name"), { key: "name", dir: "asc" });
  });
});
