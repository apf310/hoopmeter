// Tests del explorador de jugadores (Tarea 6.22). Se lanzan con `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_FILTERS,
  activeFilterCount,
  autoMinGames,
  countryOptions,
  explorerSearch,
  filterLabels,
  filterRows,
  formatStat,
  leaders,
  minMade,
  minimumLabel,
  nextExplorerSort,
  parseExplorerState,
  parseRange,
  positionGroups,
  seasonMaxGames,
  sortRows,
  statTitle,
  statValue,
  type ExplorerFilters,
  type ExplorerRow,
  type ExplorerState,
  type ExplorerTotals,
} from "./player-explorer.ts";

const EAST = 1610612738;
const WEST = 1610612747;
const OTHER_EAST = 1610612752;

function totals(over: Partial<ExplorerTotals> = {}): ExplorerTotals {
  return {
    gp: 20, gs: 20, min: 600, pts: 400, reb: 100, oreb: 20, dreb: 80, ast: 100, stl: 20, blk: 10, tov: 40, pf: 40,
    fgm: 150, fga: 300, fg3m: 40, fg3a: 100, ftm: 60, fta: 75,
    ...over,
  };
}

function row(id: number, over: Partial<ExplorerRow> = {}, t: Partial<ExplorerTotals> = {}): ExplorerRow {
  return {
    id,
    name: `Jugador ${id}`,
    position: "G",
    teamId: EAST,
    teamIds: [EAST],
    country: "USA",
    age: 25,
    rookie: false,
    salary: 10_000_000,
    salaryStatus: "confirmed",
    overall: 50,
    usgPct: 0.2,
    astPct: 0.15,
    rebPct: 0.1,
    totals: totals(t),
    ...over,
  };
}

const conferenceOf = (teamId: number) => (teamId === WEST ? "West" : "East");
const filter = (rows: ExplorerRow[], over: Partial<ExplorerFilters>, maxGames = 20) =>
  filterRows(rows, { ...DEFAULT_FILTERS, minGames: 0, minMinutes: 0, ...over }, { maxGames, conferenceOf }).map((r) => r.id);

describe("valores por modo", () => {
  const r = row(1);
  it("por partido, totales y por 36 minutos", () => {
    assert.equal(statValue(r, "pts", "game"), 20);
    assert.equal(statValue(r, "pts", "total"), 400);
    assert.equal(statValue(r, "pts", "per36"), 24); // 400 · 36 / 600
  });
  it("los minutos son por partido también en Por 36, y los partidos nunca se dividen", () => {
    assert.equal(statValue(r, "min", "per36"), 30);
    assert.equal(statValue(r, "min", "total"), 600);
    assert.equal(statValue(r, "gp", "per36"), 20);
  });
  it("porcentajes y avanzadas salen de los totales", () => {
    assert.equal(statValue(r, "fg_pct", "game"), 0.5);
    assert.equal(statValue(r, "efg_pct", "total"), (150 + 20) / 300);
    assert.equal(statValue(r, "ts_pct", "game"), 400 / (2 * (300 + 0.44 * 75)));
    assert.equal(statValue(r, "ast_tov", "game"), 2.5);
    assert.equal(statValue(r, "usg_pct", "total"), 0.2);
  });
  it("sin intentos o sin pérdidas no hay dato", () => {
    const none = row(2, {}, { fg3m: 0, fg3a: 0, tov: 0 });
    assert.equal(statValue(none, "fg3_pct", "game"), null);
    assert.equal(statValue(none, "ast_tov", "game"), null);
  });
  it("títulos según el modo", () => {
    assert.equal(statTitle("pts", "game"), "Puntos por partido");
    assert.equal(statTitle("reb", "total"), "Rebotes en total");
    assert.equal(statTitle("min", "per36"), "Minutos por partido");
    assert.equal(statTitle("fg3_pct", "per36"), "Porcentaje de triples");
  });
});

describe("cifras", () => {
  it("redondea a la mitad hacia arriba como la NBA, también donde la coma flotante falla", () => {
    assert.equal(formatStat(81 / 4, "pts", "game"), "20.3");
    assert.equal(formatStat(3 / 20, "stl", "game"), "0.2"); // 0,15 es 0,1499… en coma flotante
    assert.equal(formatStat(1203.4, "pts", "total"), "1203");
    assert.equal(formatStat(0.4875, "fg_pct", "game"), "48.8");
    assert.equal(formatStat(null, "pts", "game"), "–");
    assert.equal(formatStat(35_200_000, "salary", "game"), "35,2");
  });
});

