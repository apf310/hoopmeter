// Tests del modo diferido (Tarea 6.13). Se lanzan con `npm test`.
// La reconstrucción se validó además con 14 partidos reales de 2026-27 (5 con prórroga): cortados al
// final coinciden con el boxscore oficial en todas las cifras, +/- incluido, y en los minutos (±1 s).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDeferredDetail, happenedBy } from "./deferred.ts";
import { DEFERRED_START, parsePosition, positionLabel, stepPosition, type DeferredPosition } from "./deferred-position.ts";
import type { GameDetail } from "./game-detail.ts";
import type { RawAction, RawBoxscoreGame, RawPlayer, RawTeam } from "./game-pbp.ts";

const AWAY = 1;
const HOME = 2;

const at = (period: number, remaining: number): DeferredPosition => ({ period, remaining });

describe("posición y pasos", () => {
  it("+1 min avanza el reloj y del final de un periodo entra un minuto en el siguiente", () => {
    assert.deepEqual(stepPosition(DEFERRED_START, 1), at(1, 660));
    assert.deepEqual(stepPosition(at(1, 30), 1), at(1, 0));
    assert.deepEqual(stepPosition(at(1, 0), 1), at(2, 660));
    // Del final del 4.º se puede pasar a la prórroga (sin saber si la hubo)
    assert.deepEqual(stepPosition(at(4, 0), 1), at(5, 240));
    assert.deepEqual(stepPosition(at(14, 0), 1), at(14, 0));
  });

  it("−1 min retrocede y no pasa del salto inicial", () => {
    assert.deepEqual(stepPosition(at(3, 360), -1), at(3, 420));
    assert.deepEqual(stepPosition(at(3, 690), -1), at(3, 720));
    assert.deepEqual(stepPosition(at(2, 720), -1), at(1, 60));
    assert.deepEqual(stepPosition(at(5, 300), -1), at(4, 60));
    assert.deepEqual(stepPosition(DEFERRED_START, -1), DEFERRED_START);
  });

  it("solo acepta posiciones que existen", () => {
    assert.deepEqual(parsePosition("3", "360"), at(3, 360));
    assert.deepEqual(parsePosition("5", "300"), at(5, 300));
    for (const [p, s] of [
      ["0", "100"],
      ["15", "100"],
      ["3", "721"],
      ["5", "301"],
      ["3", "-1"],
      ["3", "6.5"],
      ["x", "1"],
      [null, "1"],
      ["3", null],
    ] as const) {
      assert.equal(parsePosition(p, s), null, `${p}/${s}`);
    }
  });

  it("etiquetas en español", () => {
    assert.equal(positionLabel(at(3, 360)), "3.er cuarto · 6:00");
    assert.equal(positionLabel(at(2, 720)), "2.º cuarto · 12:00");
    assert.equal(positionLabel(at(4, 0)), "Fin del 4.º cuarto");
    assert.equal(positionLabel(at(5, 0)), "Fin de la prórroga");
    assert.equal(positionLabel(at(6, 45)), "2.ª prórroga · 0:45");
  });
});

// --- Partido sintético ---

const iso = (clock: string) => {
  const [m, s] = clock.split(":");
  return `PT${m.padStart(2, "0")}M${s.padStart(2, "0")}.00S`;
};

let order = 0;
function act(period: number, clock: string, actionType: string, score: [away: number, home: number], extra: Partial<RawAction> = {}): RawAction {
  order += 1;
  return {
    actionNumber: order,
    orderNumber: order * 10,
    clock: iso(clock),
    period,
    actionType,
    scoreAway: String(score[0]),
    scoreHome: String(score[1]),
    ...extra,
  };
}

const shot = (period: number, clock: string, type: "2pt" | "3pt", teamId: number, personId: number, score: [number, number], extra: Partial<RawAction> = {}) =>
  act(period, clock, type, score, { teamId, personId, playerNameI: `J${personId}`, shotResult: "Made", isFieldGoal: 1, xLegacy: 0, yLegacy: 50, ...extra });

const sub = (period: number, clock: string, teamId: number, personId: number, subType: "in" | "out", score: [number, number]) =>
  act(period, clock, "substitution", score, { teamId, personId, subType });

