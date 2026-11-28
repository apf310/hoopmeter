// Tests de Adivina el jugador (Tarea 8.3). Se lanzan con `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ageOn,
  buildPuzzle,
  buildSuspects,
  clueText,
  compareSuspects,
  findSuspects,
  guessRun,
  isAdivinaRun,
  isDayPuzzle,
  MAX_GUESSES,
  newRun,
  parseHeight,
  POINTS_BY_GUESS,
  pointsFor,
  positionKey,
  positionLabel,
  publicPuzzle,
  RADAR_KEYS,
  seededRng,
  seedOf,
  STAR_MEDIA,
  STAR_SALARY,
  TARGET_MIN_MINUTES,
  TARGET_POOL,
  targetCandidates,
  viewRun,
  type DayPuzzle,
  type Suspect,
  type SuspectRow,
  type TeamInfo,
} from "./adivina.ts";
import { CHALLENGES, shareText } from "./games.ts";

const DAY = "2026-11-27";
const SEASON = "2026-27";

const TEAMS = new Map<number, TeamInfo>([
  [1, { abbr: "DEN", conf: "West" }],
  [2, { abbr: "BOS", conf: "East" }],
  [3, { abbr: "LAL", conf: "West" }],
]);

function row(id: number, overrides: Partial<SuspectRow> & { overall?: number; mpg?: number; gp?: number; qualified?: boolean } = {}): SuspectRow {
  const { overall = 85, mpg = 30, gp = 15, qualified = true, ...rest } = overrides;
  return {
    id,
    name: `Jugador ${id}`,
    position: "G",
    height: "1.96 m",
    birthDate: "1998-03-01",
    teamId: 1,
    salary: null,
    radar: {
      season: SEASON,
      overall,
      qualified,
      games_played: gp,
      minutes: mpg * gp,
      scoring: 80,
      shooting: 70,
      playmaking: 60,
      defense: 50,
      rebounding: 45,
      efficiency: 65,
    },
    ...rest,
  };
}

const suspect = (id: number, s: Partial<Suspect> = {}): Suspect => ({
  id,
  name: `Jugador ${id}`,
  teamId: 1,
  team: "DEN",
  conf: "West",
  pos: "G",
  age: 27,
  cm: 196,
  media: 70,
  ...s,
});

function puzzleOf(target: Suspect, others: Suspect[]): DayPuzzle {
  return {
    v: 1,
    day: DAY,
    season: SEASON,
    target: target.id,
    radar: { scoring: 90, shooting: 80, playmaking: 99, defense: 60, rebounding: 85, efficiency: 95 },
    suspects: [target, ...others],
  };
}

describe("datos de cada jugador", () => {
  it("altura en centímetros, en metros o en pies y pulgadas", () => {
    assert.equal(parseHeight("2.06 m"), 206);
    assert.equal(parseHeight("1,91 m"), 191);
    assert.equal(parseHeight("6-11"), 211);
    assert.equal(parseHeight("7-0"), 213);
    assert.equal(parseHeight(""), null);
    assert.equal(parseHeight(null), null);
    assert.equal(parseHeight("206"), null);
  });

  it("posición: exterior, alero y pívot, siempre en ese orden", () => {
    assert.equal(positionKey("G"), "G");
    assert.equal(positionKey("F-G"), "G-F");
    assert.equal(positionKey("C-F"), "F-C");
    assert.equal(positionKey("Forward-Center"), "F-C");
    assert.equal(positionKey("Guard"), "G");
    assert.equal(positionKey(""), null);
    assert.equal(positionKey(null), null);
    assert.equal(positionLabel("G-F"), "Ext/Ale");
    assert.equal(positionLabel(null), "–");
  });

  it("edad: años cumplidos el día del reto", () => {
    assert.equal(ageOn("1998-11-27", DAY), 28);
    assert.equal(ageOn("1998-11-28", DAY), 27);
    assert.equal(ageOn("1998-12-01T00:00:00", DAY), 27);
    assert.equal(ageOn(null, DAY), null);
  });

  it("la lista de sospechosos: con equipo, por orden alfabético y sin media si no ha jugado esta temporada", () => {
    const rows = [
      row(3, { name: "Zeta", teamId: 2 }),
      row(1, { name: "Álvaro" }),
      row(2, { name: "Sin equipo", teamId: null }),
      row(4, { name: "Lesionado", radar: { season: SEASON, games_played: 0, overall: null } }),
      row(5, { name: "Del año pasado", radar: { season: "2025-26", games_played: 70, overall: 88 } }),
    ];
    const suspects = buildSuspects(rows, TEAMS, DAY, SEASON);
    assert.deepEqual(
      suspects.map((s) => s.name),
      ["Álvaro", "Del año pasado", "Lesionado", "Zeta"]
    );
    const zeta = suspects.find((s) => s.id === 3)!;
    assert.deepEqual(zeta, { id: 3, name: "Zeta", teamId: 2, team: "BOS", conf: "East", pos: "G", age: 28, cm: 196, media: 85 });
    assert.equal(suspects.find((s) => s.id === 4)!.media, null);
    assert.equal(suspects.find((s) => s.id === 5)!.media, null);
  });
});

