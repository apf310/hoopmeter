// Tests del buscador. Se lanzan con `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { search, type SearchIndex } from "./search.ts";

const names = [
  "Jordan Clarkson", "Jordan Goodwin", "Jordan Hawkins", "Jordan McLaughlin", "Jordan Miller", "Jordan Poole", "Jordan Walsh", "Jordan Nwora", "Jordan Ott",
  "Michael Jordan", "DeAndre Jordan", "LeBron James", "James Harden", "Shai Gilgeous-Alexander", "Pau Gasol", "Paul George",
];

const index: SearchIndex = {
  teams: [],
  players: names.map((full_name, id) => ({ id, full_name, position: null, team_id: null, is_active: true })),
};
const found = (query: string) => search(index, query).players.map((player) => player.full_name);

describe("buscador", () => {
  it("el apellido exacto va por delante de quien se llama así de nombre", () => {
    assert.deepEqual(found("jordan").slice(0, 2), ["DeAndre Jordan", "Michael Jordan"]);
    assert.equal(found("james")[0], "LeBron James");
  });

  it("el nombre completo manda sobre todo", () => {
    assert.equal(found("jordan poole")[0], "Jordan Poole");
  });

  it("siguen valiendo los prefijos y las iniciales", () => {
    assert.equal(found("pau")[0], "Pau Gasol");
    assert.equal(found("sga")[0], "Shai Gilgeous-Alexander");
  });
});
