// Tests de ¿Más o menos? (Tarea 8.2). Se lanzan con `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CHALLENGES } from "./games.ts";
import {
  ANSWER_MS,
  answerRun,
  buildPool,
  buildQuestions,
  correctChoice,
  currentQuestion,
  DAILY_PLAN,
  DAILY_QUESTIONS,
  endlessBatch,
  endlessLevel,
  formatSeconds,
  formatValue,
  GRACE_MS,
  isRunState,
  levelOf,
  newRun,
  POINTS_PER_HIT,
  questionText,
  REVEAL_MS,
  seededRng,
  type Category,
  type PoolRow,
  type RunState,
  type TeamTag,
} from "./mas-o-menos.ts";

const TEAM: TeamTag = { abbr: "LAL", color: "#552583", accent: "#fdb927" };
const TEAMS = new Map([[1, TEAM]]);

/** Jugador de rotación con cifras repartidas (como una liga de verdad, de suplente a estrella). */
function row(i: number, overrides: Partial<PoolRow> = {}): PoolRow {
  const gp = 18;
  const k = (i * 37) % 200; // orden revuelto
  return {
    id: 1000 + i,
    name: `Jugador ${i}`,
    teamId: 1,
    salary: 2_000_000 + k * 280_000,
    salaryStatus: "confirmed",
    overall: 50 + (k % 45),
    totals: { gp, min: gp * (18 + (k % 18)), pts: gp * (4 + (k % 26)), reb: gp * (1.5 + (k % 10)), ast: gp * (0.8 + (k % 8)) },
    ...overrides,
  };
}

const ROWS = Array.from({ length: 200 }, (_, i) => row(i));
const POOL = buildPool(ROWS, TEAMS, "2026-27");

describe("levelOf · diferencias mínimas y dificultad", () => {
  it("salarios: por proporción; más cerca de 1,25 veces no se pregunta", () => {
    assert.equal(levelOf("salario", 10e6, 12e6), null);
    assert.equal(levelOf("salario", 13e6, 10e6), "dificil");
    assert.equal(levelOf("salario", 10e6, 20e6), "media");
    assert.equal(levelOf("salario", 31e6, 10e6), "facil");
  });

  it("media y promedios: por diferencia", () => {
    assert.equal(levelOf("media", 70, 72), null);
    assert.equal(levelOf("media", 70, 74), "dificil");
    assert.equal(levelOf("media", 80, 70), "media");
    assert.equal(levelOf("media", 70, 85), "facil");
    assert.equal(levelOf("puntos", 12.1, 13.9), null);
    assert.equal(levelOf("puntos", 12.1, 14.1), "dificil");
    assert.equal(levelOf("rebotes", 4.3, 5.2), null);
    assert.equal(levelOf("asistencias", 2.1, 6.1), "facil");
  });

  it("sin errores de coma flotante en el límite", () => {
    assert.equal(levelOf("rebotes", 0.1 + 0.2, 1.3), "dificil");
  });
});

describe("buildPool · solo la rotación y solo cifras exactas", () => {
  it("fuera los que no tienen equipo, los de pocos minutos y los de pocos partidos", () => {
    const pool = buildPool(
      [row(1), row(2, { teamId: null }), row(3, { totals: { gp: 18, min: 18 * 12, pts: 50, reb: 20, ast: 10 } }), row(4, { totals: { gp: 2, min: 70, pts: 40, reb: 10, ast: 5 } })],
      TEAMS,
      "2026-27"
    );
    assert.deepEqual(pool.players.map((p) => p.id), [1001]);
  });

  it("salario solo de contratos confirmados con cifra (ni pendientes ni aproximados)", () => {
    const pool = buildPool([row(1), row(2, { salaryStatus: "approx" }), row(3, { salaryStatus: "pending", salary: null }), row(5, { salary: null })], TEAMS, "2026-27");
    assert.deepEqual(
      pool.players.map((p) => p.values.salario !== undefined),
      [true, false, false, false]
    );
  });

  it("promedios por partido con un decimal y media entera", () => {
    const [p] = buildPool([row(0, { overall: 71.6, totals: { gp: 3, min: 90, pts: 50, reb: 20, ast: 10 } })], TEAMS, "2026-27").players;
    assert.deepEqual(p.values, { salario: 2_000_000, media: 72, puntos: 16.7, rebotes: 6.7, asistencias: 3.3 });
  });

  it("al empezar la temporada basta con menos partidos", () => {
    const early = [row(1, { totals: { gp: 2, min: 60, pts: 30, reb: 10, ast: 4 } }), row(2, { totals: { gp: 1, min: 25, pts: 10, reb: 5, ast: 1 } })];
    assert.equal(buildPool(early, TEAMS, "2026-27").players.length, 2);
  });
});

