// Tests del comparador. Se lanzan con `npm test` junto con los del motor de traspasos.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRadarScale, CAREER, defaultSeason, isRepresentative, radarOf, radarRows, scaleKey, score, statRows, trophyRows, type StatLine } from "./compare.ts";

function line(extra: Partial<StatLine> = {}): StatLine {
  return { games: 70, minutes: 32, pts: 20, reb: 6, ast: 5, stl: 1, blk: 0.5, tov: 2, fg3m: 2, fg3a: 5, fgPct: 0.47, fg3Pct: 0.36, ftPct: 0.8, tsPct: 0.58, ...extra };
}

/** Población con una progresión uniforme de 0 a 99 en todas las métricas. */
const pool = Array.from({ length: 100 }, (_, i) => line({ pts: i, reb: i, ast: i, stl: i, blk: i, fg3m: i, fg3a: 5, fg3Pct: i, tsPct: i }));
const scale = buildRadarScale(pool);
const LABELS = { scoring: "Anotación", shooting: "Tiro", playmaking: "Creación", defense: "Defensa", rebounding: "Rebote", efficiency: "Eficiencia" };

describe("radar histórico", () => {
  it("sitúa cada valor en su percentil", () => {
    const radar = radarOf(line({ pts: 50, reb: 10, ast: 90, tsPct: 25 }), scale);
    assert.equal(radar.scoring, 50);
    assert.equal(radar.rebounding, 10);
    assert.equal(radar.playmaking, 90);
    assert.equal(radar.efficiency, 25);
  });

  it("no se sale de 0-99 con valores fuera de la población", () => {
    const radar = radarOf(line({ pts: 500, reb: -5 }), scale);
    assert.equal(radar.scoring, 99);
    assert.equal(radar.rebounding, 0);
  });

  it("combina varias métricas de una categoría", () => {
    const balanced = radarOf(line({ stl: 80, blk: 80 }), scale).defense!;
    const onlySteals = radarOf(line({ stl: 80, blk: 0 }), scale).defense!;
    assert.ok(balanced > onlySteals);
  });

  it("deja en null lo que esa época no registraba", () => {
    const wilt = radarOf(line({ stl: null, blk: null, fg3m: null, fg3a: null, fg3Pct: null, pts: 90 }), scale);
    assert.equal(wilt.defense, null);
    assert.equal(wilt.shooting, null);
    assert.equal(wilt.scoring, 90);
  });

  it("no premia el porcentaje de quien casi no tira triples", () => {
    const center = radarOf(line({ fg3m: 40, fg3a: 0.5, fg3Pct: 99 }), scale).shooting!;
    const shooter = radarOf(line({ fg3m: 40, fg3a: 6, fg3Pct: 99 }), scale).shooting!;
    assert.ok(shooter > center);
  });

  it("la escala ignora los null de otras épocas", () => {
    const mixed = buildRadarScale([...pool, line({ stl: null, blk: null })]);
    assert.equal(radarOf(line({ stl: 50, blk: 50 }), mixed).defense !== null, true);
  });

  it("separa carreras de temporadas y fase regular de playoffs", () => {
    assert.equal(scaleKey(CAREER, "Regular Season"), "Regular Season:career");
    assert.equal(scaleKey("1995-96", "Playoffs"), "Playoffs:season");
  });
});

describe("población de la escala", () => {
  it("exige partidos y minutos en una temporada", () => {
    assert.equal(isRepresentative(line({ games: 19 }), "2025-26", "Regular Season"), false);
    assert.equal(isRepresentative(line({ games: 20 }), "2025-26", "Regular Season"), true);
    assert.equal(isRepresentative(line({ minutes: 10 }), "2025-26", "Regular Season"), false);
  });

  it("acepta temporadas sin minutos registrados, como las de Mikan", () => {
    assert.equal(isRepresentative(line({ minutes: null }), "1948-49", "Regular Season"), true);
  });

  it("los playoffs y las carreras tienen su propio mínimo", () => {
    assert.equal(isRepresentative(line({ games: 4 }), "2025-26", "Playoffs"), true);
    assert.equal(isRepresentative(line({ games: 99 }), CAREER, "Regular Season"), false);
    assert.equal(isRepresentative(line({ games: 20 }), CAREER, "Playoffs"), true);
  });
});