/** Hasta el 3.er cuarto con 6:00 por jugar, igual en los dos partidos de prueba. */
function commonActions(): RawAction[] {
  return [
    act(1, "12:00", "period", [0, 0], { subType: "start" }),
    shot(1, "11:30", "2pt", AWAY, 11, [2, 0], { assistPersonId: 12, assistPlayerNameInitial: "J12" }),
    act(1, "10:00", "foul", [2, 0], { teamId: HOME, personId: 21, subType: "personal", foulDrawnPersonId: 13 }),
    act(1, "10:00", "freethrow", [3, 0], { teamId: AWAY, personId: 13, subType: "1 of 2", shotResult: "Made" }),
    // Cambio entre tiro y tiro: el 2.º libre cuenta para los que estaban al cometerse la falta
    sub(1, "10:00", AWAY, 11, "out", [3, 0]),
    sub(1, "10:00", AWAY, 16, "in", [3, 0]),
    act(1, "10:00", "freethrow", [4, 0], { teamId: AWAY, personId: 13, subType: "2 of 2", shotResult: "Made" }),
    shot(1, "9:00", "3pt", HOME, 22, [4, 3]),
    act(1, "8:00", "turnover", [4, 3], { teamId: AWAY, subType: "shot clock", qualifiers: ["team"] }),
    shot(3, "6:30", "2pt", HOME, 23, [4, 5]),
  ];
}

/** Lo que pasa después del corte: en un partido acaba en el 4.º, en el otro hay prórroga. */
function laterActions(overtime: boolean): RawAction[] {
  const actions = [
    // Justo con el reloj en 6:00: aún no ha pasado en esa posición
    shot(3, "6:00", "2pt", HOME, 24, [4, 7]),
    sub(3, "5:00", HOME, 26, "in", [4, 7]),
    shot(4, "1:00", "3pt", AWAY, 16, overtime ? [7, 7] : [7, 9]),
    act(4, "0:00", "period", overtime ? [7, 7] : [7, 9], { subType: "end" }),
  ];
  if (overtime) {
    actions.push(shot(5, "2:00", "2pt", AWAY, 12, [9, 7]), act(5, "0:00", "period", [9, 7], { subType: "end" }));
  }
  actions.push(act(overtime ? 5 : 4, "0:00", "game", overtime ? [9, 7] : [7, 9], { subType: "end" }));
  return actions;
}

function player(personId: number, starter: boolean, extra: Partial<RawPlayer> = {}): RawPlayer {
  return {
    personId,
    name: `Jugador ${personId}`,
    nameI: `J${personId}`,
    jerseyNum: String(personId),
    starter: starter ? "1" : "0",
    oncourt: "0",
    played: "1",
    status: "ACTIVE",
    // Cifras finales de la NBA: nunca deben llegar a la ficha en diferido
    statistics: { points: 99, plusMinusPoints: 99, foulsDrawn: 9, minutes: "PT48M00.00S" } as RawPlayer["statistics"],
    ...extra,
  };
}

function team(teamId: number, score: number, periods: number[], players: RawPlayer[]): RawTeam {
  return {
    teamId,
    teamName: teamId === AWAY ? "Visitantes" : "Locales",
    teamCity: "Ciudad",
    teamTricode: teamId === AWAY ? "VIS" : "LOC",
    score,
    inBonus: "1",
    timeoutsRemaining: 2,
    periods: periods.map((s, i) => ({ period: i + 1, score: s })),
    players,
    statistics: { points: score, leadChanges: 9, timesTied: 9, biggestLead: 30 } as RawTeam["statistics"],
  };
}

function makeGame(overtime: boolean): { game: RawBoxscoreGame; actions: RawAction[] } {
  order = 0;
  const away = [11, 12, 13, 14, 15].map((id) => player(id, true));
  away.push(player(16, false));
  away.push(
    player(17, false, {
      played: "0",
      status: "INACTIVE",
      notPlayingReason: "INACTIVE_INJURY",
      notPlayingDescription: "Left Knee; Soreness",
    })
  );
  const home = [21, 22, 23, 24, 25].map((id) => player(id, true));
  // El 26 entra después del corte en un partido y no juega en el otro: no puede notarse
  home.push(player(26, false, overtime ? {} : { played: "0", notPlayingReason: "DNP_COACH" }));

  const game: RawBoxscoreGame = {
    gameId: "0022600999",
    gameStatus: 3,
    gameStatusText: "Final",
    period: overtime ? 5 : 4,
    gameClock: "PT00M00.00S",
    regulationPeriods: 4,
    duration: overtime ? 160 : 135,
    attendance: 18000,
    arena: { arenaName: "Pabellón", arenaCity: "Ciudad" },
    officials: [{ name: "Árbitro" }],
    awayTeam: team(AWAY, overtime ? 9 : 7, overtime ? [4, 0, 0, 3, 2] : [4, 0, 0, 3], away),
    homeTeam: team(HOME, overtime ? 7 : 9, overtime ? [3, 0, 4, 0, 0] : [3, 0, 4, 2], home),
  };
  return { game, actions: [...commonActions(), ...laterActions(overtime)] };
}

