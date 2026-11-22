// Tests de "Los nuestros" (Tarea 6.12). Se lanzan con `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GameMatchup } from "./game-day.ts";
import type { PlayerGameLine } from "./game-day-store.ts";
import { compactLine, shortName, spanishPlayersOfDay, type SpanishPlayer } from "./spanish-players.ts";

const DAL = 1610612742;
const BOS = 1610612738;
const LAL = 1610612747;
const OKC = 1610612760;
const MIA = 1610612748;

const ALDAMA: SpanishPlayer = { id: 1630583, name: "Santi Aldama", teamId: DAL };
const DE_LARREA: SpanishPlayer = { id: 1643547, name: "Sergio de Larrea", teamId: DAL };
const GONZALEZ: SpanishPlayer = { id: 1642864, name: "Hugo González", teamId: BOS };
const MARA: SpanishPlayer = { id: 1643530, name: "Aday Mara", teamId: OKC };

function game(id: string, utc: string, home: number, away: number): GameMatchup {
  return { id, game_datetime_utc: utc, home_team_id: home, away_team_id: away };
}

const LINE: PlayerGameLine = {
  played: true,
  absence: null,
  seconds: 1800,
  pts: 18,
  reb: 7,
  ast: 3,
  stl: 0,
  blk: 0,
  fgm: 7,
  fga: 12,
  fg3m: 2,
  fg3a: 5,
  plusMinus: 4,
};

describe("spanishPlayersOfDay", () => {
  const late = game("0022600002", "2026-11-19T03:30:00Z", LAL, DAL);
  const early = game("0022600001", "2026-11-19T00:30:00Z", BOS, MIA);

  it("solo los que tienen partido, con rival y si juegan en casa", () => {
    const result = spanishPlayersOfDay([ALDAMA, MARA, GONZALEZ], [late, early]);
    assert.deepEqual(
      result.map((r) => [r.player.id, r.game.id, r.home, r.opponentId]),
      [
        [GONZALEZ.id, early.id, true, MIA],
        [ALDAMA.id, late.id, false, LAL],
      ]
    );
  });

  it("ordena por hora del partido y, a igual hora, por apellido", () => {
    const result = spanishPlayersOfDay([DE_LARREA, ALDAMA, GONZALEZ], [late, early]);
    assert.deepEqual(
      result.map((r) => r.player.name),
      ["Hugo González", "Santi Aldama", "Sergio de Larrea"]
    );
  });

  it("jornada sin partidos de españoles: lista vacía", () => {
    assert.deepEqual(spanishPlayersOfDay([MARA], [early]), []);
    assert.deepEqual(spanishPlayersOfDay([], [early]), []);
  });
});

describe("shortName", () => {
  it("inicial y apellido (hay varios Miller en la liga)", () => {
    assert.equal(shortName("Baba Miller"), "B. Miller");
    assert.equal(shortName("Sergio de Larrea"), "S. de Larrea");
    assert.equal(shortName("Nenê"), "Nenê");
  });
});

describe("compactLine", () => {
  it("puntos, rebotes y asistencias; robos y tapones solo si los hay", () => {
    assert.equal(compactLine(LINE), "30 MIN · 18 PTS · 7 REB · 3 AST");
    assert.equal(compactLine({ ...LINE, stl: 2, blk: 1 }), "30 MIN · 18 PTS · 7 REB · 3 AST · 2 ROB · 1 TAP");
  });

  it("siempre con los minutos: un minuto sin anotar no parece un mal partido", () => {
    // Baba Miller, 19-nov-2026: 60 s en pista
    assert.equal(compactLine({ ...LINE, seconds: 60, pts: 0, reb: 0, ast: 0 }), "1 MIN · 0 PTS · 0 REB · 0 AST");
    assert.equal(compactLine({ ...LINE, seconds: 25, pts: 0, reb: 1, ast: 0 }), "<1 MIN · 0 PTS · 1 REB · 0 AST");
    assert.equal(compactLine({ ...LINE, seconds: 0, pts: 0, reb: 0, ast: 0 }), "No jugó");
  });

  it("no jugó, con el motivo si lo hay", () => {
    assert.equal(compactLine({ ...LINE, played: false, absence: "Lesión" }), "No jugó · Lesión");
    assert.equal(compactLine({ ...LINE, played: false }), "No jugó");
  });

  it("sin línea (sin empezar o fuera del boxscore): nada", () => {
    assert.equal(compactLine(null), null);
    assert.equal(compactLine(undefined), null);
  });
});