describe("orden", () => {
  it("un 1 de 1 en triples no supera a quien llega al mínimo de la NBA", () => {
    const curry = row(1, {}, { fg3m: 90, fg3a: 210 });
    const lucky = row(2, {}, { fg3m: 1, fg3a: 1 });
    // A los 20 partidos, la NBA pide 82 · 20 / 82 = 20 triples anotados
    assert.equal(minMade("fg3", 20), 20);
    assert.deepEqual(sortRows([lucky, curry], { key: "fg3_pct", dir: "desc" }, "game", 20).map((r) => r.id), [1, 2]);
    // En orden ascendente siguen detrás: no "gana" el peor por no tener muestra
    assert.deepEqual(sortRows([lucky, curry], { key: "fg3_pct", dir: "asc" }, "game", 20).map((r) => r.id), [1, 2]);
    assert.deepEqual(leaders([lucky, curry], "fg3_pct", "game", 20).map((r) => r.id), [1]);
  });
  it("con la temporada acabada, los mínimos son los de la NBA", () => {
    assert.deepEqual([minMade("fg", 82), minMade("fg3", 82), minMade("ft", 82)], [300, 82, 125]);
    assert.equal(minMade("fg", 84), 300);
  });
  it("sin dato al final en los dos sentidos y empates por minutos", () => {
    const a = row(1, { usgPct: 0.3 });
    const b = row(2, { usgPct: null });
    const c = row(3, { usgPct: 0.3 }, { min: 700 });
    assert.deepEqual(sortRows([b, a, c], { key: "usg_pct", dir: "desc" }, "game", 20).map((r) => r.id), [3, 1, 2]);
    assert.deepEqual(sortRows([b, a, c], { key: "usg_pct", dir: "asc" }, "game", 20).map((r) => r.id), [3, 1, 2]);
  });
  it("el modo cambia el orden: por 36 sube al que rinde en pocos minutos", () => {
    const starter = row(1, {}, { pts: 500, min: 700 });
    const bench = row(2, {}, { pts: 300, min: 300 });
    assert.deepEqual(sortRows([bench, starter], { key: "pts", dir: "desc" }, "game", 20).map((r) => r.id), [1, 2]);
    assert.deepEqual(sortRows([bench, starter], { key: "pts", dir: "desc" }, "per36", 20).map((r) => r.id), [2, 1]);
  });
  it("misma columna invierte; otra empieza de mayor a menor", () => {
    assert.deepEqual(nextExplorerSort({ key: "pts", dir: "desc" }, "pts"), { key: "pts", dir: "asc" });
    assert.deepEqual(nextExplorerSort({ key: "pts", dir: "asc" }, "reb"), { key: "reb", dir: "desc" });
  });
  it("los líderes necesitan algo que contar", () => {
    assert.deepEqual(leaders([row(1, {}, { blk: 0 })], "blk", "game", 20), []);
  });
});

describe("filtros", () => {
  it("un G-F es exterior y alero; las posiciones largas también cuentan", () => {
    assert.deepEqual([...positionGroups("G-F")], ["G", "F"]);
    assert.deepEqual([...positionGroups("Forward-Center")], ["F", "C"]);
    assert.deepEqual([...positionGroups(null)], []);
    const rows = [row(1, { position: "G-F" }), row(2, { position: "C" })];
    assert.deepEqual(filter(rows, { position: "F" }), [1]);
  });
  it("equipo: cuenta todos los de la temporada (traspasos); conferencia: la del equipo que se enseña", () => {
    const traded = row(1, { teamId: WEST, teamIds: [EAST, WEST] });
    const rows = [traded, row(2, { teamId: OTHER_EAST, teamIds: [OTHER_EAST] }), row(3, { teamId: null, teamIds: [] })];
    assert.deepEqual(filter(rows, { team: EAST }), [1]);
    assert.deepEqual(filter(rows, { conference: "East" }), [2]);
    assert.deepEqual(filter(rows, { conference: "West" }), [1]);
  });
  it("país en español e internacionales", () => {
    const rows = [row(1, { country: "Spain" }), row(2, { country: "USA" }), row(3, { country: "France" }), row(4, { country: null })];
    assert.deepEqual(filter(rows, { country: "espana" }), [1]);
    assert.deepEqual(filter(rows, { country: "internacional" }), [1, 3]);
    assert.deepEqual(filter(rows, { country: "ee-uu" }), [2]);
  });
  it("Turquía sale una vez aunque la NBA la escriba de dos maneras", () => {
    const options = countryOptions([row(1, { country: "Turkey" }), row(2, { country: "Türkiye" }), row(3, { country: "USA" })]);
    assert.deepEqual(options[0], { slug: "turquia", label: "Turquía", count: 2 });
  });
  it("edad con extremos incluidos; salario con el máximo excluido y nunca con contratos sin cifra", () => {
    const rows = [row(1, { age: 23 }), row(2, { age: 24, salary: 30_000_000 }), row(3, { age: null, salary: null })];
    assert.deepEqual(filter(rows, { age: { min: null, max: 23 } }), [1]);
    assert.deepEqual(filter(rows, { age: { min: 24, max: 27 } }), [2]);
    assert.deepEqual(filter(rows, { salary: { min: 15, max: 30 } }), []);
    assert.deepEqual(filter(rows, { salary: { min: 30, max: null } }), [2]);
    assert.deepEqual(filter(rows, { salary: { min: null, max: 15 } }), [1]);
  });
  it("rookies", () => {
    assert.deepEqual(filter([row(1, { rookie: true }), row(2)], { rookies: true }), [1]);
  });
  it("mínimo automático de partidos = 40 % del que más ha jugado (la escala de la media)", () => {
    assert.equal(autoMinGames(17), 7);
    assert.equal(autoMinGames(20), 8);
    assert.equal(autoMinGames(1), 1);
    const rows = [row(1, {}, { gp: 8 }), row(2, {}, { gp: 7 }), row(3, {}, { gp: 20 })];
    assert.equal(seasonMaxGames(rows), 20);
    assert.deepEqual(filterRows(rows, DEFAULT_FILTERS, { maxGames: 20, conferenceOf }).map((r) => r.id), [1, 3]);
    assert.deepEqual(filter(rows, { minGames: 0 }), [1, 2, 3]);
  });
  it("mínimo de minutos por partido con la cifra que se ve (14,96 se lee 15,0)", () => {
    const rows = [row(1, {}, { gp: 25, min: 374 }), row(2, {}, { gp: 20, min: 280 })];
    assert.deepEqual(filter(rows, { minMinutes: 15 }), [1]);
  });
  it("los filtros se combinan", () => {
    const rows = [
      row(1, { position: "C", country: "Spain", rookie: true }),
      row(2, { position: "C", country: "Spain" }),
      row(3, { position: "G", country: "Spain", rookie: true }),
    ];
    assert.deepEqual(filter(rows, { position: "C", country: "espana", rookies: true }), [1]);
  });
});

