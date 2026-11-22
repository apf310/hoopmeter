// Tests de la clasificación sin spoilers (Tarea 6.6). Se lanzan con `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lastStartedDay, pickStandingsBefore, sortLeague, standingsDiffer } from "./standings.ts";

const extra = (streak: string) => ({ streak });
// Al día: 5-3 con la jornada del 16 jugada; antes de ella: 4-3
const team = (beforeDay: string | null) => ({
  id: 1,
  wins: 5,
  losses: 3,
  conf_rank: 2,
  standings_extra: extra("W2"),
  standings_before: beforeDay ? { day: beforeDay, wins: 4, losses: 3, conf_rank: 4, standings_extra: extra("W1") } : null,
});

describe("clasificación de antes de la última jornada empezada", () => {
  it("si la jornada empezada ya tiene partidos terminados, enseña la de antes", () => {
    const { day, teams } = pickStandingsBefore([team("2026-11-16")], "2026-11-16");
    assert.equal(day, "2026-11-16");
    assert.deepEqual(teams, [{ id: 1, wins: 4, losses: 3, conf_rank: 4, standings_extra: extra("W1") }]);
  });

  it("si la jornada empezada aún no tiene partidos terminados, la de al día ya es la de antes", () => {
    const { teams } = pickStandingsBefore([team("2026-11-16")], "2026-11-17");
    assert.equal(teams?.[0].wins, 5);
  });

  it("ante la duda no enseña nada: sin calcular o con el calendario desajustado", () => {
    assert.equal(pickStandingsBefore([team(null)], "2026-11-16").teams, null);
    assert.equal(pickStandingsBefore([team("2026-11-17")], "2026-11-16").teams, null);
  });

  it("sin ninguna jornada empezada no hay nada que ocultar", () => {
    assert.equal(pickStandingsBefore([team(null)], null).teams?.[0].wins, 5);
  });
});

describe("última jornada empezada", () => {
  const schedule = [{ game_datetime_utc: "2026-11-16T00:00:00Z" }, { game_datetime_utc: "2026-11-17T00:30:00Z" }];
  const dayOf = (utc: string) => utc.slice(0, 10);

  it("es la del último partido cuya hora ya ha pasado", () => {
    assert.equal(lastStartedDay(schedule, Date.parse("2026-11-17T00:29:00Z"), dayOf), "2026-11-16");
    assert.equal(lastStartedDay(schedule, Date.parse("2026-11-17T00:30:00Z"), dayOf), "2026-11-17");
    assert.equal(lastStartedDay(schedule, Date.parse("2026-11-15T00:00:00Z"), dayOf), null);
  });
});

describe("aviso de resultados al compartir", () => {
  const row = (wins: number) => ({ id: 1, wins, losses: 3, conf_rank: 1, standings_extra: {} });

  it("avisa solo si la de al día trae partidos nuevos", () => {
    assert.equal(standingsDiffer([row(4)], [row(4)]), false);
    assert.equal(standingsDiffer([row(4)], [row(5)]), true);
    assert.equal(standingsDiffer(null, [row(5)]), true);
  });
});

describe("clasificación de la liga (30)", () => {
  it("ordena por porcentaje de victorias, sin mirar la conferencia", () => {
    const rows = [
      { id: 1, wins: 8, losses: 6 },
      { id: 2, wins: 12, losses: 2 },
      { id: 3, wins: 0, losses: 0 },
      { id: 4, wins: 10, losses: 5 },
    ];
    assert.deepEqual(sortLeague(rows).map((t) => t.id), [2, 4, 1, 3]);
  });

  it("a igual porcentaje, primero quien más ha ganado y después el id", () => {
    const rows = [
      { id: 9, wins: 5, losses: 5 },
      { id: 7, wins: 6, losses: 6 },
      { id: 8, wins: 6, losses: 6 },
    ];
    assert.deepEqual(sortLeague(rows).map((t) => t.id), [7, 8, 9]);
  });
});