describe("jugador del día", () => {
  it("solo titulares de la rotación que sean figura por su media o por su contrato, de más a menos media", () => {
    const rows = [
      row(1, { overall: 90 }),
      row(2, { overall: 95, mpg: TARGET_MIN_MINUTES - 1 }),
      row(3, { overall: 99, qualified: false }),
      row(4, { overall: 88, teamId: null }),
      row(5, { overall: 85, gp: 2 }),
      row(6, { overall: STAR_MEDIA }),
      row(7, { overall: 72, salary: STAR_SALARY }),
      row(8, { overall: 72, salary: STAR_SALARY - 1 }),
      row(9, { overall: STAR_MEDIA - 1, salary: null }),
    ];
    assert.deepEqual(
      targetCandidates(rows, SEASON).map((r) => r.id),
      [1, 6, 7]
    );
  });

  it("como mucho TARGET_POOL (los de más media)", () => {
    const many = Array.from({ length: TARGET_POOL + 30 }, (_, i) => row(i + 1, { overall: 80 + (i % 19) }));
    const pool = targetCandidates(many, SEASON);
    assert.equal(pool.length, TARGET_POOL);
    assert.ok(pool.every((r, i) => i === 0 || (r.radar.overall as number) <= (pool[i - 1].radar.overall as number)));
  });

  it("al empezar la temporada bastan menos partidos (una cuarta parte de los del que más lleva)", () => {
    const rows = [row(1, { gp: 4 }), row(2, { gp: 1 })];
    assert.deepEqual(
      targetCandidates(rows, SEASON).map((r) => r.id),
      [1, 2]
    );
  });

  it("no repite a los que han salido hace poco, salvo que ya hayan salido todos", () => {
    const rows = [row(1), row(2), row(3)];
    for (let seed = 0; seed < 30; seed++) {
      assert.equal(buildPuzzle(rows, TEAMS, DAY, new Set([1, 3]), seededRng(seed))!.target, 2);
    }
    assert.ok([1, 2, 3].includes(buildPuzzle(rows, TEAMS, DAY, new Set([1, 2, 3]), seededRng(7))!.target));
  });

  it("la misma semilla da el mismo jugador (sin base de datos, todas las instancias coinciden)", () => {
    const rows = Array.from({ length: 50 }, (_, i) => row(i + 1));
    const a = buildPuzzle(rows, TEAMS, DAY, new Set(), seededRng(seedOf(DAY)));
    const b = buildPuzzle(rows, TEAMS, DAY, new Set(), seededRng(seedOf(DAY)));
    assert.deepEqual(a, b);
    assert.notEqual(seedOf(DAY), seedOf("2026-11-28"));
  });

  it("la foto del día lleva su radar redondeado y se valida al volver de la base de datos", () => {
    const puzzle = buildPuzzle([row(1), row(2, { teamId: 2 })], TEAMS, DAY, new Set([2]), seededRng(1))!;
    assert.equal(puzzle.target, 1);
    assert.deepEqual(Object.keys(puzzle.radar).sort(), [...RADAR_KEYS].sort());
    assert.ok(isDayPuzzle(puzzle));
    assert.ok(isDayPuzzle(JSON.parse(JSON.stringify(puzzle))));
    assert.ok(!isDayPuzzle({ ...puzzle, target: 99 }));
    assert.ok(!isDayPuzzle({ ...puzzle, radar: { scoring: 1 } }));
    assert.ok(!isDayPuzzle(null));
    assert.equal(buildPuzzle([], TEAMS, DAY, new Set(), seededRng(1)), null);
  });

  it("lo público no dice quién es: sin pistas ni marca del jugador del día", () => {
    const puzzle = buildPuzzle([row(1), row(2, { teamId: 2 }), row(3)], TEAMS, DAY, new Set(), seededRng(3))!;
    const shown = publicPuzzle(puzzle);
    assert.ok(!("target" in shown));
    for (const s of shown.suspects) assert.deepEqual(Object.keys(s).sort(), ["id", "name", "team", "teamId"]);
    assert.ok(!JSON.stringify(shown).includes('"media"'));
  });
});

