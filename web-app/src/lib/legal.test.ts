// Tests de las páginas legales (Tarea 6.26). Se lanzan con `npm test`.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { DEVICE_DATA, formatLegalDate, LEGAL, LEGAL_UPDATED, mailto } from "./legal.ts";

const SRC = join(import.meta.dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !name.endsWith(".test.ts") ? [path] : [];
  });
}

describe("legal · lo que guarda el dispositivo", () => {
  it("la política nombra todas las claves de almacenamiento y cookies de la app", () => {
    // Cualquier clave nueva ("hoopmeter:…", "nba-hub:…", cookie "hm_…") tiene que salir en /privacidad
    const found = new Set<string>();
    for (const file of sourceFiles(SRC)) {
      for (const match of readFileSync(file, "utf8").matchAll(/["'`]((?:hoopmeter|nba-hub):[a-z-]*:?|hm_[a-z]+)["'`]/g)) {
        found.add(match[1]);
      }
    }
    const listed = new Set(DEVICE_DATA.map((item) => item.key));
    assert.ok(found.size >= 6, `solo se encontraron ${[...found].join(", ")}`);
    for (const key of found) assert.ok(listed.has(key), `falta "${key}" en DEVICE_DATA`);
  });

  it("el nivel de spoilers nunca se borra ni se guarda como los favoritos", () => {
    const spoiler = DEVICE_DATA.find((item) => item.key === "nba-hub:spoiler-level");
    assert.equal(spoiler?.where, "sessionStorage");
    assert.equal(spoiler?.clearable, false);
  });

  it("sin claves repetidas", () => {
    assert.equal(new Set(DEVICE_DATA.map((item) => item.key)).size, DEVICE_DATA.length);
  });
});

describe("legal · textos", () => {
  it("fecha en español", () => {
    assert.equal(formatLegalDate("2026-11-22"), "22 de noviembre de 2026");
    assert.match(formatLegalDate(LEGAL_UPDATED), /^\d{1,2} de [a-z]+ de \d{4}$/);
  });

  it("correo con el asunto codificado", () => {
    assert.equal(mailto("Borrar mis datos"), `mailto:${LEGAL.email}?subject=Borrar%20mis%20datos`);
  });
});
