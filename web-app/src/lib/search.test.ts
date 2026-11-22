// Tests del buscador. Se lanzan con `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addRecent, emptySearchEntries, MAX_RECENT, parseRecent, search, type SearchIndex } from "./search.ts";

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

describe("buscador vacío: recientes y favoritos", () => {
  const LAL = { id: 1610612747, name: "Los Angeles Lakers", abbreviation: "LAL", conference: "West" as const, primary_color: null, secondary_color: null };
  const BOS = { id: 1610612738, name: "Boston Celtics", abbreviation: "BOS", conference: "East" as const, primary_color: null, secondary_color: null };
  const withTeams: SearchIndex = { teams: [LAL, BOS], players: index.players.map((p) => ({ ...p, id: p.id + 1 })) };
  const label = (entries: ReturnType<typeof emptySearchEntries>["recent"]) =>
    entries.map((e) => (e.kind === "team" ? e.team.abbreviation : e.player.full_name));

  it("lee solo lo que tiene forma de reciente", () => {
    assert.deepEqual(parseRecent(null), []);
    assert.deepEqual(parseRecent("{roto"), []);
    assert.deepEqual(parseRecent(JSON.stringify({ kind: "team", id: 1 })), []);
    assert.deepEqual(
      parseRecent(JSON.stringify([{ kind: "team", id: 1 }, { kind: "team", id: 1 }, { kind: "player", id: 1 }, { kind: "x", id: 2 }, { kind: "player", id: -3 }, null])),
      [{ kind: "team", id: 1 }, { kind: "player", id: 1 }]
    );
  });

  it("la última elegida va primera, sin repetirse y con tope", () => {
    let recent = addRecent([], { kind: "player", id: 1 });
    recent = addRecent(recent, { kind: "team", id: 1 });
    recent = addRecent(recent, { kind: "player", id: 1 });
    assert.deepEqual(recent, [{ kind: "player", id: 1 }, { kind: "team", id: 1 }]);
    for (let id = 10; id < 20; id++) recent = addRecent(recent, { kind: "player", id });
    assert.equal(recent.length, MAX_RECENT);
    assert.deepEqual(recent[0], { kind: "player", id: 19 });
  });

  it("los favoritos no se repiten en recientes y lo que ya no existe se omite", () => {
    const recent = [
      { kind: "player" as const, id: 12 }, // LeBron James
      { kind: "team" as const, id: BOS.id },
      { kind: "team" as const, id: LAL.id },
      { kind: "player" as const, id: 999 },
    ];
    const favorites = { teams: [{ id: LAL.id }], players: [{ id: 1, name: "Jordan Clarkson", teamId: null }, { id: 5000, name: "Retirado Sin Índice", teamId: null }] };
    const entries = emptySearchEntries(withTeams, recent, favorites);
    assert.deepEqual(label(entries.recent), ["LeBron James", "BOS"]);
    assert.deepEqual(label(entries.favorites), ["LAL", "Jordan Clarkson", "Retirado Sin Índice"]);
  });
});