describe("pistas", () => {
  const target = suspect(1, { conf: "West", pos: "G-F", age: 27, cm: 201, media: 84 });

  it("🟩 si coincide, 🟨 si se acerca y flecha hacia dónde está el del día", () => {
    const clues = compareSuspects(suspect(2, { conf: "West", pos: "G-F", age: 29, cm: 196, media: 74 }), target);
    assert.deepEqual(clues, {
      conf: { mark: "o", dir: null },
      pos: { mark: "o", dir: null },
      age: { mark: "c", dir: "down" },
      height: { mark: "c", dir: "up" },
      media: { mark: "x", dir: "up" },
    });
  });

  it("los límites de cerca: 2 años, 5 cm y 3 de media", () => {
    const at = (s: Partial<Suspect>) => compareSuspects(suspect(2, s), target);
    assert.equal(at({ age: 25 }).age.mark, "c");
    assert.equal(at({ age: 24 }).age.mark, "x");
    assert.equal(at({ cm: 206 }).height.mark, "c");
    assert.equal(at({ cm: 207 }).height.mark, "x");
    assert.equal(at({ media: 87 }).media.mark, "c");
    assert.equal(at({ media: 88 }).media.mark, "x");
    assert.deepEqual(at({ media: 84 }).media, { mark: "o", dir: null });
  });

  it("posición: 🟨 si comparten alguna; conferencia, solo sí o no", () => {
    const at = (s: Partial<Suspect>) => compareSuspects(suspect(2, s), target);
    assert.equal(at({ pos: "F" }).pos.mark, "c");
    assert.equal(at({ pos: "F-C" }).pos.mark, "c");
    assert.equal(at({ pos: "C" }).pos.mark, "x");
    assert.equal(at({ conf: "East" }).conf.mark, "x");
  });

  it("sin dato (no ha jugado esta temporada): 🟥 sin flecha, nunca una pista falsa", () => {
    assert.deepEqual(compareSuspects(suspect(2, { media: null }), target).media, { mark: "x", dir: null });
    assert.deepEqual(compareSuspects(suspect(2, { pos: null }), target).pos, { mark: "x", dir: null });
  });

  it("cada casilla en español", () => {
    const s = suspect(2, { conf: "East", pos: "F-C", age: 31, cm: 206, media: null });
    assert.deepEqual(
      ["conf", "pos", "age", "height", "media"].map((k) => clueText(k as never, s)),
      ["Este", "Ale/Pív", "31", "2,06", "–"]
    );
  });
});

