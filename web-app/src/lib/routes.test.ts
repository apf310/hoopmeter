// Tests de las direcciones con nombre (Tarea 7.8). Se lanzan con `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { idFromSegment, playerPath, slugify, teamPath, unnamedPage } from "./routes.ts";

describe("direcciones con nombre", () => {
  it("nombre sin tildes, puntos ni signos", () => {
    assert.equal(slugify("Nikola Jokić"), "nikola-jokic");
    assert.equal(slugify("Kristaps Porziņģis"), "kristaps-porzingis");
    assert.equal(slugify("Dennis Schröder"), "dennis-schroder");
    assert.equal(slugify("Chris Mañon"), "chris-manon");
    assert.equal(slugify("Ernest Udeh, Jr."), "ernest-udeh-jr");
    assert.equal(slugify("P.J. Washington"), "pj-washington");
    assert.equal(slugify("D'Angelo Russell"), "dangelo-russell");
    assert.equal(slugify("Shai Gilgeous-Alexander"), "shai-gilgeous-alexander");
    assert.equal(slugify("Nikola Đurišić"), "nikola-durisic");
    assert.equal(slugify("Philadelphia 76ers"), "philadelphia-76ers");
  });

  it("la dirección lleva siempre el id delante", () => {
    assert.equal(playerPath(203999, "Nikola Jokić"), "/players/203999-nikola-jokic");
    assert.equal(teamPath(1610612757, "Portland Trail Blazers"), "/teams/1610612757-portland-trail-blazers");
    // Un nombre sin ninguna letra latina se queda en el id (que sigue abriendo la ficha)
    assert.equal(playerPath(7, "姚明"), "/players/7");
  });

  it("manda el id: con otro nombre o sin él es la misma ficha", () => {
    for (const segment of ["203999", "203999-nikola-jokic", "203999-otro", "203999-", "203999-joki%C4%87"]) {
      assert.equal(idFromSegment(segment), 203999, segment);
    }
    for (const segment of ["", "0", "-1", "nikola-jokic", "203999x", "203999.5", "1e5", "9".repeat(20)]) {
      assert.equal(idFromSegment(segment), null, segment);
    }
  });

  it("ida y vuelta", () => {
    assert.equal(idFromSegment(playerPath(1629029, "Luka Dončić").split("/")[2]), 1629029);
    assert.equal(idFromSegment(teamPath(1610612755, "Philadelphia 76ers").split("/")[2]), 1610612755);
  });

  it("solo se redirigen las fichas sin nombre", () => {
    assert.deepEqual(unnamedPage("/players/203999"), { kind: "player", id: 203999 });
    assert.deepEqual(unnamedPage("/teams/1610612743/"), { kind: "team", id: 1610612743 });
    for (const path of ["/players", "/players/203999-nikola-jokic", "/players/203999/opengraph-image", "/games/0022600250", "/api/players/203999", "/players/0"]) {
      assert.equal(unnamedPage(path), null, path);
    }
  });
});
