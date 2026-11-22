// Tests de los colores de equipo sobre el fondo oscuro (Tarea 6.20). Se lanzan con `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchupAccents, teamAccent, teamBackdrop } from "./team-colors.ts";

// Los de `backend-data/extractors/fetch_teams_players.py` (primario, secundario)
const TEAMS: Record<string, [string, string]> = {
  ATL: ["#E03A3E", "#C1D32F"], BOS: ["#007A33", "#BA9653"], BKN: ["#000000", "#FFFFFF"], CHA: ["#1D1160", "#00788C"],
  CHI: ["#CE1141", "#000000"], CLE: ["#860038", "#FDBB30"], DAL: ["#00538C", "#002B5E"], DEN: ["#0E2240", "#FEC524"],
  DET: ["#C8102E", "#1D42BA"], GSW: ["#1D428A", "#FFC72C"], HOU: ["#CE1141", "#000000"], IND: ["#002D62", "#FDBB30"],
  LAC: ["#C8102E", "#1D428A"], LAL: ["#552583", "#FDB927"], MEM: ["#5D76A9", "#12173F"], MIA: ["#98002E", "#F9A01B"],
  MIL: ["#00471B", "#EEE1C6"], MIN: ["#0C2340", "#236192"], NOP: ["#0C2340", "#C8102E"], NYK: ["#006BB6", "#F58426"],
  OKC: ["#007AC1", "#EF3B24"], ORL: ["#0077C0", "#C4CED4"], PHI: ["#006BB6", "#ED174C"], PHX: ["#1D1160", "#E56020"],
  POR: ["#E03A3E", "#000000"], SAC: ["#5A2D81", "#63727A"], SAS: ["#C4CED4", "#000000"], TOR: ["#CE1141", "#000000"],
  UTA: ["#002B5C", "#F9A01B"], WAS: ["#002B5C", "#E31837"],
};
const team = (abbr: string) => ({ primary_color: TEAMS[abbr][0], secondary_color: TEAMS[abbr][1] });

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** Saturación HSL (0-1): un azul grisáceo apagado queda por debajo de 0,3. */
function saturation(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  return max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
}

const BACKGROUND = "#020617"; // bg-slate-950

describe("teamAccent", () => {
  it("todos los acentos se distinguen del fondo (3:1, contraste mínimo de un gráfico)", () => {
    for (const abbr of Object.keys(TEAMS)) {
      const accent = teamAccent(team(abbr));
      assert.ok(contrast(accent, BACKGROUND) >= 3, `${abbr} ${accent}: ${contrast(accent, BACKGROUND).toFixed(1)}:1`);
    }
  });

  it("Memphis ya no parece una barra vacía: más luz y más color, mismo tono azul", () => {
    const accent = teamAccent(team("MEM"));
    assert.notEqual(accent.toLowerCase(), "#5d76a9");
    assert.ok(saturation(accent) > saturation("#5D76A9"), accent);
    assert.ok(luminance(accent) > luminance("#5D76A9"), accent);
    const [r, , b] = [1, 3, 5].map((i) => parseInt(accent.slice(i, i + 2), 16));
    assert.ok(b > r, `sigue siendo azul: ${accent}`);
  });

  it("los colores que ya se ven bien no cambian", () => {
    assert.equal(teamAccent(team("LAL")), "#FDB927");
    assert.equal(teamAccent(team("GSW")), "#FFC72C");
    assert.equal(teamAccent(team("BKN")), "#FFFFFF");
    assert.equal(teamAccent(team("PHX")), "#E56020");
  });

  it("los grises siguen siendo grises (la plata de los Spurs no se tiñe)", () => {
    assert.ok(saturation(teamAccent(team("SAS"))) < 0.2);
    assert.ok(saturation(teamAccent(team("SAC"))) < 0.2);
  });

  it("devuelve siempre #rrggbb, también con colores raros o vacíos", () => {
    for (const colors of [team("DAL"), team("MIA"), { primary_color: null, secondary_color: null }, { primary_color: "rojo", secondary_color: "#000000" }]) {
      assert.match(teamAccent(colors), /^#[0-9a-f]{6}$/i);
    }
  });
});

describe("matchupAccents", () => {
  it("GSW contra MEM: dos colores vivos y distintos", () => {
    const { away, home } = matchupAccents(team("GSW"), team("MEM"));
    assert.equal(away, "#FFC72C");
    assert.equal(home, teamAccent(team("MEM")));
  });

  it("dos rojos: el visitante usa su otro color", () => {
    const { away, home } = matchupAccents(team("TOR"), team("CHI"));
    assert.notEqual(away, home);
  });
});

describe("teamBackdrop", () => {
  it("el blanco se lee sobre el fondo de cualquier equipo (4,5:1)", () => {
    for (const abbr of Object.keys(TEAMS)) {
      const backdrop = teamBackdrop(TEAMS[abbr][0]);
      assert.ok(contrast("#FFFFFF", backdrop) >= 4.5, `${abbr} ${backdrop}`);
    }
  });

  it("la plata de los Spurs se oscurece y sigue siendo gris; los oscuros no cambian", () => {
    const spurs = teamBackdrop("#C4CED4");
    assert.notEqual(spurs, "#C4CED4");
    assert.ok(saturation(spurs) < 0.2, spurs);
    assert.equal(teamBackdrop("#552583"), "#552583");
    assert.equal(teamBackdrop("#000000"), "#000000");
  });

  it("sin color, el gris de la app", () => {
    assert.equal(teamBackdrop(null), "#334155");
    assert.equal(teamBackdrop(undefined, "#1e293b"), "#1e293b");
  });
});
