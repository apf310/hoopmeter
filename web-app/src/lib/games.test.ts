// Tests de Juegos (Tarea 8.1). Se lanzan con `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addEndless,
  addResult,
  addRun,
  challengeDay,
  challengeStart,
  CHALLENGES,
  DAILY_MAX_POINTS,
  divisionOf,
  DIVISIONS,
  EMPTY_PROGRESS,
  formatCountdown,
  MAX_SHIELDS,
  nextChallengeAt,
  openRun,
  parseProgress,
  serializeProgress,
  shareText,
  streakOf,
  totalPoints,
  type ChallengeResult,
} from "./games.ts";
import { addDays } from "./game-day.ts";

const at = (iso: string) => Date.parse(iso);

describe("challengeDay · cambian a las 7:00 de España", () => {
  it("en invierno (UTC+1): 6:59 es aún el día anterior y 7:00 el nuevo", () => {
    assert.equal(challengeDay(at("2026-11-26T05:59:59Z")), "2026-11-25");
    assert.equal(challengeDay(at("2026-11-26T06:00:00Z")), "2026-11-26");
  });

  it("en verano (UTC+2)", () => {
    assert.equal(challengeDay(at("2027-07-01T04:59:00Z")), "2027-06-30");
    assert.equal(challengeDay(at("2027-07-01T05:00:00Z")), "2027-07-01");
  });

  it("lo que se juega a medianoche o de madrugada cuenta para el día anterior", () => {
    assert.equal(challengeDay(at("2026-11-26T23:30:00Z")), "2026-11-26"); // 0:30 del 27 en España
    assert.equal(challengeDay(at("2026-11-27T04:00:00Z")), "2026-11-26"); // 5:00 del 27
  });

  it("los días del cambio de hora también cambian a las 7:00 de España", () => {
    // 28-mar-2027: a las 2:00 pasan a ser las 3:00 (UTC+2 desde entonces)
    assert.equal(challengeDay(at("2027-03-28T04:59:00Z")), "2027-03-27");
    assert.equal(challengeDay(at("2027-03-28T05:00:00Z")), "2027-03-28");
    // 31-oct-2027: a las 3:00 vuelven a ser las 2:00 (UTC+1 desde entonces)
    assert.equal(challengeDay(at("2027-10-31T05:59:00Z")), "2027-10-30");
    assert.equal(challengeDay(at("2027-10-31T06:00:00Z")), "2027-10-31");
  });

  it("challengeStart y nextChallengeAt dan las 7:00 exactas", () => {
    assert.equal(challengeStart("2026-11-26"), at("2026-11-26T06:00:00Z"));
    assert.equal(challengeStart("2027-03-28"), at("2027-03-28T05:00:00Z"));
    assert.equal(challengeStart("2027-10-31"), at("2027-10-31T06:00:00Z"));
    assert.equal(nextChallengeAt(at("2026-11-26T05:00:00Z")), at("2026-11-26T06:00:00Z"));
    assert.equal(nextChallengeAt(at("2026-11-26T06:00:00Z")), at("2026-11-27T06:00:00Z"));
    // Del sábado 27-mar al domingo del cambio: 23 horas
    assert.equal(nextChallengeAt(at("2027-03-27T12:00:00Z")), at("2027-03-28T05:00:00Z"));
  });

  it("cada día del año dura lo que va de unas 7:00 a las siguientes", () => {
    for (let day = "2026-08-01"; day <= "2027-08-01"; day = addDays(day, 1)) {
      const start = challengeStart(day);
      assert.equal(challengeDay(start), day);
      assert.equal(challengeDay(start - 1), addDays(day, -1));
    }
  });

  it("cuenta atrás legible", () => {
    assert.equal(formatCountdown(3 * 3_600_000 + 12 * 60_000 + 59_000), "3 h 12 min");
    assert.equal(formatCountdown(2 * 3_600_000), "2 h");
    assert.equal(formatCountdown(12 * 60_000), "12 min");
    assert.equal(formatCountdown(30_000), "menos de 1 min");
    assert.equal(formatCountdown(-5), "menos de 1 min");
  });
});

