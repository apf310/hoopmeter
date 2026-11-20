// Tests de la línea de tiempo del vídeo del partido (Tarea 6.15). Se lanzan con `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FlowPoint, Shot } from "./game-detail.ts";
import { clockOf, frameAt, shotSeconds, VIDEO_DURATION, VIDEO_INTRO, VIDEO_PLAY_END, videoClock, type VideoGame } from "./game-video.ts";

function shot(period: number, clock: string, made = true): Shot {
  return { x: 0, y: 0, made, three: false, zone: "ra", teamId: 1, playerId: 10, period, clock, text: "" };
}

/** Partido de 48 min: visitante 2-0 al minuto 1, local 2-2 al final del 1.º, 3-2 en el último segundo. */
function game(overrides: Partial<VideoGame> = {}): VideoGame {
  const flow: FlowPoint[] = [
    [0, 0, 0],
    [60, 2, 0],
    [720, 2, 2],
    [2879, 3, 2],
  ];
  return {
    status: "Final",
    periodText: null,
    regulationPeriods: 4,
    flow,
    shots: [shot(1, "11:00"), shot(1, "0:00", true), shot(4, "0:01", false)],
    elapsed: 2880,
    length: 2880,
    away: { id: 1, score: 3, periods: [2, 0, 0, 1] },
    home: { id: 2, score: 2, periods: [2, 0, 0, 0] },
    excitementScore: 7.4,
    ...overrides,
  };
}

describe("reloj del vídeo", () => {
  it("el reloj del tiro se pasa a segundos de juego, también en la prórroga", () => {
    assert.equal(shotSeconds(shot(1, "11:00"), 4), 60);
    assert.equal(shotSeconds(shot(4, "0:00"), 4), 2880);
    assert.equal(shotSeconds(shot(5, "4:30"), 4), 2910);
  });

  it("el final de un periodo es su 0:00, no el 12:00 del siguiente", () => {
    assert.deepEqual(clockOf(720, 4), { period: 1, clock: "0:00" });
    assert.deepEqual(clockOf(721, 4), { period: 2, clock: "11:59" });
    assert.deepEqual(clockOf(2880 + 300, 4), { period: 5, clock: "0:00" });
  });

  it("de juego a vídeo y vuelta da lo mismo, y los últimos 5 min van más despacio", () => {
    const clock = videoClock({ elapsed: 2880, regulationPeriods: 4 });
    for (const s of [0, 100, 2580, 2700, 2880]) assert.ok(Math.abs(clock.gameAt(clock.videoAt(s)) - s) < 1e-6);
    assert.equal(clock.videoAt(0), VIDEO_INTRO);
    assert.equal(clock.videoAt(2880), VIDEO_PLAY_END);
    const firstFive = clock.videoAt(300) - clock.videoAt(0);
    const lastFive = clock.videoAt(2880) - clock.videoAt(2580);
    assert.ok(lastFive > 2 * firstFive);
  });
});

describe("fotogramas", () => {
  it("la presentación empieza 0-0 y sin tiros", () => {
    const frame = frameAt(game(), 0);
    assert.equal(frame.phase, "intro");
    assert.deepEqual([frame.away, frame.home, frame.shots.length], [0, 0, 0]);
    assert.deepEqual(frame.clock, "12:00");
  });

  it("el marcador y los tiros avanzan con el reloj del partido, nunca hacia atrás", () => {
    const g = game();
    let last = { away: 0, home: 0, shots: 0, seconds: 0 };
    for (let t = 0; t <= VIDEO_DURATION; t += 1 / 30) {
      const f = frameAt(g, t);
      assert.ok(f.away >= last.away && f.home >= last.home && f.shots.length >= last.shots && f.gameSeconds >= last.seconds);
      last = { away: f.away, home: f.home, shots: f.shots.length, seconds: f.gameSeconds };
    }
  });

  it("cuarto a cuarto: solo los periodos empezados, con los puntos de cada uno", () => {
    const g = game();
    const clock = videoClock(g);
    const second = frameAt(g, clock.videoAt(800));
    assert.equal(second.period, 2);
    assert.deepEqual(second.periods, { away: [2, 0], home: [2, 0] });
  });

  it("el final congelado enseña las cifras oficiales y todos los tiros", () => {
    const frame = frameAt(game({ away: { id: 1, score: 4, periods: [2, 0, 0, 2] } }), VIDEO_DURATION);
    assert.equal(frame.phase, "final");
    assert.equal(frame.away, 4);
    assert.deepEqual(frame.periods.away, [2, 0, 0, 2]);
    assert.equal(frame.shots.length, 3);
    assert.equal(frame.outro, 1);
  });

  it("en directo el vídeo acaba donde va el partido", () => {
    const g = game({ status: "Live", elapsed: 1500, shots: [shot(1, "11:00"), shot(3, "8:00")] });
    const frame = frameAt(g, VIDEO_PLAY_END - 0.001);
    assert.ok(frame.gameSeconds <= 1500 && frame.gameSeconds > 1490);
    assert.equal(frame.period, 3);
    assert.equal(frameAt(g, VIDEO_DURATION).clock, "11:00");
  });
});