describe("buildQuestions · el reto del día", () => {
  const questions = buildQuestions(POOL, DAILY_PLAN, seededRng(7));

  it("30 preguntas con la categoría y la dificultad del plan, igual para todos", () => {
    assert.equal(questions.length, DAILY_QUESTIONS);
    questions.forEach((q, i) => {
      assert.equal(q.category, DAILY_PLAN[i].category);
      assert.equal(q.level, DAILY_PLAN[i].level);
      assert.equal(levelOf(q.category, q.a.value, q.b.value), q.level);
    });
    assert.deepEqual(DAILY_PLAN.slice(0, 10).map((s) => s.level), Array(10).fill("facil"));
    assert.deepEqual(DAILY_PLAN.slice(20).map((s) => s.level), Array(10).fill("dificil"));
  });

  it("ningún jugador se repite en una partida", () => {
    const ids = questions.flatMap((q) => [q.a.id, q.b.id]);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("preguntas distintas en cada partida; la misma semilla da las mismas", () => {
    assert.deepEqual(buildQuestions(POOL, DAILY_PLAN, seededRng(7)), questions);
    const other = buildQuestions(POOL, DAILY_PLAN, seededRng(8));
    assert.notDeepEqual(other.map((q) => [q.a.id, q.b.id]), questions.map((q) => [q.a.id, q.b.id]));
  });

  it("«más» y «menos» salen parecido: contestar siempre lo mismo no sirve", () => {
    let mas = 0;
    let total = 0;
    for (let seed = 1; seed <= 40; seed++) {
      for (const q of buildQuestions(POOL, DAILY_PLAN, seededRng(seed))) {
        total++;
        if (correctChoice(q) === "mas") mas++;
      }
    }
    assert.ok(mas / total > 0.4 && mas / total < 0.6, `${mas} de ${total}`);
  });

  it("si una categoría no da (sin salarios), otra con la misma dificultad", () => {
    const pool = buildPool(ROWS.map((r) => ({ ...r, salaryStatus: "pending" as const, salary: null })), TEAMS, "2026-27");
    const list = buildQuestions(pool, DAILY_PLAN, seededRng(3));
    assert.equal(list.length, DAILY_QUESTIONS);
    assert.ok(list.every((q, i) => q.category !== "salario" && q.level === DAILY_PLAN[i].level));
  });

  it("sin jugadores suficientes, error (no preguntas injustas)", () => {
    assert.throws(() => buildQuestions(buildPool(ROWS.slice(0, 3), TEAMS, "2026-27"), DAILY_PLAN, seededRng(1)));
  });
});

describe("answerRun · todo lo decide el servidor", () => {
  const T0 = Date.parse("2026-11-26T19:00:00Z");
  const questions = buildQuestions(POOL, DAILY_PLAN, seededRng(11));
  const start = newRun(questions, "2026-11-26", T0);
  const right = (state: RunState) => correctChoice(state.questions[state.answers.length]);
  const wrong = (state: RunState) => (right(state) === "mas" ? "menos" : "mas");

  it("la pregunta que llega al cliente no lleva la cifra del segundo", () => {
    const asked = currentQuestion(start)!;
    assert.equal(asked.index, 0);
    assert.equal(asked.total, 30);
    assert.equal("value" in asked.b, false);
    assert.equal(typeof asked.a.value, "number");
  });

  it("acierto, fallo y el reloj de la siguiente empieza tras enseñar la cifra", () => {
    const first = answerRun(start, 0, right(start), T0 + 2_000)!;
    assert.equal(first.outcome.hit, true);
    assert.equal(first.outcome.value, questions[0].b.value);
    assert.equal(first.outcome.next?.index, 1);
    assert.equal(first.state.askedAt, T0 + 2_000 + REVEAL_MS);
    const second = answerRun(first.state, 1, wrong(first.state), T0 + 6_000)!;
    assert.equal(second.outcome.hit, false);
    assert.equal(second.outcome.hits, 1);
  });

  it("fuera de tiempo es fallo aunque acierte; sin respuesta (null), fallo", () => {
    const late = answerRun(start, 0, right(start), T0 + ANSWER_MS + GRACE_MS + 1)!;
    assert.equal(late.outcome.late, true);
    assert.equal(late.outcome.hit, false);
    assert.equal(late.state.answers[0].ms, ANSWER_MS);
    const onTime = answerRun(start, 0, right(start), T0 + ANSWER_MS + GRACE_MS)!;
    assert.equal(onTime.outcome.hit, true);
    assert.equal(answerRun(start, 0, null, T0 + ANSWER_MS)!.outcome.hit, false);
  });

  it("una pregunta ya contestada no se puede repetir ni cambiar", () => {
    const first = answerRun(start, 0, wrong(start), T0 + 1_000)!;
    const retry = answerRun(first.state, 0, right(start), T0 + 1_500)!;
    assert.equal(retry.changed, false);
    assert.equal(retry.state, first.state);
    assert.equal(retry.outcome.hit, false);
    assert.equal(retry.outcome.choice, wrong(start));
  });

  it("no se puede saltar a una pregunta que no ha llegado", () => {
    assert.equal(answerRun(start, 1, "mas", T0 + 1_000), null);
    assert.equal(answerRun(start, -1, "mas", T0 + 1_000), null);
    assert.equal(answerRun(start, 0.5, "mas", T0 + 1_000), null);
  });

  it("al acabar: 2 puntos por acierto (60 como mucho), tiempo total y emojis en filas de diez", () => {
    let state = start;
    let now = T0;
    let outcome;
    for (let i = 0; i < DAILY_QUESTIONS; i++) {
      now = state.askedAt + 3_000;
      ({ state, outcome } = answerRun(state, i, i === 4 ? wrong(state) : right(state), now)!);
    }
    assert.equal(outcome!.next, null);
    assert.deepEqual(outcome!.summary, { points: 58, hits: 29, total: 30, ms: 90_000, rows: ["ooooxooooo", "oooooooooo", "oooooooooo"] });
    assert.equal(answerRun(state, 30, "mas", now + 1_000), null);
    assert.equal(currentQuestion(state), null);
  });

  it("el tope del reto coincide con el de /juegos", () => {
    assert.equal(DAILY_QUESTIONS * POINTS_PER_HIT, CHALLENGES.find((c) => c.id === "mas-o-menos")!.maxPoints);
  });
});

describe("isRunState", () => {
  it("acepta una partida y rechaza lo que no lo es", () => {
    const state = newRun(buildQuestions(POOL, DAILY_PLAN, seededRng(2)), "2026-11-26", 0);
    assert.equal(isRunState(JSON.parse(JSON.stringify(state))), true);
    assert.equal(isRunState(null), false);
    assert.equal(isRunState({ ...state, v: 2 }), false);
    assert.equal(isRunState({ ...state, questions: [] }), false);
    assert.equal(isRunState({ ...state, questions: [{ ...state.questions[0], category: "triples" }] }), false);
  });
});

describe("modo infinito", () => {
  it("empieza fácil y se pone difícil", () => {
    assert.deepEqual([0, 4, 5, 14, 15, 99].map(endlessLevel), ["facil", "facil", "media", "media", "dificil", "dificil"]);
    const batch = endlessBatch(POOL, 10, 10, seededRng(5));
    assert.deepEqual(batch.map((q) => q.level), [...Array(5).fill("media"), ...Array(5).fill("dificil")]);
    assert.ok(batch.every((q) => levelOf(q.category, q.a.value, q.b.value) === q.level));
  });
});

describe("formatos", () => {
  it("salario en millones, media entera, promedios con un decimal", () => {
    const cases: [Category, number, string][] = [
      ["salario", 18_400_000, "18,4 M$"],
      ["salario", 2_296_274, "2,3 M$"],
      ["media", 84, "84"],
      ["puntos", 24.6, "24,6"],
      ["rebotes", 5, "5,0"],
    ];
    for (const [category, value, text] of cases) assert.equal(formatValue(category, value), text);
    assert.equal(formatSeconds(52_430), "52,4 s");
  });

  it("la pregunta, con apellidos (y nombres enteros si se apellidan igual)", () => {
    const aldama = { name: "Santi Aldama" };
    assert.equal(questionText("salario", aldama, { name: "Austin Reaves" }), "¿Reaves cobra más o menos que Aldama?");
    assert.equal(questionText("puntos", aldama, { name: "Michael Porter Jr." }), "¿Porter Jr. promedia más o menos puntos que Aldama?");
    assert.equal(questionText("media", { name: "Jalen Williams" }, { name: "Jaylin Williams" }), "¿Jaylin Williams tiene más o menos media que Jalen Williams?");
    assert.equal(questionText("rebotes", aldama, { name: "Nenê" }), "¿Nenê promedia más o menos rebotes que Aldama?");
  });
});