describe("estado en la URL", () => {
  const ctx = { seasons: ["2026-27", "2025-26", "2024-25"], teamIds: new Set([EAST, WEST]) };

  it("todo por defecto no añade nada a la URL", () => {
    const state = parseExplorerState({}, ctx);
    assert.equal(state.season, "2026-27");
    assert.equal(explorerSearch(state, "2026-27"), "");
  });

  it("ida y vuelta con todos los filtros", () => {
    const state: ExplorerState = {
      season: "2025-26",
      mode: "per36",
      view: "advanced",
      sort: { key: "usg_pct", dir: "asc" },
      filters: {
        position: "C",
        team: WEST,
        conference: "West",
        country: "espana",
        age: { min: null, max: 23 },
        salary: { min: 30, max: null },
        rookies: true,
        minGames: 0,
        minMinutes: 20,
      },
    };
    const search = explorerSearch(state, "2026-27");
    assert.equal(
      search,
      "?temporada=2025-26&modo=por36&vista=avanzadas&orden=usg_pct&sentido=asc&posicion=pivot&equipo=1610612747&conferencia=oeste&pais=espana&edad=-23&salario=30-&rookies=1&pj=0&min=20"
    );
    assert.deepEqual(parseExplorerState(new URLSearchParams(search), ctx), state);
  });

  it("lo que no se entiende se ignora sin romper el enlace", () => {
    const state = parseExplorerState(
      { temporada: "1999-00", modo: "x", orden: "dinero", equipo: "123", edad: "40-20", salario: "abc", pj: "500", min: "-3", pais: "<script>" },
      ctx
    );
    assert.equal(state.season, "2026-27");
    assert.equal(state.mode, "game");
    assert.equal(state.sort.key, "pts");
    assert.deepEqual(state.filters, DEFAULT_FILTERS);
  });

  it("rangos: hasta, desde y entre", () => {
    assert.deepEqual(parseRange("-23", 60), { min: null, max: 23 });
    assert.deepEqual(parseRange("32-", 60), { min: 32, max: null });
    assert.deepEqual(parseRange("24-27", 60), { min: 24, max: 27 });
    assert.equal(parseRange("-", 60), null);
    assert.equal(parseRange("70-", 60), null);
  });
});

describe("textos", () => {
  const names = { teamName: (id: number) => (id === WEST ? "Los Angeles Lakers" : undefined), countryName: (slug: string) => (slug === "espana" ? "España" : undefined) };

  it("resumen de los filtros activos", () => {
    const f: ExplorerFilters = { ...DEFAULT_FILTERS, position: "C", team: WEST, country: "espana", rookies: true, salary: { min: 30, max: null } };
    assert.deepEqual(filterLabels(f, names), ["Pívots", "Los Angeles Lakers", "España", "Rookies", "Salario: 30 M$ o más"]);
    assert.deepEqual(filterLabels({ ...DEFAULT_FILTERS, country: "bosnia-y-herzegovina" }, names), ["Bosnia y Herzegovina"]);
    assert.equal(activeFilterCount(f), 5);
    assert.equal(activeFilterCount(DEFAULT_FILTERS), 0);
  });

  it("mínimos", () => {
    assert.equal(minimumLabel(DEFAULT_FILTERS, 17), "Mín. 7 partidos y 15 min por partido");
    assert.equal(minimumLabel({ ...DEFAULT_FILTERS, minGames: 0, minMinutes: 0 }, 17), "Sin mínimo de partidos ni de minutos");
  });
});