const withoutTimestamp = (detail: GameDetail) => ({ ...detail, fetchedAt: "" });

describe("buildDeferredDetail", () => {
  const position = at(3, 360);
  const regular = makeGame(false);
  const withOvertime = makeGame(true);
  const detail = buildDeferredDetail(regular.game, regular.actions, position);

  it("nada posterior al instante elegido se cuela: dos partidos iguales hasta ahí dan la misma ficha", () => {
    const other = buildDeferredDetail(withOvertime.game, withOvertime.actions, position);
    assert.deepEqual(withoutTimestamp(detail), withoutTimestamp(other));
  });

  it("ni estado final, ni duración, ni prórroga, ni la jugada de 6:00", () => {
    assert.equal(detail.status, "Live");
    assert.equal(detail.durationMin, null);
    assert.equal(detail.length, 48 * 60);
    assert.equal(detail.elapsed, 2 * 12 * 60 + 6 * 60);
    assert.equal(detail.periodText, "3.er cuarto · 6:00");
    assert.ok(detail.plays.every((p) => p.period < 3 || (p.period === 3 && p.clock !== "6:00")));
    assert.ok(!detail.plays.some((p) => p.text === "Final del partido"));
    assert.equal(detail.away.timeoutsRemaining, null);
    assert.equal(detail.away.inBonus, false);
  });

  it("marcador, parciales y líder hasta ese momento", () => {
    assert.equal(detail.away.score, 4);
    assert.equal(detail.home.score, 5);
    assert.deepEqual(detail.away.periods, [4, 0, 0]);
    assert.deepEqual(detail.home.periods, [3, 0, 2]);
    assert.equal(detail.leadChanges, 1);
    assert.equal(detail.timesTied, 0);
    assert.equal(detail.away.totals.biggestLead, 4);
    // El visitante manda de 11:30 del 1.º a 6:30 del 3.º; el local, los últimos 30 s
    assert.equal(detail.away.totals.timeLeadingS, 1770 - 30);
    assert.equal(detail.home.totals.timeLeadingS, 30);
  });

  it("boxscore rehecho: minutos, +/- de los tiros libres, asistencias y pérdidas de equipo", () => {
    const line = (id: number) => [...detail.away.players, ...detail.home.players].find((p) => p.id === id)!;
    assert.equal(line(11).seconds, 120);
    assert.equal(line(16).seconds, 1800 - 120);
    assert.equal(line(12).seconds, 1800);
    // El 11 sale entre los dos libres: los dos cuentan para él; el 16, que entra, no suma ninguno
    assert.equal(line(11).plusMinus, 4);
    assert.equal(line(16).plusMinus, -5);
    assert.equal(line(13).pts, 2);
    assert.equal(line(13).ftm, 2);
    assert.equal(line(13).foulsDrawn, 1);
    assert.equal(line(12).ast, 1);
    assert.equal(line(21).pf, 1);
    assert.equal(detail.away.totals.tov, 1);
    assert.equal(line(16).onCourt, true);
    assert.equal(line(11).onCourt, false);
  });

  it("bajas: solo las anunciadas antes del partido; el resto, sin minutos por ahora", () => {
    const injured = detail.away.players.find((p) => p.id === 17)!;
    assert.equal(injured.played, false);
    assert.equal(injured.absence, "Lesión");
    assert.equal(injured.absenceDetail, "rodilla izquierda (molestias)");
    const bench = detail.home.players.find((p) => p.id === 26)!;
    assert.equal(bench.played, false);
    assert.equal(bench.absence, "Sin minutos");
  });

  it("la jugada con el reloj justo en la posición entra al pasar de ese segundo", () => {
    const later = buildDeferredDetail(regular.game, regular.actions, at(3, 300));
    assert.equal(later.home.score, 7);
    const start = regular.actions.find((a) => a.actionType === "period")!;
    assert.equal(happenedBy(start, DEFERRED_START), false);
    const breakSub = sub(2, "12:00", AWAY, 11, "in", [4, 3]);
    assert.equal(happenedBy(breakSub, at(2, 720)), true);
    assert.equal(happenedBy(regular.actions.at(-1)!, at(4, 0)), true);
  });
});
