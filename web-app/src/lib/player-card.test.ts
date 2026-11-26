import assert from "node:assert/strict";
import { test } from "node:test";
import { cardTier, legendLine, legendWeight, splitName, surnameSize, tiltAt } from "./player-card.ts";

test("el material sale de la media, con los mismos cortes que las barras (Tarea 7.10)", () => {
  assert.equal(cardTier(true, 99), "elite");
  assert.equal(cardTier(true, 84), "elite");
  assert.equal(cardTier(true, 83), "great");
  assert.equal(cardTier(true, 70), "great");
  assert.equal(cardTier(true, 69), "good");
  assert.equal(cardTier(true, 55), "good");
  assert.equal(cardTier(true, 54), "base");
  assert.equal(cardTier(true, 40), "base");
  // Sin partidos esta temporada: cartón, nunca la del año pasado
  assert.equal(cardTier(true, null), "base");
  assert.equal(cardTier(false, null), "legend");
});

test("la leyenda lleva sus dos mayores logros, en singular si toca", () => {
  assert.equal(legendLine({ champion: 6, mvp: 5, fmvp: 6, allstar: 14 }), "6 anillos · 5 MVP");
  assert.equal(legendLine({ champion: 1, allstar: 1 }), "1 anillo · 1 All-Star");
  assert.equal(legendLine({ mvp: 2, allstar: 11 }), "2 MVP · 11 All-Star");
  assert.equal(legendLine({ allstar: 8 }), "8 All-Star");
  assert.equal(legendLine({ champion: 0 }), "");
  assert.equal(legendLine({}), "");
});

test("la tira empieza por los más laureados", () => {
  assert.ok(legendWeight({ champion: 6, mvp: 5, fmvp: 6, allstar: 14 }) > legendWeight({ champion: 2, allstar: 6 }));
  assert.equal(legendWeight({}), 0);
});

test("nombre y apellidos, también con uno solo", () => {
  assert.deepEqual(splitName("Nikola Jokić"), { first: "Nikola", last: "Jokić" });
  assert.deepEqual(splitName("Michael Porter Jr."), { first: "Michael", last: "Porter Jr." });
  assert.deepEqual(splitName("Nenê"), { first: "", last: "Nenê" });
});

test("los apellidos largos encogen hasta caber", () => {
  for (const tier of ["legend", "elite", "great", "good", "base"] as const) {
    const width = tier === "legend" ? 78 : tier === "base" ? 82 : 65;
    for (const surname of ["Ball", "Antetokounmpo", "Gilgeous-Alexander", "Alexander-Walker"]) {
      assert.ok(surnameSize(surname, tier) * surname.length * 0.49 <= width + 1, `${surname} en ${tier}`);
    }
  }
  assert.equal(surnameSize("Ball", "elite"), 14.6);
});

test("la inclinación nunca pasa del tope aunque el dedo se salga", () => {
  assert.deepEqual(tiltAt(0.5, 0.5), { rx: 0, ry: 0, mx: 50, my: 50, on: 1 });
  assert.deepEqual(tiltAt(-3, 9), tiltAt(0, 1));
  assert.equal(tiltAt(5, 0).ry, 13);
  assert.equal(tiltAt(0, -2).rx, 11);
});
