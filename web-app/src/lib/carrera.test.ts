// Tests de Carrera oculta (Tarea 8.4). Se lanzan con `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { seededRng } from "./adivina.ts";
import {
  buildPuzzle,
  buildSuspects,
  careerOf,
  careerTimeline,
  CLUE_ORDER,
  clueText,
  GUESSABLE_MIN_SEASONS,
  honoursOf,
  initialsOf,
  isCarreraRun,
  isDayPuzzle,
  MAX_GUESSES,
  newRun,
  playRun,
  POINTS_BY_GUESS,
  POINTS_WITH_TEAMS,
  pointsFor,
  positionName,
  publicPuzzle,
  runScore,
  seasonOf,
  seasonTeams,
  shareRow,
  STAR_SALARY,
  TARGET_MIN_SEASONS,
  targetCandidates,
  TEAMS_MOVE,
  viewRun,
  type CarreraRun,
  type DayPuzzle,
  type Honours,
  type PlayerRow,
  type PuzzleData,
  type SeasonRow,
  type TeamInfo,
} from "./carrera.ts";
import { CHALLENGES, parseProgress, serializeProgress, addResult, EMPTY_PROGRESS, shareText } from "./games.ts";

const DAY = "2026-11-27";

const TEAMS = new Map<number, TeamInfo>([
  [1, { abbr: "OKC" }],
  [2, { abbr: "GSW" }],
  [3, { abbr: "PHX" }],
]);

const NONE: Honours = { champion: 0, mvp: 0, allstar: 0 };

function player(id: number, p: Partial<PlayerRow> = {}): PlayerRow {
  return {
    id,
    name: `Jugador ${id}`,
    active: true,
    teamId: 1,
    position: "Forward",
    height: "2.11 m",
    country: "USA",
    draftYear: 2007,
    draftNumber: 2,
    salary: 30_000_000,
    hasCareer: true,
    ...p,
  };
}

/** `count` temporadas seguidas desde `from`, en el equipo `teamId`. */
function seasons(playerId: number, count: number, from = 2010, teamId = 1): SeasonRow[] {
  return Array.from({ length: count }, (_, i) => ({
    playerId,
    season: seasonOf(from + i),
    teamId,
    abbr: TEAMS.get(teamId)?.abbr ?? null,
    teams: null,
    age: 20 + i,
    gp: 70,
    pts: 20 + i / 3,
    reb: 7.04,
    ast: 4.96,
  }));
}

function data(players: PlayerRow[], rows: SeasonRow[], honours = new Map<number, Honours>()): PuzzleData {
  return { players, seasons: rows, honours, teams: TEAMS };
}

/** Una foto del día con el jugador 1 (7 temporadas) y otros dos que se pueden decir. */
function puzzle(): DayPuzzle {
  const players = [player(1), player(2, { active: false, teamId: null, salary: null }), player(3)];
  const rows = [...seasons(1, 7), ...seasons(2, 12, 1990, 2), ...seasons(3, 6, 2015, 3)];
  const built = buildPuzzle(data(players, rows), DAY, new Set([2, 3]), seededRng(1));
  assert.ok(built);
  assert.equal(built.target, 1);
  return built;
}

const play = (run: CarreraRun, p: DayPuzzle, move: number | typeof TEAMS_MOVE) => {
  const result = playRun(run, p, run.answers.length, move);
  assert.ok(!("error" in result), JSON.stringify(result));
  return result;
};

