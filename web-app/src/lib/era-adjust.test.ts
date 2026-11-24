// Tests del comparador ajustado por épocas (Tarea 7.3). Se lanzan con `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRadarScale, CAREER, radarOf, statRows, type StatLine } from "./compare.ts";
import {
  adjustLine,
  averagesFromTotals,
  careerLeague,
  eraFactor,
  leagueOf,
  pickReference,
  possessions,
  referenceSeasons,
  relativeLine,
  withRealValues,
  type LeagueAverages,
  type LeagueTable,
} from "./era-adjust.ts";
import { LEAGUE_AVERAGES } from "./league-averages.ts";
import { SEASON } from "./trade-rules.ts";

function line(extra: Partial<StatLine> = {}): StatLine {
  return { games: 80, minutes: 40, pts: 30, reb: 10, ast: 8, stl: 2, blk: 1, tov: 3, fg3m: 1, fg3a: 3, fgPct: 0.5, fg3Pct: 0.35, ftPct: 0.8, tsPct: 0.55, ...extra };
}

const league = (extra: Partial<LeagueAverages> = {}): LeagueAverages => ({ pts: 100, reb: 45, ast: 25, tsPct: 0.5, pace: 100, paceEstimated: false, ...extra });

const OLD = league({ pts: 120, reb: 60, ast: 20, tsPct: 0.48, pace: 125, paceEstimated: true });
const NOW = league({ pts: 114, reb: 44, ast: 26, tsPct: 0.58 });
const TABLE: LeagueTable = {
  "Regular Season": { "1948-49": league({ reb: null }), "1961-62": OLD, "1986-87": league(), "2025-26": NOW },
  Playoffs: { "1961-62": OLD, "2025-26": NOW },
};

const near = (actual: number | null, expected: number, margin = 0.051) => assert.ok(actual !== null && Math.abs(actual - expected) <= margin, `${actual} ≈ ${expected}`);

describe("ajuste de una temporada", () => {
  it("lleva las cuatro cifras a la media de la liga de referencia", () => {
    const adjusted = adjustLine(line({ pts: 50, reb: 25, ast: 2.4, tsPct: 0.536 }), OLD, NOW);
    near(adjusted.pts, (50 * 114) / 120);
    near(adjusted.reb, (25 * 44) / 60);
    near(adjusted.ast, (2.4 * 26) / 20);
    near(adjusted.tsPct, (0.536 * 0.58) / 0.48, 0.001);
  });

  it("no toca lo demás", () => {
    const real = line();
    const adjusted = adjustLine(real, OLD, NOW);
    for (const key of ["games", "minutes", "stl", "blk", "tov", "fg3m", "fgPct", "fg3Pct", "ftPct"] as const) assert.equal(adjusted[key], real[key]);
  });

  it("con su propia liga de referencia, las cifras no cambian", () => {
    assert.deepEqual(adjustLine(line(), OLD, OLD), line());
  });

  it("ida y vuelta da lo mismo", () => {
    const back = adjustLine(adjustLine(line(), OLD, NOW), NOW, OLD);
    near(back.pts, 30, 0.1);
    near(back.reb, 10, 0.1);
  });

  it("sin media de la liga, sin dato: nunca la cifra real disfrazada de ajustada", () => {
    assert.equal(adjustLine(line(), league({ reb: null }), NOW).reb, null);
    assert.equal(adjustLine(line(), null, NOW).pts, null);
    assert.equal(adjustLine(line({ reb: null }), OLD, NOW).reb, null);
    assert.equal(eraFactor("reb", league({ reb: null }), NOW), null);
  });

  it("redondea a lo que se enseña: dos cifras iguales no tienen ganador", () => {
    const rows = statRows(adjustLine(line({ pts: 30 }), NOW, NOW), adjustLine(line({ pts: 31.6 }), OLD, NOW));
    const pts = rows.find((row) => row.key === "pts")!;
    assert.equal(pts.aText, pts.bText);
    assert.equal(pts.winner, null);
  });

  it("enseña la cifra real solo en las filas ajustadas", () => {
    const real = statRows(line(), line());
    const rows = withRealValues(statRows(adjustLine(line(), OLD, NOW), adjustLine(line(), NOW, NOW)), real);
    assert.deepEqual(
      rows.filter((row) => row.aReal !== undefined).map((row) => row.key),
      ["pts", "reb", "ast", "tsPct"]
    );
    assert.equal(rows.find((row) => row.key === "pts")!.aReal, "30.0");
  });
});

describe("carrera", () => {
  const seasons = [
    { id: "1961-62", line: line({ games: 80, pts: 50, reb: 25, ast: 2, tsPct: 0.53 }) },
    { id: "1986-87", line: line({ games: 40, pts: 20, reb: 10, ast: 6, tsPct: 0.56 }) },
  ];

  it("ajustar el promedio da lo mismo que ajustar cada temporada y volver a promediar", () => {
    const career = careerLeague(seasons, "Regular Season", TABLE)!;
    for (const key of ["pts", "reb", "ast"] as const) {
      const average = seasons.reduce((sum, s) => sum + s.line.games! * s.line[key]!, 0) / 120;
      const bySeason = seasons.reduce((sum, s) => sum + s.line.games! * s.line[key]! * eraFactor(key, TABLE["Regular Season"][s.id], NOW)!, 0) / 120;
      near(average * eraFactor(key, career, NOW)!, bySeason, 1e-9);
    }
  });

  it("la fila de carrera no cuenta como temporada y el ritmo se pondera por partidos", () => {
    const career = careerLeague([{ id: CAREER, line: line({ games: 120 }) }, ...seasons], "Regular Season", TABLE)!;
    near(career.pace, (125 * 80 + 100 * 40) / 120, 1e-9);
    assert.equal(career.paceEstimated, true);
  });

  it("una sola temporada es su liga", () => {
    const career = careerLeague([seasons[0]], "Regular Season", TABLE)!;
    near(career.pts, 120, 1e-9);
    near(career.tsPct, 0.48, 1e-9);
  });

  it("las temporadas sin rebotes registrados no cuentan para los rebotes", () => {
    const career = careerLeague([{ id: "1948-49", line: line({ reb: null }) }, seasons[0]], "Regular Season", TABLE)!;
    near(career.reb, 60, 1e-9);
  });

  it("sin temporadas, sin liga", () => {
    assert.equal(careerLeague([], "Playoffs", TABLE), null);
  });
});

