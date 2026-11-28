// Tests de los recibos de los retos (Tarea 8.5). Se lanzan con `npm test`.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";
import { signReceipt, verifyReceipt, withReceipt, type Receipt } from "./game-receipt.ts";
import { addResult, dropReceipts, EMPTY_PROGRESS, isReceiptToken, parseProgress, serializeProgress } from "./games.ts";

const key = randomBytes(32);
const receipt: Receipt = {
  run: "0b9f3c1e-2a4d-4e6f-8a1b-2c3d4e5f6a7b",
  game: "mas-o-menos",
  day: "2026-11-28",
  points: 44,
  ms: 151_234,
  rows: ["ooxoooxooo", "oooooxoooo", "ooxooooooo"],
};

describe("recibos · firma", () => {
  it("un recibo bueno devuelve su resultado", () => {
    assert.deepEqual(verifyReceipt(signReceipt(receipt, key), key), receipt);
  });

  it("el mismo resultado da siempre el mismo recibo", () => {
    assert.equal(signReceipt(receipt, key), signReceipt({ ...receipt }, key));
  });

  it("cambiar los puntos (o cualquier dato) rompe la firma", () => {
    const token = signReceipt(receipt, key);
    const [version, , signature] = token.split(".");
    for (const change of [{ points: 60 }, { day: "2026-11-27" }, { run: "1b9f3c1e-2a4d-4e6f-8a1b-2c3d4e5f6a7b" }, { game: "adivina" }]) {
      const data = Buffer.from(JSON.stringify({ ...receipt, ...change })).toString("base64url");
      assert.equal(verifyReceipt(`${version}.${data}.${signature}`, key), null, JSON.stringify(change));
    }
  });

  it("con otra clave no vale", () => {
    assert.equal(verifyReceipt(signReceipt(receipt, key), randomBytes(32)), null);
  });

  it("basura, nunca un error", () => {
    for (const token of [null, 42, "", "r1", "r1..", "r1.a.b.c", "r2.a.b", "x".repeat(5_000)]) {
      assert.equal(verifyReceipt(token, key), null, String(token));
    }
  });

  it("ni firmados valen datos imposibles", () => {
    for (const bad of [{ points: 61 }, { game: "adivina", points: 21 }, { points: -1 }, { points: 1.5 }, { rows: ["ooz"] }, { day: "ayer" }]) {
      assert.equal(verifyReceipt(signReceipt({ ...receipt, ...bad } as Receipt, key), key), null, JSON.stringify(bad));
    }
  });
});

describe("recibos · en el servidor", () => {
  it("sin la clave del GM no hay recibo", () => {
    const before = process.env.GM_DB_SECRET;
    delete process.env.GM_DB_SECRET;
    assert.equal(withReceipt({ points: 20, rows: ["ooooo"] }, { run: receipt.run, game: "adivina", day: receipt.day }).receipt, undefined);
    process.env.GM_DB_SECRET = "clave-de-prueba";
    const signed = withReceipt({ points: 20, rows: ["ooooo"] }, { run: receipt.run, game: "adivina", day: receipt.day });
    assert.ok(isReceiptToken(signed.receipt));
    if (before === undefined) delete process.env.GM_DB_SECRET;
    else process.env.GM_DB_SECRET = before;
  });
});

describe("recibos · en el dispositivo", () => {
  const token = signReceipt(receipt, key);

  it("se guardan con el resultado y sobreviven a guardar y leer", () => {
    const progress = addResult(EMPTY_PROGRESS, { day: receipt.day, game: receipt.game, points: 44, rows: receipt.rows, receipt: token });
    assert.equal(parseProgress(serializeProgress(progress)).results[0].receipt, token);
  });

  it("lo que no tiene forma de recibo no se guarda", () => {
    const progress = addResult(EMPTY_PROGRESS, { day: receipt.day, game: receipt.game, points: 44, rows: [], receipt: "<script>" });
    assert.equal(progress.results[0].receipt, undefined);
  });

  it("los mandados a la cuenta se quitan", () => {
    const progress = addResult(EMPTY_PROGRESS, { day: receipt.day, game: receipt.game, points: 44, rows: [], receipt: token });
    const after = dropReceipts(progress, new Set([token]));
    assert.equal(after.results[0].receipt, undefined);
    assert.equal(after.results[0].points, 44);
    assert.equal(dropReceipts(after, new Set([token])), after);
  });
});