describe("carrera", () => {
  it("temporadas: de 1999 a \"1999-00\", con huecos y los equipos de un traspaso", () => {
    assert.equal(seasonOf(1999), "1999-00");
    assert.equal(seasonOf(2003), "2003-04");
    const jordan = ["1992-93", "1994-95", "1997-98", "2001-02", "2002-03"].map((season) => ({ season }));
    assert.deepEqual(careerTimeline(jordan), [
      { kind: "season", index: 0 },
      { kind: "gap", from: "1993-94", to: "1993-94", count: 1 },
      { kind: "season", index: 1 },
      { kind: "gap", from: "1995-96", to: "1996-97", count: 2 },
      { kind: "season", index: 2 },
      { kind: "gap", from: "1998-99", to: "2000-01", count: 3 },
      { kind: "season", index: 3 },
      { kind: "season", index: 4 },
    ]);

    const traded: SeasonRow = {
      playerId: 1,
      season: "2022-23",
      teamId: 3,
      abbr: "TOT",
      teams: [
        { team_id: 1, team_abbreviation: "BKN", gp: 39 },
        { team_id: 3, team_abbreviation: "PHX", gp: 8 },
        { team_id: null, team_abbreviation: "TOT", gp: 47 },
      ],
      age: 34,
      gp: 47,
      pts: 29.1,
      reb: 6.7,
      ast: 5,
    };
    assert.deepEqual(seasonTeams(traded, TEAMS), [
      { id: 1, abbr: "BKN", gp: 39 },
      { id: 3, abbr: "PHX", gp: 8 },
    ]);
    // La abreviatura de entonces (SEA), no la de hoy; sin ella, la de hoy
    assert.deepEqual(seasonTeams({ ...traded, teams: null, teamId: 1, abbr: "SEA" }, TEAMS), [{ id: 1, abbr: "SEA", gp: null }]);
    assert.deepEqual(seasonTeams({ ...traded, teams: null, teamId: 1, abbr: "TOT" }, TEAMS), [{ id: 1, abbr: "OKC", gp: null }]);
    assert.deepEqual(seasonTeams({ ...traded, teams: null, teamId: null, abbr: null }, TEAMS), []);

    // En orden y con un decimal
    const career = careerOf([...seasons(1, 2, 2011), ...seasons(1, 1, 2010)], TEAMS);
    assert.deepEqual(career.map((s) => s.season), ["2010-11", "2011-12", "2012-13"]);
    assert.equal(career[0].reb, 7);
    assert.equal(career[0].ast, 5);
  });

  it("quién se puede decir: dos temporadas o más, con el equipo de hoy si sigue en activo", () => {
    const players = [player(1, { name: "Zeta" }), player(2, { name: "Álvaro", active: false, teamId: null }), player(3, { name: "Beta" }), player(4, { name: "Libre", teamId: null })];
    const count = new Map([
      [1, 5],
      [2, GUESSABLE_MIN_SEASONS],
      [3, 1],
      [4, 3],
    ]);
    assert.deepEqual(buildSuspects(players, count, TEAMS), [
      { id: 2, name: "Álvaro", teamId: null, team: null, retired: true },
      { id: 4, name: "Libre", teamId: null, team: null, retired: false },
      { id: 1, name: "Zeta", teamId: 1, team: "OKC", retired: false },
    ]);
  });

  it("candidatos: leyendas y figuras en activo (contrato o All-Star) con la carrera completa y cinco temporadas", () => {
    const players = [
      player(1),
      player(2, { salary: STAR_SALARY - 1 }),
      player(3, { salary: 1_000_000 }), // All-Star con contrato mínimo
      player(4, { hasCareer: false }),
      player(5, { active: false, teamId: null, salary: null }),
      player(6),
      player(7, { teamId: null }),
    ];
    const count = new Map(players.map((p) => [p.id, p.id === 6 ? TARGET_MIN_SEASONS - 1 : TARGET_MIN_SEASONS]));
    const honours = new Map([[3, { ...NONE, allstar: 1 }]]);
    const { legends, active } = targetCandidates(players, count, honours);
    assert.deepEqual(legends.map((p) => p.id), [5]);
    assert.deepEqual(active.map((p) => p.id), [1, 3]);
  });

  it("foto del día: mitad leyendas y mitad en activo, sin repetir y con la temporada en curso", () => {
    const players = [player(1), player(2), player(3, { active: false, teamId: null }), player(4, { active: false, teamId: null })];
    const rows = [...seasons(1, 6, 2021), ...seasons(2, 6), ...seasons(3, 10, 1985), ...seasons(4, 10, 1990)];
    const picks = new Map<number, number>();
    for (let seed = 0; seed < 400; seed++) {
      const p = buildPuzzle(data(players, rows), DAY, new Set(), seededRng(seed))!;
      picks.set(p.target, (picks.get(p.target) ?? 0) + 1);
      assert.equal(p.current, "2026-27");
    }
    const legends = (picks.get(3) ?? 0) + (picks.get(4) ?? 0);
    assert.ok(legends > 150 && legends < 250, `leyendas ${legends} de 400`);
    // Sin repetir: si ya han salido todos los de un grupo, del otro; si todos, entre todos
    for (let seed = 0; seed < 50; seed++) assert.equal(buildPuzzle(data(players, rows), DAY, new Set([1, 2, 3]), seededRng(seed))!.target, 4);
    assert.ok(buildPuzzle(data(players, rows), DAY, new Set([1, 2, 3, 4]), seededRng(3)));
    assert.equal(buildPuzzle(data([player(9)], seasons(9, 3)), DAY, new Set(), seededRng(1)), null);
    assert.equal(buildPuzzle(data(players, []), DAY, new Set(), seededRng(1)), null);
  });

  it("foto del día: lo que viaja al cliente no lleva equipos ni pistas, y se valida al leerla", () => {
    const p = puzzle();
    assert.equal(p.seasons.length, 7);
    assert.equal(p.profile.initials, "J. 1.");
    assert.ok(isDayPuzzle(p));
    assert.ok(isDayPuzzle(JSON.parse(JSON.stringify(p))));

    const pub = publicPuzzle(p);
    const text = JSON.stringify(pub);
    assert.ok(!text.includes("teams"), "sin equipos");
    assert.ok(!text.includes("OKC") || pub.suspects.some((s) => s.team === "OKC"), "OKC solo como equipo de hoy de quien se puede decir");
    assert.ok(!("profile" in pub) && !("target" in pub));
    assert.deepEqual(Object.keys(pub.seasons[0]).sort(), ["age", "ast", "gp", "pts", "reb", "season"]);

    assert.equal(isDayPuzzle({ ...p, v: 2 }), false);
    assert.equal(isDayPuzzle({ ...p, target: 99 }), false);
    assert.equal(isDayPuzzle({ ...p, seasons: [] }), false);
    assert.equal(isDayPuzzle({ ...p, seasons: [{ ...p.seasons[0], season: "Career" }] }), false);
    assert.equal(isDayPuzzle({ ...p, profile: { ...p.profile, honours: undefined } }), false);
  });

  it("pistas: posición y altura, país, draft, palmarés e iniciales", () => {
    const profile = { pos: "F-C", cm: 211, country: "USA", draftYear: 2003, draftNumber: 1, honours: { champion: 4, mvp: 4, allstar: 21 }, initials: "L. J." };
    assert.deepEqual(CLUE_ORDER, ["body", "country", "draft", "honours", "initials"]);
    assert.equal(clueText("body", profile), "Alero-pívot · 2,11 m");
    assert.equal(clueText("country", profile), "EE. UU.");
    assert.equal(clueText("draft", profile), "N.º 1 del draft de 2003");
    assert.equal(clueText("honours", profile), "4 anillos · 4 MVP · 21 veces All-Star");
    assert.equal(clueText("initials", profile), "L. J.");
    assert.equal(clueText("draft", { ...profile, draftNumber: null }), "Draft de 2003");
    assert.equal(clueText("draft", { ...profile, draftYear: null, draftNumber: null }), "No salió elegido en el draft");
    assert.equal(clueText("honours", { ...profile, honours: { champion: 1, mvp: 0, allstar: 1 } }), "1 anillo · 1 vez All-Star");
    assert.equal(clueText("honours", { ...profile, honours: NONE }), "Sin anillos, MVP ni All-Star");
    assert.equal(clueText("body", { ...profile, pos: null, cm: null }), "–");
    assert.equal(positionName("G"), "Exterior");
    assert.equal(positionName("G-F"), "Exterior-alero");
    assert.equal(positionName(null), null);

    assert.equal(initialsOf("LeBron James"), "L. J.");
    assert.equal(initialsOf("Shai Gilgeous-Alexander"), "S. G.-A.");
    assert.equal(initialsOf("Jimmy Butler III"), "J. B.");
    assert.equal(initialsOf("Jaren Jackson Jr."), "J. J.");
    assert.equal(initialsOf("Shaquille O'Neal"), "S. O.");
    assert.equal(initialsOf("Nikola Jokić"), "N. J.");
    assert.equal(initialsOf("Ángel  Delgado"), "Á. D.");
  });

  it("palmarés desde player_awards: solo anillos, MVP y All-Star", () => {
    const honours = honoursOf([
      { player_id: 1, award_name: "NBA Champion" },
      { player_id: 1, award_name: "NBA Champion" },
      { player_id: 1, award_name: "NBA Most Valuable Player" },
      { player_id: 1, award_name: "NBA All-Star" },
      { player_id: 1, award_name: "All-NBA 1st Team" },
      { player_id: 2, award_name: "NBA Finals Most Valuable Player" },
    ]);
    assert.deepEqual(honours.get(1), { champion: 2, mvp: 1, allstar: 1 });
    assert.equal(honours.get(2), undefined);
  });

  it("puntos: 20/17/14/11/8/5 y la mitad con los equipos; sin acertar, 0", () => {
    assert.deepEqual(POINTS_BY_GUESS, [20, 17, 14, 11, 8, 5]);
    assert.deepEqual(POINTS_WITH_TEAMS, [10, 9, 7, 6, 4, 3]);
    assert.equal(POINTS_BY_GUESS.length, MAX_GUESSES);
    // El tope del reto es el de la Tarea 8.6
    assert.equal(CHALLENGES.find((c) => c.id === "carrera")?.maxPoints, POINTS_BY_GUESS[0]);
    assert.equal(pointsFor(1, true, false), 20);
    assert.equal(pointsFor(1, true, true), 10);
    assert.equal(pointsFor(6, true, true), 3);
    assert.equal(pointsFor(6, false, false), 0);
  });

  it("partida: cada fallo destapa una pista; acertar acaba y lo destapa todo", () => {
    const p = puzzle();
    let run = newRun(p);
    let view = viewRun(run, p);
    assert.deepEqual(view.clues, []);
    assert.equal(view.teams, null);
    assert.equal(view.answer, null);

    ({ state: run, outcome: view } = play(run, p, 2));
    assert.deepEqual(view.clues.map((c) => c.key), ["body"]);
    assert.equal(view.guesses[0].hit, false);
    assert.equal(view.step, 1);
    ({ state: run, outcome: view } = play(run, p, 3));
    assert.deepEqual(view.clues.map((c) => c.key), ["body", "country"]);
    assert.equal(view.finished, false);

    ({ state: run, outcome: view } = play(run, p, 1));
    assert.ok(view.finished && view.solved);
    assert.equal(view.clues.length, CLUE_ORDER.length);
    assert.equal(view.teams?.length, p.seasons.length);
    assert.equal(view.answer?.id, 1);
    assert.deepEqual(view.summary, { points: 14, attempts: 3, solved: true, withTeams: false, rows: ["xxo"] });
    // Acabada: nada más cuenta
    assert.deepEqual(playRun(run, p, run.answers.length, TEAMS_MOVE), { error: "out-of-order" });
  });

  it("ver los equipos: una sola vez, en cualquier momento, y deja los puntos a la mitad", () => {
    const p = puzzle();
    let run = newRun(p);
    let view;
    ({ state: run, outcome: view } = play(run, p, TEAMS_MOVE));
    assert.equal(view.withTeams, true);
    assert.equal(view.teams?.length, p.seasons.length);
    assert.deepEqual(view.teams?.[0], [{ id: 1, abbr: "OKC", gp: null }]);
    assert.deepEqual(view.clues, [], "ver los equipos no es un fallo");
    assert.equal(view.guesses.length, 0);
    assert.deepEqual(playRun(run, p, run.answers.length, TEAMS_MOVE), { error: "repeated" });

    ({ state: run, outcome: view } = play(run, p, 3));
    ({ state: run, outcome: view } = play(run, p, 1));
    assert.deepEqual(view.summary, { points: POINTS_WITH_TEAMS[1], attempts: 2, solved: true, withTeams: true, rows: ["xc"] });
    assert.equal(shareRow([{ hit: false }, { hit: true }], false), "xo");
  });

  it("seis fallos: acaba sin puntos, con el jugador y todas las pistas", () => {
    const players = [player(1), ...Array.from({ length: 7 }, (_, i) => player(10 + i, { salary: null }))];
    const rows = [...seasons(1, 6), ...players.slice(1).flatMap((pl) => seasons(pl.id, 2))];
    const p = buildPuzzle(data(players, rows), DAY, new Set(), seededRng(5))!;
    assert.equal(p.target, 1);
    let run = newRun(p);
    let view = viewRun(run, p);
    for (let i = 0; i < MAX_GUESSES; i++) ({ state: run, outcome: view } = play(run, p, 10 + i));
    assert.ok(view.finished && !view.solved);
    assert.equal(view.answer?.id, 1);
    assert.equal(view.clues.length, CLUE_ORDER.length);
    assert.deepEqual(view.summary, { points: 0, attempts: 6, solved: false, withTeams: false, rows: ["xxxxxx"] });
    assert.deepEqual(playRun(run, p, run.answers.length, 16), { error: "out-of-order" });
    assert.equal(runScore(run).misses, 6);
  });

  it("el servidor manda: reenviar devuelve lo que contó, y ni repetidos ni desconocidos gastan intento", () => {
    const p = puzzle();
    const start = newRun(p);
    const first = play(start, p, 2);
    const again = playRun(first.state, p, 0, 3);
    assert.ok(!("error" in again));
    assert.equal(again.changed, false);
    assert.equal(again.outcome.guesses[0].id, 2);
    assert.deepEqual(playRun(first.state, p, 1, 2), { error: "repeated" });
    assert.deepEqual(playRun(first.state, p, 1, 999), { error: "unknown-player" });
    assert.deepEqual(playRun(first.state, p, 3, 3), { error: "out-of-order" });
    assert.deepEqual(playRun(first.state, p, -1, 3), { error: "out-of-order" });
  });

  it("partida guardada: se valida su forma", () => {
    const p = puzzle();
    const run = play(newRun(p), p, TEAMS_MOVE).state;
    assert.ok(isCarreraRun(run));
    assert.ok(isCarreraRun(JSON.parse(JSON.stringify(run))));
    assert.equal(isCarreraRun({ ...run, answers: [TEAMS_MOVE, TEAMS_MOVE] }), false);
    assert.equal(isCarreraRun({ ...run, answers: [1, 2, 3, 4, 5, 6, 7] }), false);
    assert.equal(isCarreraRun({ ...run, answers: ["otra"] }), false);
    assert.equal(isCarreraRun({ ...run, v: 2 }), false);
  });

  it("resultado: se guarda en el dispositivo y se comparte sin el nombre", () => {
    const p = puzzle();
    let run = play(newRun(p), p, TEAMS_MOVE).state;
    const { outcome } = play(run, p, 1);
    run = play(newRun(p), p, 1).state;
    const summary = outcome.summary!;
    const progress = parseProgress(serializeProgress(addResult(EMPTY_PROGRESS, { day: DAY, game: "carrera", points: summary.points, rows: summary.rows })));
    assert.deepEqual(progress.results, [{ day: DAY, game: "carrera", points: 10, rows: ["c"] }]);
    const text = shareText({ day: DAY, results: progress.results, streakDays: 1, url: "https://hoopmeter.com/juegos" });
    assert.ok(text.includes("Carrera oculta · 10/20\n🟨"));
    assert.ok(!text.includes("Jugador 1"));
  });
});
