// Tests de la probabilidad de victoria (Tarea 7.2). Se lanzan con `npm test`.
// Contrastada además con 8 partidos reales de 2026-27 (uno con prórroga): en cada segundo, la misma
// probabilidad que `probability_path` de excitement_calculator.py (diferencia < 1e-7) y el mismo `decided_left`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FlowPoint, GameDetail, Play } from "./game-detail.ts";
import { chancePair, drawableCurve, gameWinProbability, secondsLeft, winProbability } from "./win-probability.ts";

const AWAY = 1;
const HOME = 2;

type Basket = [period: number, clock: string, side: "away" | "home", points: number, playerId: number];

const seconds = (period: number, clock: string) => {
  const [m, s] = clock.split(":").map(Number);
  const start = Math.min(period - 1, 4) * 720 + Math.max(0, period - 5) * 300;
  return start + (period <= 4 ? 720 : 300) - (m * 60 + s);
};

/** Ficha mínima con unas canastas. `end`: último periodo terminado (añade su jugada de "Termina…"). */
function game(baskets: Basket[], elapsed: number, { status = "Live", end }: { status?: GameDetail["status"]; end?: number } = {}) {
  const flow: FlowPoint[] = [[0, 0, 0]];
  const plays: Play[] = [];
  let away = 0;
  let home = 0;
  baskets.forEach(([period, clock, side, points, playerId], i) => {
    if (side === "away") away += points;
    else home += points;
    flow.push([seconds(period, clock), away, home]);
    plays.push({
      id: i + 1,
      period,
      clock,
      teamId: side === "away" ? AWAY : HOME,
      playerId,
      involved: [playerId],
      kind: "score",
      points,
      total: null,
      text: points === 1 ? `J${playerId} anota el tiro libre` : `Canasta de J${playerId}`,
      away,
      home,
    });
  });
  if (end) plays.push({ id: 999, period: end, clock: "0:00", teamId: null, playerId: null, involved: [], kind: "period", points: 0, total: null, text: "Termina", away, home });
  const players = (ids: number[]) => ids.map((id) => ({ id, short: `J${id}` }));
  return { status, regulationPeriods: 4, flow, plays, elapsed, away: { id: AWAY, players: players([11, 12]) }, home: { id: HOME, players: players([21, 22]) } };
}

describe("modelo", () => {
  it("los mismos valores que excitement_calculator.win_probability", () => {
    for (const [margin, left, expected] of [
      [0, 2880, 0.554487],
      [-7, 1440, 0.328344],
      [5, 600, 0.744228],
      [-3, 30, 0.095567],
      [1, 0, 0.776773],
      [0, 0, 0.5],
      [20, 300, 0.999619],
    ]) {
      assert.ok(Math.abs(winProbability(margin, left) - expected) < 2e-6, `${margin} a falta de ${left}`);
    }
  });

  it("tiempo por jugar en el reglamento y en las prórrogas", () => {
    assert.equal(secondsLeft(2879), 1);
    assert.equal(secondsLeft(2880), 0);
    assert.equal(secondsLeft(2881), 299);
    assert.equal(secondsLeft(3180), 0);
    assert.equal(secondsLeft(3181), 299);
  });
});

describe("curva", () => {
  const baskets: Basket[] = [
    [1, "11:00", "away", 2, 11],
    [4, "0:30", "home", 3, 21],
    [4, "0:05", "away", 2, 12],
  ];

  it("llega hasta lo jugado y no da ganador mientras no se sabe", () => {
    const win = gameWinProbability(game(baskets.slice(0, 1), 100.5));
    assert.equal(win.curve.at(-1)![0], 100.5);
    assert.ok(win.curve.every(([t]) => t <= 100.5));
    assert.equal(win.winner, null);
    assert.equal(win.decidedLeft, null);
  });

  it("terminado: acaba en 0 o 1 y dice a falta de cuánto se decidió", () => {
    const win = gameWinProbability(game(baskets, 2880, { status: "Final", end: 4 }));
    assert.equal(win.winner, "away");
    assert.deepEqual(win.curve.at(-1), [2880, 0]);
    assert.ok(win.decidedLeft! > 0 && win.decidedLeft! <= 5);
    // El peor momento del ganador es el mejor del perdedor: tras el triple, a falta de 30 s o menos
    assert.ok(win.best.home.seconds >= 2850 && win.best.home.chance > 0.6);
  });

  it("jugadas corregidas que llegan al final: la curva va en orden de partido", () => {
    const g = game(baskets, 2880, { status: "Final", end: 4 });
    const win = gameWinProbability({ ...g, flow: [g.flow[0], g.flow[2], g.flow[1], g.flow[3]] });
    assert.ok(win.curve.every(([t], i) => i === 0 || t >= win.curve[i - 1][0]));
  });

  it("aligerarla conserva los extremos y las canastas", () => {
    const { curve } = gameWinProbability(game(baskets, 2880, { status: "Final", end: 4 }));
    const drawn = drawableCurve(curve, 2880);
    assert.ok(drawn.length < curve.length / 2);
    assert.deepEqual(drawn[0], curve[0]);
    assert.deepEqual(drawn.at(-1), curve.at(-1));
    assert.equal(drawn.filter(([t]) => t === 60).length >= 2, true);
  });
});

