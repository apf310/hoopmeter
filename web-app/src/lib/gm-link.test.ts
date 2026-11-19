// Tests del traspaso en la URL del GM (Tarea 6.9). Se lanzan con `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseTradeSearch, restoreTrade, tradeSearch } from "./gm-link.ts";
import type { GmPlayer, GmTeam, TradeRequest } from "./gm.ts";

const LAL = 1610612747;
const BOS = 1610612738;
const MIA = 1610612748;

const team = (id: number, name: string) => ({ id, name, abbreviation: name.slice(0, 3).toUpperCase() }) as GmTeam;
const player = (id: number, name: string, teamId: number, salaryStatus: GmPlayer["salaryStatus"] = "confirmed") =>
  ({ id, name, teamId, salaryStatus }) as GmPlayer;

const data = {
  teams: [team(LAL, "Lakers"), team(BOS, "Celtics"), team(MIA, "Heat")],
  players: [player(2544, "LeBron James", LAL), player(1628369, "Jayson Tatum", BOS), player(99, "Novato", BOS, "pending")],
};
const rules = { pickYears: [2027, 2028], isValidEstimate: (salary: number) => salary >= 1_000_000 && salary <= 50_000_000 };

const request: TradeRequest = {
  teamIds: [LAL, BOS],
  players: [
    { id: 1628369, to: LAL },
    { id: 2544, to: BOS },
    { id: 99, to: LAL },
  ],
  picks: [{ teamId: LAL, year: 2028, round: 1, to: BOS }],
  estimates: [{ id: 99, salary: 5_000_000 }],
};

describe("tradeSearch y parseTradeSearch", () => {
  it("solo lleva ids y vuelve al mismo traspaso", () => {
    const search = tradeSearch(request);
    assert.equal(
      search,
      `?equipos=${LAL},${BOS}&jugadores=99-${LAL},2544-${BOS},1628369-${LAL}&rondas=${LAL}-2028-1-${BOS}&estimaciones=99-5000000`
    );
    const parsed = parseTradeSearch(new URLSearchParams(search));
    assert.deepEqual(new Set(parsed!.players.map(({ id }) => id)), new Set([99, 2544, 1628369]));
    assert.deepEqual(parsed!.picks, request.picks);
    assert.deepEqual(parsed!.estimates, request.estimates);
  });

  it("el mismo traspaso montado en otro orden da el mismo enlace", () => {
    assert.equal(tradeSearch(request), tradeSearch({ ...request, players: [...request.players].reverse() }));
  });

  it("sin equipos no hay enlace", () => {
    assert.equal(tradeSearch({ teamIds: [], players: [], picks: [] }), "");
    assert.equal(parseTradeSearch({ jugador: "2544" }), null);
  });

  it("guarda la elección a medias (un solo equipo)", () => {
    assert.deepEqual(parseTradeSearch({ equipos: String(LAL) }), { teamIds: [LAL], players: [], picks: [], estimates: [] });
  });

  it("descarta los enlaces mal formados", () => {
    assert.equal(parseTradeSearch({ equipos: "abc" }), null);
    assert.equal(parseTradeSearch({ equipos: `${LAL},${BOS},${MIA},1` }), null);
    assert.equal(parseTradeSearch({ equipos: `${LAL},${BOS}`, jugadores: "2544" }), null);
    assert.equal(parseTradeSearch({ equipos: `${LAL},${BOS}`, jugadores: "2544--1" }), null);
    assert.equal(parseTradeSearch({ equipos: `${LAL},${BOS}`, rondas: `${LAL}-2028-${BOS}` }), null);
    assert.equal(parseTradeSearch({ equipos: `${LAL},${BOS}`, jugadores: Array(21).fill(`2544-${BOS}`).join(",") }), null);
  });
});

describe("restoreTrade", () => {
  it("un traspaso que se puede montar llega entero y sin avisos", () => {
    assert.deepEqual(restoreTrade(data, request, rules), { request, dropped: [] });
  });

  it("equipos repetidos o inexistentes: no hay traspaso", () => {
    assert.equal(restoreTrade(data, { ...request, teamIds: [LAL, LAL] }, rules), null);
    assert.equal(restoreTrade(data, { ...request, teamIds: [LAL, 1] }, rules), null);
  });

  it("quita al jugador que ha cambiado de equipo o ya no tiene contrato, y lo explica", () => {
    const moved = { ...data, players: [player(2544, "LeBron James", MIA), player(1628369, "Jayson Tatum", BOS)] };
    const restored = restoreTrade(moved, { ...request, estimates: [] }, rules)!;
    assert.deepEqual(restored.request.players, [{ id: 1628369, to: LAL }]);
    assert.deepEqual(restored.dropped, ["LeBron James ahora juega en Heat.", "Un jugador del traspaso ya no tiene contrato en la NBA."]);
  });

  it("quien ya juega en el equipo de destino sale del traspaso", () => {
    const moved = { ...data, players: [player(2544, "LeBron James", BOS)] };
    const restored = restoreTrade(moved, { ...request, players: [{ id: 2544, to: BOS }], estimates: [] }, rules)!;
    assert.deepEqual(restored.request.players, []);
    assert.deepEqual(restored.dropped, ["LeBron James ahora juega en Celtics."]);
  });

  it("quita las rondas que ya no se pueden traspasar (cambio de temporada)", () => {
    const restored = restoreTrade(data, { ...request, picks: [{ teamId: LAL, year: 2026, round: 1, to: BOS }] }, rules)!;
    assert.deepEqual(restored.request.picks, []);
    assert.deepEqual(restored.dropped, ["La 1ª ronda de 2026 de Lakers ya no se puede traspasar."]);
  });

  it("la estimación cede ante la cifra real y no se acepta fuera de rango", () => {
    const signed = { ...data, players: data.players.map((p) => (p.id === 99 ? { ...p, salaryStatus: "confirmed" as const } : p)) };
    const restored = restoreTrade(signed, request, rules)!;
    assert.deepEqual(restored.request.estimates, []);
    assert.match(restored.dropped[0], /Novato ya tiene cifra pública/);

    const tooHigh = restoreTrade(data, { ...request, estimates: [{ id: 99, salary: 999_000_000 }] }, rules)!;
    assert.deepEqual(tooHigh.request.estimates, []);
    assert.match(tooHigh.dropped[0], /no era válida/);
  });

  it("ignora en silencio lo que el editor nunca genera (repetidos, destinos fuera del traspaso)", () => {
    const restored = restoreTrade(
      data,
      {
        teamIds: [LAL, BOS],
        players: [{ id: 2544, to: BOS }, { id: 2544, to: BOS }, { id: 1628369, to: MIA }],
        picks: [{ teamId: LAL, year: 2028, round: 1, to: LAL }],
        estimates: [{ id: 1628369, salary: 5_000_000 }],
      },
      rules
    )!;
    assert.deepEqual(restored.request, { teamIds: [LAL, BOS], players: [{ id: 2544, to: BOS }], picks: [], estimates: [] });
    assert.deepEqual(restored.dropped, []);
  });
});