describe("retos y puntos", () => {
  it("el tope diario es el de la Tarea 8.6: 60 + 20 + 20", () => {
    assert.deepEqual(
      CHALLENGES.map((c) => c.maxPoints),
      [60, 20, 20]
    );
    assert.equal(DAILY_MAX_POINTS, 100);
  });

  it("divisiones en orden, de Rookie a Hall of Fame, desde 0 de ELO", () => {
    assert.deepEqual(
      DIVISIONS.map((d) => d.name),
      ["Rookie", "Sexto Hombre", "Titular", "All-Star", "MVP", "Hall of Fame"]
    );
    assert.equal(DIVISIONS[0].from, 0);
    for (let i = 1; i < DIVISIONS.length; i++) assert.ok(DIVISIONS[i].from > DIVISIONS[i - 1].from);
  });

  it("división, lo que falta y el avance (por ELO)", () => {
    assert.deepEqual(divisionOf(0), { division: DIVISIONS[0], rank: 1, next: DIVISIONS[1], toNext: 400, progress: 0 });
    const titular = divisionOf(950);
    assert.equal(titular.division.name, "Titular");
    assert.equal(titular.rank, 3);
    assert.equal(titular.toNext, 1_100 - 950);
    assert.equal(divisionOf(800).division.name, "Titular");
    assert.equal(divisionOf(799).division.name, "Sexto Hombre");
    const hall = divisionOf(2_500);
    assert.equal(hall.division.name, "Hall of Fame");
    assert.equal(hall.next, null);
    assert.equal(hall.toNext, 0);
    assert.equal(hall.progress, 1);
    assert.equal(divisionOf(-50).division.name, "Rookie");
  });

  it("con más ELO nunca se está en una división más baja", () => {
    let last = 0;
    for (let p = 0; p <= 3_000; p += 7) {
      const { rank } = divisionOf(p);
      assert.ok(rank >= last);
      last = rank;
    }
  });
});

const result = (day: string, game: ChallengeResult["game"], points: number, rows: string[] = ["oox"]): ChallengeResult => ({ day, game, points, rows });

describe("resultados guardados", () => {
  it("un reto cuenta una vez al día: se queda el primero", () => {
    const one = addResult(EMPTY_PROGRESS, result("2026-11-26", "mas-o-menos", 42));
    const again = addResult(one, result("2026-11-26", "mas-o-menos", 60));
    assert.equal(again, one);
    assert.equal(totalPoints(again), 42);
    const other = addResult(one, result("2026-11-26", "adivina", 15));
    assert.equal(totalPoints(other), 57);
  });

  it("los puntos solo suman: nada negativo, decimal ni por encima del tope del reto", () => {
    let progress = EMPTY_PROGRESS;
    progress = addResult(progress, result("2026-11-26", "adivina", -10));
    progress = addResult(progress, result("2026-11-26", "adivina", 12.5));
    progress = addResult(progress, result("2026-11-26", "adivina", 21));
    assert.equal(progress, EMPTY_PROGRESS);
    progress = addResult(progress, result("2026-11-26", "adivina", 20));
    assert.equal(totalPoints(progress), 20);
  });

  it("parseProgress no se fía de lo guardado", () => {
    assert.deepEqual(parseProgress(null), EMPTY_PROGRESS);
    assert.deepEqual(parseProgress("{roto"), EMPTY_PROGRESS);
    assert.deepEqual(parseProgress('{"results": 3}'), EMPTY_PROGRESS);
    const raw = JSON.stringify({
      v: 1,
      results: [
        result("2026-11-27", "carrera", 10, ["ox", "bad", "c"]),
        result("2026-11-26", "mas-o-menos", 42),
        result("2026-11-26", "mas-o-menos", 60),
        { day: "ayer", game: "adivina", points: 5, rows: [] },
        { day: "2026-11-26", game: "porra", points: 5, rows: [] },
        { day: "2026-11-26", game: "adivina", points: 999, rows: [] },
      ],
    });
    const progress = parseProgress(raw);
    assert.deepEqual(progress.results, [result("2026-11-26", "mas-o-menos", 42), result("2026-11-27", "carrera", 10, ["ox", "c"])]);
    assert.deepEqual(parseProgress(serializeProgress(progress)), progress);
  });

  it("récord del modo infinito: solo sube, se guarda con lo demás y no se fía de lo guardado", () => {
    const one = addResult(addEndless(EMPTY_PROGRESS, 12), result("2026-11-26", "mas-o-menos", 42));
    assert.equal(one.endless, 12);
    assert.equal(addEndless(one, 9), one);
    assert.equal(addEndless(one, 2.5), one);
    assert.equal(addEndless(one, 20).endless, 20);
    assert.deepEqual(parseProgress(serializeProgress(one)), one);
    assert.equal(parseProgress('{"results": [], "endless": -3}').endless, 0);
    assert.equal(parseProgress('{"results": [], "endless": 1e9}').endless, 0);
    assert.equal(parseProgress('{"results": []}').endless, 0);
  });

  it("partida de hoy (Adivina): solo el número, una por reto, y no se fía de lo guardado", () => {
    const id = "0f8fad5b-d9cb-469f-a165-70867728950e";
    const one = addRun(EMPTY_PROGRESS, "adivina", { day: "2026-11-26", run: id });
    assert.equal(openRun(one, "adivina", "2026-11-26"), id);
    assert.equal(openRun(one, "adivina", "2026-11-27"), null);
    assert.equal(openRun(one, "carrera", "2026-11-26"), null);
    assert.equal(addRun(one, "adivina", { day: "2026-11-26", run: id }), one);
    assert.equal(addRun(one, "adivina", { day: "2026-11-26", run: "no-es-un-uuid" }), one);
    const later = addRun(one, "adivina", { day: "2026-11-27", run: id });
    assert.deepEqual(later.runs, { adivina: { day: "2026-11-27", run: id } });
    assert.deepEqual(parseProgress(serializeProgress(later)), later);
    const raw = JSON.stringify({ results: [], runs: { adivina: { day: "ayer", run: id }, porra: { day: "2026-11-26", run: id }, carrera: { day: "2026-11-26", run: id, extra: 1 } } });
    assert.deepEqual(parseProgress(raw).runs, { carrera: { day: "2026-11-26", run: id } });
  });
});