describe("filas del duelo", () => {
  it("gana quien tiene más", () => {
    const row = statRows(line({ pts: 30.1 }), line({ pts: 27.1 })).find((r) => r.key === "pts")!;
    assert.equal(row.winner, "a");
    assert.equal(row.aText, "30.1");
  });

  it("en pérdidas gana quien tiene menos", () => {
    const row = statRows(line({ tov: 2.7 }), line({ tov: 3.5 })).find((r) => r.key === "tov")!;
    assert.equal(row.winner, "a");
  });

  it("un empate no da punto a nadie", () => {
    assert.equal(statRows(line(), line()).find((r) => r.key === "pts")!.winner, null);
  });

  it("sin dato en un lado no hay ganador y se muestra un guion", () => {
    const row = statRows(line({ stl: null }), line({ stl: 2 })).find((r) => r.key === "stl")!;
    assert.equal(row.winner, null);
    assert.equal(row.aText, "–");
  });

  it("el % de triples solo puntúa si los dos tiran al menos uno por partido", () => {
    const rows = (a: number, b: number) => statRows(line({ fg3a: a, fg3Pct: 0.5 }), line({ fg3a: b, fg3Pct: 0.3 })).find((r) => r.key === "fg3Pct")!;
    assert.equal(rows(0.4, 6).winner, null);
    assert.equal(rows(3, 6).winner, "a");
  });

  it("minutos y partidos se muestran pero no puntúan", () => {
    const rows = statRows(line({ minutes: 40, games: 80 }), line({ minutes: 20, games: 30 }));
    assert.equal(rows.find((r) => r.key === "minutes")!.winner, null);
    assert.equal(rows.find((r) => r.key === "games")!.winner, null);
  });

  it("los porcentajes se muestran sobre 100", () => {
    assert.equal(statRows(line({ tsPct: 0.5692 }), line()).find((r) => r.key === "tsPct")!.aText, "56.9");
  });

  it("el marcador cuenta las filas ganadas", () => {
    const rows = radarRows(
      { scoring: 90, shooting: 40, playmaking: 70, defense: 80, rebounding: 50, efficiency: null },
      { scoring: 80, shooting: 60, playmaking: 70, defense: 75, rebounding: 60, efficiency: 90 },
      LABELS
    );
    assert.deepEqual(score(rows), { a: 2, b: 2 });
  });

  it("el palmarés omite lo que ninguno ha ganado y compara el resto", () => {
    const rows = trophyRows({ champion: 6, mvp: 5, allstar: 14 }, { champion: 4, mvp: 4, allstar: 22 });
    assert.deepEqual(rows.map((r) => r.key), ["champion", "mvp", "allstar"]);
    assert.deepEqual(score(rows), { a: 2, b: 1 });
  });

  it("la barra refleja el reparto y queda al 50% sin datos", () => {
    const rows = statRows(line({ pts: 30 }), line({ pts: 10, stl: null }));
    assert.equal(rows.find((r) => r.key === "pts")!.share, 0.75);
    assert.equal(statRows(line({ blk: 0 }), line({ blk: 0 })).find((r) => r.key === "blk")!.share, 0.5);
  });
});

describe("temporada por defecto", () => {
  const seasons = [
    { id: CAREER, line: line({ games: 500 }) },
    { id: "2026-27", line: line({ games: 7 }) },
    { id: "2025-26", line: line({ games: 70 }) },
  ];

  it("salta una temporada con pocos partidos", () => {
    assert.equal(defaultSeason(seasons), "2025-26");
  });

  it("si ninguna llega al mínimo, usa la última", () => {
    assert.equal(defaultSeason([seasons[0], { id: "2026-27", line: line({ games: 3 }) }]), "2026-27");
  });

  it("sin temporadas, la carrera", () => {
    assert.equal(defaultSeason([seasons[0]]), CAREER);
  });
});