describe("partida", () => {
  const target = suspect(1, { name: "Nikola Jokić", conf: "West", pos: "C", age: 31, cm: 211, media: 99 });
  const others = Array.from({ length: 9 }, (_, i) => suspect(i + 2, { name: `Otro ${i + 2}` }));
  const puzzle = puzzleOf(target, others);

  const play = (ids: number[]) => {
    let run = newRun(puzzle);
    for (const [index, id] of ids.entries()) {
      const result = guessRun(run, puzzle, index, id);
      assert.ok(!("error" in result), `intento ${index}`);
      run = result.state;
    }
    return run;
  };

  it("puntos: 20 a la primera y 3 menos por intento; sin acertar, 0", () => {
    assert.deepEqual(POINTS_BY_GUESS, [20, 17, 14, 11, 8, 5]);
    assert.equal(POINTS_BY_GUESS.length, MAX_GUESSES);
    assert.equal(POINTS_BY_GUESS[0], CHALLENGES.find((c) => c.id === "adivina")!.maxPoints);
    assert.equal(pointsFor(3, true), 14);
    assert.equal(pointsFor(6, false), 0);
  });

  it("acertar a la tercera: acaba, da sus puntos y destapa al jugador", () => {
    const view = viewRun(play([2, 3, 1]), puzzle);
    assert.equal(view.finished, true);
    assert.equal(view.solved, true);
    assert.equal(view.answer?.name, "Nikola Jokić");
    assert.equal(view.summary?.points, 14);
    assert.equal(view.summary?.attempts, 3);
    assert.deepEqual(view.summary?.rows.slice(2), ["ooooo"]);
    assert.ok(view.summary?.rows.slice(0, 2).every((r) => /^[ocx]{5}$/.test(r) && r !== "ooooo"));
    assert.equal(view.guesses[2].hit, true);
  });

  it("mientras no acaba, ni el jugador ni los puntos salen del servidor", () => {
    const view = viewRun(play([2, 3]), puzzle);
    assert.equal(view.finished, false);
    assert.equal(view.answer, null);
    assert.equal(view.summary, null);
    assert.ok(!JSON.stringify(view).includes("Jokić"));
  });

  it("seis fallos: acaba sin puntos (cuenta para la racha) y destapa al jugador", () => {
    const view = viewRun(play([2, 3, 4, 5, 6, 7]), puzzle);
    assert.equal(view.finished, true);
    assert.equal(view.solved, false);
    assert.equal(view.summary?.points, 0);
    assert.equal(view.summary?.rows.length, 6);
    assert.equal(view.answer?.id, 1);
  });

  it("el acierto sale todo en verde aunque otro jugador coincidiera en las cinco pistas", () => {
    const twin = suspect(20, { conf: "West", pos: "C", age: 31, cm: 211, media: 99 });
    const p = puzzleOf(target, [twin]);
    let run = guessRun(newRun(p), p, 0, 20);
    assert.ok(!("error" in run));
    assert.equal(run.outcome.guesses[0].hit, false);
    assert.equal(run.outcome.finished, false);
    run = guessRun(run.state, p, 1, 1);
    assert.ok(!("error" in run));
    assert.equal(run.outcome.summary?.rows[1], "ooooo");
  });

  it("reenviar un intento devuelve el que contó; ni saltarse uno ni seguir al acabar", () => {
    const run = play([2, 3]);
    const again = guessRun(run, puzzle, 1, 9);
    assert.ok(!("error" in again));
    assert.equal(again.changed, false);
    assert.equal(again.outcome.guesses[1].id, 3);
    assert.deepEqual(guessRun(run, puzzle, 3, 4), { error: "out-of-order" });
    assert.deepEqual(guessRun(run, puzzle, -1, 4), { error: "out-of-order" });
    assert.deepEqual(guessRun(play([1]), puzzle, 1, 4), { error: "out-of-order" });
    assert.deepEqual(guessRun(play([2, 3, 4, 5, 6, 7]), puzzle, 6, 1), { error: "out-of-order" });
  });

  it("ni un jugador que no está en la lista ni uno ya dicho gastan intento", () => {
    const run = play([2]);
    assert.deepEqual(guessRun(run, puzzle, 1, 999), { error: "unknown-player" });
    assert.deepEqual(guessRun(run, puzzle, 1, 2), { error: "repeated" });
  });

  it("la partida se valida al volver de la base de datos", () => {
    assert.ok(isAdivinaRun(play([2, 3])));
    assert.ok(!isAdivinaRun({ v: 1, day: DAY, target: 1, answers: [1, 2, 3, 4, 5, 6, 7] }));
    assert.ok(!isAdivinaRun({ v: 1, day: DAY, target: 1, answers: ["1"] }));
    assert.ok(!isAdivinaRun({ v: 1, day: DAY, answers: [] }));
    assert.ok(!isAdivinaRun({ v: 1, day: DAY, target: 1, questions: [] }));
  });

  it("para compartir: una fila de cinco marcas por intento y nunca el nombre", () => {
    const view = viewRun(play([2, 3, 1]), puzzle);
    const text = shareText({ day: DAY, results: [{ day: DAY, game: "adivina", points: view.summary!.points, rows: view.summary!.rows }], streakDays: 2, url: "https://hoopmeter.com/juegos" });
    assert.match(text, /Adivina el jugador · 14\/20/);
    assert.match(text, /🟩🟩🟩🟩🟩/);
    assert.ok(!text.includes("Jokić"));
  });
});

describe("buscador", () => {
  const list = [
    { id: 1, name: "Nikola Jokić", teamId: 1, team: "DEN" },
    { id: 2, name: "Nikola Vučević", teamId: 2, team: "BOS" },
    { id: 3, name: "Shai Gilgeous-Alexander", teamId: 3, team: "OKC" },
    { id: 4, name: "Jaren Jackson Jr.", teamId: 3, team: "MEM" },
  ];

  it("por apellido, sin tildes o por iniciales", () => {
    assert.deepEqual(
      findSuspects(list, "jokic", new Set()).map((s) => s.id),
      [1]
    );
    assert.deepEqual(
      findSuspects(list, "sga", new Set()).map((s) => s.id),
      [3]
    );
    assert.deepEqual(
      findSuspects(list, "niko", new Set()).map((s) => s.id),
      [1, 2]
    );
    assert.deepEqual(findSuspects(list, "", new Set()), []);
  });

  it("sin los ya dichos y como mucho `limit`", () => {
    assert.deepEqual(
      findSuspects(list, "niko", new Set([1])).map((s) => s.id),
      [2]
    );
    assert.equal(findSuspects(list, "ni", new Set(), 1).length, 1);
  });
});