describe("jugadas clave", () => {
  it("de mayor a menor, desde el punto de vista del que anota", () => {
    const { keyPlays } = gameWinProbability(
      game(
        [
          [1, "11:00", "away", 2, 11],
          [2, "5:00", "home", 2, 21],
          [4, "0:10", "home", 3, 22],
        ],
        2875
      )
    );
    assert.equal(keyPlays.length, 3);
    assert.ok(keyPlays.every((p, i) => i === 0 || keyPlays[i - 1].after - keyPlays[i - 1].before >= p.after - p.before));
    assert.equal(keyPlays[0].playerId, 22);
    assert.equal(keyPlays[0].side, "home");
    assert.ok(keyPlays.every((p) => p.after > p.before));
  });

  it("canasta y adicional o dos libres del mismo jugador en el mismo segundo cuentan como una", () => {
    const { keyPlays } = gameWinProbability(
      game(
        [
          [4, "1:00", "home", 2, 21],
          [4, "1:00", "home", 1, 21],
          [4, "0:40", "away", 1, 11],
          [4, "0:40", "away", 1, 11],
          [4, "0:40", "home", 1, 22],
        ],
        2850
      )
    );
    assert.deepEqual(
      keyPlays.map((p) => [p.text, p.points]).sort(),
      [
        ["Canasta de J21 + tiro libre", 3],
        ["J11 anota 2 tiros libres", 2],
        ["J22 anota el tiro libre", 1],
      ]
    );
  });

  it("la canasta sobre la bocina lleva hasta el 100 %; la que fuerza la prórroga, al 50 %", () => {
    const buzzer: Basket[] = [
      [4, "1:00", "home", 2, 21],
      [4, "0:00", "away", 3, 11],
    ];
    assert.equal(gameWinProbability(game(buzzer, 2880, { status: "Final", end: 4 })).keyPlays[0].after, 1);
    const tie = gameWinProbability(game([buzzer[0], [4, "0:00", "away", 2, 11]], 2880, { end: 4 }));
    assert.equal(tie.winner, null);
    assert.ok(Math.abs(tie.keyPlays[0].after - 0.5) < 1e-6);
  });
});

describe("diferido", () => {
  const common: Basket[] = [
    [1, "11:00", "away", 2, 11],
    [4, "0:30", "home", 3, 21],
  ];

  it("solo sabe el ganador si el usuario ha llegado al final del 4.º (o de la prórroga) sin empate", () => {
    assert.equal(gameWinProbability(game(common, 2860)).winner, null);
    assert.equal(gameWinProbability(game(common, 2880, { end: 3 })).winner, null);
    assert.equal(gameWinProbability(game(common, 2880, { end: 4 })).winner, "home");
    // Empate al final del 4.º: 50 %, sin decir si hubo prórroga
    const tie = gameWinProbability(game([...common, [4, "0:02", "away", 1, 12]], 2880, { end: 4 }));
    assert.equal(tie.winner, null);
    assert.ok(Math.abs(tie.curve.at(-1)![1] - 0.5) < 1e-6);
  });
});

describe("porcentajes", () => {
  it("suman 100 y solo son 0 o 100 cuando está decidido", () => {
    assert.deepEqual(chancePair(0.634), ["37", "63"]);
    assert.deepEqual(chancePair(0.999), ["<1", ">99"]);
    assert.deepEqual(chancePair(0.001), [">99", "<1"]);
    assert.deepEqual(chancePair(1), ["0", "100"]);
    assert.deepEqual(chancePair(0), ["100", "0"]);
  });
});

