// Tests de "Qué ver" (Tarea 6.11). Se lanzan con `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  gameOfTheWeek,
  parseTeamFilter,
  periodStart,
  rankGames,
  watchSearch,
  type ScoredGame,
} from "./what-to-watch.ts";

const LAL = 1610612747;
const BOS = 1610612738;
const ORL = 1610612753;
const MIA = 1610612748;

// La jornada es la fecha UTC del partido: basta para probar los periodos
const dayOf = (utc: string) => utc.slice(0, 10);
const TODAY = "2026-11-19";

let next = 0;
function game(day: string, score: number | null, home = BOS, away = ORL): ScoredGame {
  next += 1;
  return { id: `00226${String(next).padStart(5, "0")}`, game_datetime_utc: `${day}T00:30:00Z`, home_team_id: home, away_team_id: away, excitement_score: score };
}

describe("periodStart", () => {
  it("cuenta hoy dentro del periodo", () => {
    assert.equal(periodStart("semana", TODAY), "2026-11-13");
    assert.equal(periodStart("mes", TODAY), "2026-10-21");
    assert.equal(periodStart("temporada", TODAY), null);
  });

  it("cruza meses y años sin saltarse días", () => {
    assert.equal(periodStart("semana", "2027-01-03"), "2026-12-28");
    assert.equal(periodStart("semana", "2027-03-01"), "2027-02-23");
  });
});

describe("rankGames", () => {
  const old = game("2026-10-25", 9.9);
  const lastWeek = game("2026-11-12", 9.5);
  const weekStart = game("2026-11-13", 7.1, LAL, MIA);
  const today = game(TODAY, 8.2);
  const pending = game("2026-11-18", null);
  const future = game("2026-11-20", 9.0);
  const all = [old, lastWeek, weekStart, today, pending, future];

  it("ordena por nota y deja fuera lo que no tiene nota o aún no toca", () => {
    assert.deepEqual(rankGames(all, { period: "semana", today: TODAY, dayOf }), [today, weekStart]);
  });

  it("el mes y la temporada abarcan más jornadas", () => {
    assert.deepEqual(rankGames(all, { period: "mes", today: TODAY, dayOf }), [old, lastWeek, today, weekStart]);
    assert.deepEqual(rankGames(all, { period: "temporada", today: TODAY, dayOf }), [old, lastWeek, today, weekStart]);
  });

  it("a igual nota, primero el más reciente", () => {
    const a = game("2026-11-14", 8.0);
    const b = game("2026-11-16", 8.0);
    assert.deepEqual(rankGames([a, b], { period: "semana", today: TODAY, dayOf }), [b, a]);
  });

  it("filtra por equipos (local o visitante)", () => {
    assert.deepEqual(rankGames(all, { period: "mes", today: TODAY, dayOf, teams: new Set([MIA]) }), [weekStart]);
    assert.deepEqual(rankGames(all, { period: "mes", today: TODAY, dayOf, teams: new Map([[LAL, "Tu equipo"]]) }), [weekStart]);
    assert.deepEqual(rankGames(all, { period: "mes", today: TODAY, dayOf, teams: new Set() }), []);
  });

  it("descarta notas que no son números", () => {
    const broken = { ...game(TODAY, 1), excitement_score: Number.NaN };
    assert.deepEqual(rankGames([broken], { period: "semana", today: TODAY, dayOf }), []);
  });

  it("no cambia la lista original", () => {
    const copy = [...all];
    rankGames(all, { period: "temporada", today: TODAY, dayOf });
    assert.deepEqual(all, copy);
  });
});

describe("gameOfTheWeek", () => {
  it("el de mejor nota de los últimos 7 días, de cualquier equipo", () => {
    const best = game("2026-11-15", 9.1, LAL, MIA);
    assert.equal(gameOfTheWeek([game("2026-11-01", 9.8), best, game(TODAY, 8.9)], TODAY, dayOf), best);
  });

  it("sin partidos con nota esta semana, ninguno", () => {
    assert.equal(gameOfTheWeek([game("2026-11-01", 9.8), game(TODAY, null)], TODAY, dayOf), null);
  });
});

describe("filtros en la URL", () => {
  const ids = new Set([LAL, BOS]);

  it("lee el equipo o los favoritos y descarta lo demás", () => {
    assert.equal(parseTeamFilter(String(LAL), ids), LAL);
    assert.equal(parseTeamFilter("favoritos", ids), "favoritos");
    assert.equal(parseTeamFilter("123", ids), "todos");
    assert.equal(parseTeamFilter(undefined, ids), "todos");
    assert.equal(parseTeamFilter(["1610612747"], ids), "todos");
  });

  it("solo escribe lo que no es por defecto", () => {
    assert.equal(watchSearch("semana", "todos"), "");
    assert.equal(watchSearch("mes", "todos"), "?periodo=mes");
    assert.equal(watchSearch("semana", LAL), `?equipo=${LAL}`);
    assert.equal(watchSearch("temporada", "favoritos"), "?periodo=temporada&equipo=favoritos");
  });
});
