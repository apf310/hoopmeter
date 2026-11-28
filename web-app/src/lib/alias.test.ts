// Tests del alias de las cuentas (Tarea 8.5). Se lanzan con `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ALIAS_MAX, aliasKey, checkAlias, isOffensive, isReserved, normalizeForFilter, suggestAlias } from "./alias.ts";

const problem = (alias: string) => {
  const check = checkAlias(alias);
  return check.ok ? null : check.problem;
};

describe("alias · formato", () => {
  it("letras, ñ, números y _ entre 3 y 16", () => {
    assert.equal(problem("Triple_23"), null);
    assert.equal(problem("Begoña"), null);
    assert.equal(problem("abc"), null);
    assert.equal(problem("A".repeat(ALIAS_MAX)), null);
    assert.equal(problem("ab"), "short");
    assert.equal(problem("A".repeat(ALIAS_MAX + 1)), "long");
  });

  it("sin espacios, tildes ni símbolos", () => {
    assert.equal(problem("Pau Gasol"), "chars");
    assert.equal(problem("Dončić"), "chars");
    assert.equal(problem("José"), "chars");
    assert.equal(problem("a@b.com"), "chars");
    assert.equal(problem("hola!"), "chars");
  });

  it("alguna letra y _ solo en medio y de uno en uno", () => {
    assert.equal(problem("12345"), "letters");
    assert.equal(problem("___"), "letters");
    assert.equal(problem("_Triple"), "underscore");
    assert.equal(problem("Triple_"), "underscore");
    assert.equal(problem("Tri__ple"), "underscore");
  });

  it("quita los espacios de alrededor y da la clave sin mayúsculas ni ñ", () => {
    const check = checkAlias("  Peña_23 ");
    assert.ok(check.ok);
    assert.equal(check.alias, "Peña_23");
    assert.equal(check.key, "pena_23");
    assert.equal(aliasKey("PEÑA"), aliasKey("pena"));
  });
});

describe("alias · reservados", () => {
  it("nadie se hace pasar por la app", () => {
    for (const alias of ["Hoopmeter", "hoopmeter_es", "Admin", "elAdmin2", "Soporte", "NBA", "Moderador", "ALPELabs"]) {
      assert.ok(isReserved(alias), alias);
      assert.equal(problem(alias), "reserved", alias);
    }
  });

  it("pero 'nba' dentro de otro alias vale", () => {
    assert.equal(problem("NBAfan23"), null);
    assert.equal(problem("LaNBAmola"), null);
  });
});

describe("alias · palabras ofensivas", () => {
  it("normaliza mayúsculas, tildes, números y separadores", () => {
    assert.equal(normalizeForFilter("P_u_T4"), "puta");
    assert.equal(normalizeForFilter("Imbécil"), "imbecil");
    assert.equal(normalizeForFilter("h1j0"), "hijo");
  });

  it("caza los insultos con los trucos de siempre", () => {
    for (const alias of [
      "puta", "PUTO", "hijoputa", "hijodeputa", "put4", "p_u_t_a", "puuuuta", "p0lla", "po11a", "Gilipollas", "g1l1p0ll4s",
      "mierda23", "Cabron", "kabron", "maricon", "zorra", "Fuck", "fuuuck", "shit", "bitch", "nazi", "Hitler88", "n1gga",
      "faggot", "asshole", "c0ñazo", "Imbécil", "pendejo", "verga", "SiegHeil", "kkk",
    ]) {
      assert.ok(isOffensive(alias), alias);
    }
  });

  it("no se pasa de listo con palabras y nombres normales", () => {
    for (const alias of [
      "computadora", "Disputa", "reputacion", "imputado", "diputado", "Ampolla", "Polaco", "Polar", "Pola", "Repollo",
      "Maricarmen", "Vergara", "Penelope", "Zorrilla", "Mongolia", "Sexto_Hombre", "therapist", "Nigeria", "Nigel",
      "Fagot", "Calculo", "Vehiculo", "Canasta", "Tapon", "Triple", "Mate", "Gasol", "Doncic", "LeBron", "Shaq",
      "Kuntz", "Hancock", "Dickens", "Bob", "Cumbia", "Documento", "Ignazio", "Nazionale",
    ]) {
      assert.ok(!isOffensive(alias), alias);
      assert.equal(problem(alias), null, alias);
    }
  });

  it("una palabra permitida no tapa un insulto pegado a ella", () => {
    assert.ok(isOffensive("computaputa"));
    assert.ok(isOffensive("disputamierda"));
  });

  it("el insulto da el aviso de siempre, sin repetir la palabra", () => {
    const check = checkAlias("Hijoputa23");
    assert.ok(!check.ok);
    assert.equal(check.problem, "offensive");
    assert.doesNotMatch(check.message, /puta/i);
  });
});

describe("alias · sugerencias", () => {
  it("siempre válidas", () => {
    let seed = 1;
    const random = () => {
      seed = (seed * 16_807) % 2_147_483_647;
      return (seed - 1) / 2_147_483_646;
    };
    for (let i = 0; i < 500; i++) {
      const alias = suggestAlias(random);
      assert.equal(problem(alias), null, alias);
    }
  });
});