describe("radar ajustado", () => {
  it("los percentiles no dependen de la temporada de referencia", () => {
    const pool = Array.from({ length: 60 }, (_, i) => ({
      line: line({ pts: 5 + i * 0.5, reb: 2 + ((i * 7) % 60) / 5, ast: 1 + ((i * 11) % 60) / 8, tsPct: 0.45 + i / 400 }),
      league: i % 2 ? OLD : NOW,
    }));
    const toLeague = (l: StatLine, reference: LeagueAverages): StatLine => ({ ...l, pts: l.pts! * reference.pts!, reb: l.reb! * reference.reb!, ast: l.ast! * reference.ast!, tsPct: l.tsPct! * reference.tsPct! });
    const radars = [league({ pts: 1, reb: 1, ast: 1, tsPct: 1 }), OLD, NOW].map((reference) => {
      const lines = pool.map((p) => toLeague(relativeLine(p.line, p.league), reference));
      const scale = buildRadarScale(lines);
      return lines.map((l) => radarOf(l, scale));
    });
    assert.deepEqual(radars[1], radars[0]);
    assert.deepEqual(radars[2], radars[0]);
  });
});

describe("temporada de referencia", () => {
  it("de la más reciente a la más antigua y solo las que lo registran todo", () => {
    assert.deepEqual(referenceSeasons("Regular Season", TABLE), ["2025-26", "1986-87", "1961-62"]);
  });

  it("si la elegida no existe en esa fase, la más reciente", () => {
    assert.equal(pickReference("1986-87", "Regular Season", TABLE), "1986-87");
    assert.equal(pickReference("1986-87", "Playoffs", TABLE), "2025-26");
  });

  it("una temporada recién empezada se mide con la anterior", () => {
    assert.equal(leagueOf("2026-27", "Regular Season", TABLE), NOW);
    assert.equal(leagueOf("1940-41", "Regular Season", TABLE), null);
  });
});

describe("temporada en curso", () => {
  const player = { min: 2400, pts: 1120, fgm: 410, fga: 880, fta: 240, oreb: 110, reb: 440, ast: 260, tov: 138 };

  it("medias por 48 minutos de equipo con los totales de los jugadores", () => {
    const averages = averagesFromTotals(Array.from({ length: 12 }, () => player))!;
    near(averages.pts, 112);
    near(averages.reb, 44);
    near(averages.tsPct, 112 / (2 * (88 + 0.44 * 24)), 1e-9);
    assert.ok(averages.pace! > 95 && averages.pace! < 103, `${averages.pace}`);
  });

  it("con pocos partidos, todavía no hay media", () => {
    assert.equal(averagesFromTotals([player]), null);
  });

  it("menos rebotes de ataque son más posesiones", () => {
    const base = { fgm: 41, fga: 88, fta: 24, oreb: 11, reb: 44, tov: 14 };
    assert.ok(possessions({ ...base, oreb: 8 }) > possessions(base));
  });
});

describe("tabla de medias de la liga", () => {
  const PHASES = ["Regular Season", "Playoffs"] as const;

  it("tiene todas las temporadas cerradas, sin huecos", () => {
    const last = Number(SEASON.slice(0, 4)) - 1;
    const expected = Array.from({ length: last - 1946 + 1 }, (_, i) => `${1946 + i}-${String((1947 + i) % 100).padStart(2, "0")}`);
    for (const phase of PHASES) {
      const seasons = Object.keys(LEAGUE_AVERAGES[phase]).filter((id) => Number(id.slice(0, 4)) <= last);
      assert.deepEqual(seasons, expected, `${phase}: cada verano, python -m extractors.fetch_league_averages --season …`);
    }
  });

  it("los rebotes existen desde 1950-51 y lo demás, siempre", () => {
    for (const phase of PHASES) {
      for (const [id, row] of Object.entries(LEAGUE_AVERAGES[phase])) {
        assert.equal(row.reb !== null, id >= "1950-51", `${phase} ${id}`);
        for (const key of ["pts", "ast", "tsPct", "pace"] as const) assert.ok(row[key], `${phase} ${id} ${key}`);
        assert.equal(row.paceEstimated, id < "1977-78", `${phase} ${id}`);
      }
    }
  });

  it("cifras conocidas de cada época", () => {
    const regular = LEAGUE_AVERAGES["Regular Season"];
    near(regular["1961-62"].pts, 118.8, 0.8);
    near(regular["1961-62"].tsPct, 0.479, 0.003);
    near(regular["1961-62"].pace, 126, 1.5);
    near(regular["1986-87"].pace, 100.8, 0.6);
    near(regular["2003-04"].pts, 93.4, 0.8);
    near(regular["2003-04"].pace, 90.1, 0.6);
    near(regular["2025-26"].tsPct, 0.581, 0.002);
  });
});