/** Días seguidos desde `from`. */
const run = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i));

describe("racha con escudo", () => {
  const TODAY = "2026-11-26";

  it("sin jugar, sin racha", () => {
    assert.deepEqual(streakOf([], TODAY), { days: 0, shields: 0, best: 0, playedToday: false, saved: [] });
  });

  it("hoy sin jugar no rompe la racha: hay hasta las 7:00 de mañana", () => {
    const streak = streakOf(run("2026-11-23", 3), TODAY);
    assert.equal(streak.days, 3);
    assert.equal(streak.playedToday, false);
  });

  it("un día sin jugar y sin escudo la deja a cero", () => {
    const streak = streakOf([...run("2026-11-20", 3), ...run("2026-11-24", 3)], TODAY);
    assert.equal(streak.days, 3);
    assert.equal(streak.best, 3);
    assert.equal(streak.playedToday, true);
  });

  it("cada 7 días seguidos, un escudo, y el escudo salva un día sin jugar", () => {
    const week = run("2026-11-12", 7); // del 12 al 18
    assert.equal(streakOf(week, "2026-11-18").shields, 1);
    // El 19 no juega: el escudo lo salva y la racha sigue (sin sumar ese día)
    const streak = streakOf([...week, ...run("2026-11-20", 7)], TODAY);
    assert.deepEqual(streak.saved, ["2026-11-19"]);
    assert.equal(streak.days, 14);
    assert.equal(streak.shields, 1); // gastó uno y ganó otro al llegar a 14
  });

  it("como mucho dos escudos guardados", () => {
    const streak = streakOf(run("2026-10-01", 40), "2026-11-09");
    assert.equal(streak.days, 40);
    assert.equal(streak.shields, MAX_SHIELDS);
  });

  it("dos días sin jugar gastan dos escudos; el tercero la rompe", () => {
    const base = run("2026-10-01", 14); // hasta el 14-oct: dos escudos
    const saved = streakOf([...base, "2026-10-17"], "2026-10-17");
    assert.deepEqual(saved.saved, ["2026-10-15", "2026-10-16"]);
    assert.equal(saved.days, 15);
    assert.equal(saved.shields, 0);
    const broken = streakOf([...base, "2026-10-18"], "2026-10-18");
    assert.equal(broken.days, 1);
    assert.equal(broken.best, 14);
    assert.deepEqual(broken.saved, []);
  });

  it("lo que diga ser de un día futuro no cuenta", () => {
    const streak = streakOf(["2026-11-25", "2026-11-26", "2026-11-27", "2027-01-01"], TODAY);
    assert.equal(streak.days, 2);
  });
});

describe("resultado en emojis", () => {
  it("cada reto con sus marcas y sus puntos, la racha y el enlace", () => {
    const text = shareText({
      day: "2026-11-26",
      results: [result("2026-11-26", "adivina", 15, ["xxc", "ooo"]), result("2026-11-26", "mas-o-menos", 42, ["ooxooc"])],
      streakDays: 14,
      url: "https://hoopmeter.com/juegos",
    });
    assert.equal(
      text,
      [
        "Hoopmeter · Retos del jueves 26 nov",
        "",
        "¿Más o menos? · 42/60",
        "🟩🟩🟥🟩🟩🟨",
        "",
        "Adivina el jugador · 15/20",
        "🟥🟥🟨",
        "🟩🟩🟩",
        "",
        "57 puntos · 🔥 14 días",
        "https://hoopmeter.com/juegos",
      ].join("\n")
    );
  });

  it("sin racha no la menciona, y un punto en singular", () => {
    const text = shareText({ day: "2026-11-26", results: [result("2026-11-26", "carrera", 1, ["x"])], streakDays: 0, url: "u" });
    assert.match(text, /\n1 punto\nu$/);
  });
});
