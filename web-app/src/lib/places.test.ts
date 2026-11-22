// Tests de conferencias, divisiones y países en español (Tarea 6.18). Se lanzan con `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { conferenceLabel, countryLabel, divisionLabel } from "./places.ts";

describe("places", () => {
  it("traduce lo que guarda la NBA", () => {
    assert.equal(conferenceLabel("East"), "Este");
    assert.equal(divisionLabel("Atlantic"), "Atlántico");
    assert.equal(divisionLabel("Southwest"), "Suroeste");
    assert.equal(countryLabel("Spain"), "España");
    assert.equal(countryLabel("USA"), "EE. UU.");
    assert.equal(countryLabel("DRC"), "R. D. del Congo");
  });

  it("lo desconocido sale tal cual y lo vacío, null", () => {
    assert.equal(countryLabel("Atlantis"), "Atlantis");
    assert.equal(countryLabel(null), null);
    assert.equal(divisionLabel(""), null);
  });
});
