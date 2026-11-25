// Tests del aviso de errores (Tarea 6.27). Se lanzan con `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildReport,
  coarseAgent,
  describeError,
  isNoise,
  normalizeMessage,
  normalizePath,
  parseErrorBody,
  trimStack,
} from "./error-report.ts";

describe("error-report · ruta", () => {
  it("sin parámetros ni ancla, y los ids agrupados", () => {
    assert.equal(normalizePath("/games/0022600245?nivel=3#boxscore"), "/games/:id");
    assert.equal(normalizePath("https://hoopmeter.com/players/1629029?temporada=2025-26"), "/players/:id");
    assert.equal(normalizePath("/players/203999-nikola-jokic"), "/players/:id");
    assert.equal(normalizePath("/teams/1610612755-philadelphia-76ers/opengraph-image"), "/teams/:id/opengraph-image");
    assert.equal(normalizePath("/gm-simulator?equipos=1610612747,1610612738&jugadores=2544-1610612738"), "/gm-simulator");
    assert.equal(normalizePath("/"), "/");
    assert.equal(normalizePath(""), null);
  });

  it("los números cortos de una ruta se quedan (no son ids)", () => {
    assert.equal(normalizePath("/api/teams/12/games"), "/api/teams/12/games");
  });
});

describe("error-report · mensaje y pila", () => {
  it("el mismo fallo en dos partidos da el mismo mensaje", () => {
    assert.equal(
      normalizeMessage("No hay boxscore de   0022600245"),
      normalizeMessage("No hay boxscore de 0022600301")
    );
    assert.equal(normalizeMessage("Minified React error #418"), "Minified React error #418");
  });

  it("la pila se corta y pierde los parámetros de los archivos", () => {
    const stack = Array.from({ length: 40 }, (_, i) => `    at f${i} (https://hoopmeter.com/_next/a.js?dpl=abc:1:${i})`).join("\n");
    const trimmed = trimStack(stack)!;
    assert.equal(trimmed.split("\n").length, 20);
    assert.ok(!trimmed.includes("dpl="));
  });

  it("describe errores de cualquier tipo", () => {
    assert.equal(describeError(new TypeError("x is undefined")).message, "TypeError: x is undefined");
    assert.equal(describeError("texto").message, "texto");
    assert.equal(describeError({ code: 1 }).message, '{"code":1}');
  });
});

describe("error-report · ruido", () => {
  it("descarta extensiones, redes caídas y avisos del navegador", () => {
    assert.ok(isNoise("Script error.", null));
    assert.ok(isNoise("ResizeObserver loop completed with undelivered notifications.", null));
    assert.ok(isNoise("TypeError: Failed to fetch", null));
    assert.ok(isNoise("Load failed", null));
    assert.ok(isNoise("AbortError: signal is aborted without reason", null));
    assert.ok(isNoise("TypeError: x", "at chrome-extension://abc/content.js:1:1"));
    assert.ok(!isNoise("TypeError: Cannot read properties of undefined (reading 'home')", null));
  });
});

describe("error-report · navegador a grandes rasgos", () => {
  it("solo navegador y sistema", () => {
    const s24 =
      "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36";
    assert.equal(coarseAgent(s24), "Chrome · Android");
    assert.equal(coarseAgent(s24, true), "App Android");
    assert.equal(
      coarseAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"),
      "Safari · iOS"
    );
    assert.equal(coarseAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142.0 Safari/537.36 Edg/142.0"), "Edge · Windows");
    assert.equal(coarseAgent(null), null);
  });
});

describe("error-report · cuerpo de /api/errors", () => {
  it("limpia lo que llega del navegador", () => {
    const report = parseErrorBody({
      message: "TypeError: boom 0022600245",
      stack: "TypeError: boom\n    at x (https://hoopmeter.com/_next/a.js?v=1:1:1)",
      path: "https://hoopmeter.com/games/0022600245?p=4&s=120",
      digest: "12345",
      agent: "Chrome · Android",
    });
    assert.deepEqual(report, {
      message: "TypeError: boom N",
      stack: "TypeError: boom\n    at x (https://hoopmeter.com/_next/a.js:1:1)",
      path: "/games/:id",
      digest: "12345",
      agent: "Chrome · Android",
    });
  });

  it("rechaza lo que no es un aviso y no deja colar texto libre en el navegador", () => {
    assert.equal(parseErrorBody(null), null);
    assert.equal(parseErrorBody({ message: "" }), null);
    assert.equal(parseErrorBody({ message: 42 }), null);
    assert.equal(parseErrorBody({ message: "Script error." }), null);
    assert.equal(buildReport({ message: "x", agent: "Mozilla/5.0 (Linux; Android 14; SM-S921B)" })?.agent, null);
    assert.equal(buildReport({ message: "x", digest: "<script>" })?.digest, null);
  });

  it("nunca envía la URL con parámetros", () => {
    const report = buildReport({ message: "x", path: "/compare?a=2544&b=201939" });
    assert.equal(report?.path, "/compare");
  });
});
