// Tests del motor de reglas. Se lanzan con `npm test` (ejecutor nativo de Node, sin dependencias).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyEstimates,
  checkTrade,
  expandedLimit,
  FIRST_APRON,
  formatMoney,
  isValidEstimate,
  MAX_SALARY,
  MIN_SALARY,
  SALARY_CAP,
  salaryZone,
  SECOND_APRON,
  tradableFrom,
  type DraftPick,
  type Trade,
  type TradePlayer,
  type TradeTeam,
} from "./trade-rules.ts";

const TODAY = "2026-11-04";
const M = 1_000_000;

// BKN, DEN, NYK, OKC y ORL son los únicos sin hard cap activo
function team(id: number, abbreviation: string, payroll: number, rosterSize = 14): TradeTeam {
  return { id, name: abbreviation, abbreviation, payroll, rosterSize };
}

let nextPlayer = 1;
function player(teamId: number, salary: number, extra: Partial<TradePlayer> = {}): TradePlayer {
  const id = nextPlayer++;
  return { id, name: `Jugador ${id}`, teamId, salary, signedOn: "2024-07-06", signedKind: "free_agent", acquiredOn: null, ...extra };
}

function trade(teams: TradeTeam[], moves: [TradePlayer, number][], picks: [DraftPick, number][] = []): Trade {
  return {
    teams,
    players: moves.map(([p, to]) => ({ player: p, to })),
    picks: picks.map(([pick, to]) => ({ pick, to })),
  };
}

/** Veredicto de un traspaso entre `a` y un rival con mucho margen, para aislar lo que le pasa a `a`. */
function forTeam(a: TradeTeam, sent: number[], received: number[]) {
  const rival = team(99, "BKN", 120 * M);
  const verdict = checkTrade(
    trade([a, rival], [...sent.map((s): [TradePlayer, number] => [player(a.id, s), rival.id]), ...received.map((s): [TradePlayer, number] => [player(rival.id, s), a.id])]),
    TODAY
  );
  return { verdict, report: verdict.teams[0] };
}

describe("excepción ampliada", () => {
  it("aplica los tres tramos de 2026-27", () => {
    assert.equal(expandedLimit(5 * M), 10_250_000);
    assert.equal(expandedLimit(8_846_000), 17_942_000);
    assert.equal(expandedLimit(20 * M), 29_096_000);
    assert.equal(expandedLimit(35_384_000), 44_480_000);
    assert.equal(expandedLimit(40 * M), 50_250_000);
  });

  it("es continua en los cortes: confirma que 8.846.000 y 35.384.000 salen de la cifra base", () => {
    assert.equal(2 * 8_846_000 + 250_000, 8_846_000 + 9_096_000);
    assert.equal(1.25 * 35_384_000 + 250_000, 35_384_000 + 9_096_000);
  });
});

describe("cuadre salarial", () => {
  it("un equipo que acaba bajo el tope absorbe sin enviar nada", () => {
    const { report } = forTeam(team(1, "NYK", 100 * M), [], [20 * M]);
    assert.equal(report.rule, "under_cap");
    assert.equal(report.ok, true);
  });

  it("puede pasarse del tope hasta 250.000 $ con su espacio", () => {
    assert.equal(forTeam(team(1, "NYK", SALARY_CAP - 5 * M), [], [5_250_000]).report.rule, "cap_room");
    assert.equal(forTeam(team(1, "NYK", SALARY_CAP - 5 * M), [], [5_250_001]).report.rule, null);
  });

  it("sobre el tope no puede recibir sin enviar", () => {
    const { verdict, report } = forTeam(team(1, "NYK", 190 * M), [], [2 * M]);
    assert.equal(report.rule, null);
    assert.equal(verdict.status, "invalid");
    assert.match(verdict.errors[0].message, /sin enviar salario/);
  });

  it("uno por uno: 100% + 250.000 $ sin penalización", () => {
    assert.equal(forTeam(team(1, "NYK", 190 * M), [10 * M], [10_250_000]).report.rule, "standard");
  });

  it("acabar sobre el primer apron elimina el margen de 250.000 $", () => {
    const a = team(1, "NYK", 215 * M);
    assert.equal(forTeam(a, [10 * M], [10 * M]).report.rule, "standard");
    assert.equal(forTeam(a, [10 * M], [10 * M + 1]).report.rule, null);
  });

  it("la excepción ampliada exige acabar bajo el primer apron y pone hard cap", () => {
    const { verdict, report } = forTeam(team(1, "NYK", 190 * M), [10 * M], [19 * M]);
    assert.equal(report.rule, "expanded");
    assert.equal(report.hardCap, "first");
    assert.match(verdict.warnings[0].message, /hard cap en el primer apron/);
    assert.equal(forTeam(team(1, "NYK", 205 * M), [10 * M], [15 * M]).report.rule, null);
  });

  it("sumar salarios pone hard cap en el segundo apron", () => {
    const { report } = forTeam(team(1, "NYK", 215 * M), [10 * M, 10 * M], [20 * M]);
    assert.equal(report.rule, "aggregated");
    assert.equal(report.hardCap, "second");
  });

  it("sobre el segundo apron no se puede sumar, aunque baje la nómina", () => {
    const { verdict, report } = forTeam(team(1, "NYK", 240 * M), [10 * M, 10 * M], [15 * M]);
    assert.equal(report.rule, null);
    assert.match(verdict.errors[0].message, /no puede sumar salarios/);
  });

  it("sobre el segundo apron sí vale el uno por uno, y uno enviado puede cubrir a varios", () => {
    const a = team(1, "NYK", 240 * M);
    assert.equal(forTeam(a, [10 * M, 10 * M], [10 * M, 9 * M]).report.rule, "standard");
    assert.equal(forTeam(a, [20 * M], [12 * M, 8 * M]).report.rule, "standard");
  });

  it("solo importa dónde acaba: bajar por debajo del segundo apron permite sumar", () => {
    assert.equal(forTeam(team(1, "NYK", 225 * M), [10 * M, 10 * M], [15 * M]).report.rule, "aggregated");
  });

  it("si solo envía, siempre le vale", () => {
    assert.equal(forTeam(team(1, "NYK", 240 * M), [30 * M], []).report.rule, "none");
  });

  it("el límite que se muestra es coherente con la regla en un barrido de casos", () => {
    for (const payroll of [150, 160, 170, 190, 200, 205, 209, 215, 221, 230].map((m) => m * M)) {
      for (const sent of [1, 5, 8.846, 15, 30, 35.384, 45].map((m) => Math.round(m * M))) {
        const { report } = forTeam(team(1, "NYK", payroll), [sent], [sent]);
        const limit = report.maxIncoming;
        assert.notEqual(forTeam(team(1, "NYK", payroll), [sent], [limit]).report.rule, null, `${payroll} ${sent} límite ${limit}`);
        assert.equal(forTeam(team(1, "NYK", payroll), [sent], [limit + 1]).report.rule, null, `${payroll} ${sent} límite ${limit} + 1`);
      }
    }
  });
});

describe("hard caps", () => {
  it("un equipo con hard cap no puede superarlo aunque el salario cuadre", () => {
    const { verdict } = forTeam(team(1, "MIA", 208 * M), [10 * M], [12 * M]);
    assert.equal(verdict.status, "invalid");
    assert.match(verdict.errors[0].message, /hard cap en el primer apron/);
  });

  it("el mismo traspaso es válido para un equipo sin hard cap si cuadra", () => {
    assert.equal(forTeam(team(1, "ORL", 208 * M), [10 * M], [10_250_000]).verdict.status, "valid");
  });

  it("puede llegar justo al límite de su hard cap", () => {
    assert.equal(forTeam(team(1, "MIA", FIRST_APRON - 200_000), [10 * M], [10_200_000]).verdict.status, "valid");
  });

  it("no avisa de un hard cap nuevo si ya tiene uno igual o más estricto", () => {
    assert.equal(forTeam(team(1, "MIA", 190 * M), [10 * M], [19 * M]).verdict.warnings.length, 0);
  });

  it("avisa si pasa del segundo apron al primero", () => {
    const { verdict, report } = forTeam(team(1, "HOU", 190 * M), [10 * M], [19 * M]);
    assert.equal(report.hardCap, "first");
    assert.equal(verdict.warnings.length, 1);
  });
});

describe("restricciones por fecha", () => {
  it("agente libre del verano: hasta el 15 de diciembre", () => {
    assert.equal(tradableFrom({ signedOn: "2026-08-13", signedKind: "free_agent" }), "2026-12-15");
  });

  it("firmado en otoño: 3 meses después, porque es más tarde", () => {
    assert.equal(tradableFrom({ signedOn: "2026-10-20", signedKind: "free_agent" }), "2027-01-20");
  });

  it("firmado en primavera: usa el 15 de diciembre de la temporada anterior", () => {
    assert.equal(tradableFrom({ signedOn: "2026-03-10", signedKind: "free_agent" }), "2026-06-10");
  });

  it("novato: 30 días desde la firma", () => {
    assert.equal(tradableFrom({ signedOn: "2026-07-14", signedKind: "rookie" }), "2026-08-13");
  });

  it("renovaciones y extensiones de novato no retrasan", () => {
    assert.equal(tradableFrom({ signedOn: "2026-09-25", signedKind: "extension" }), null);
    assert.equal(tradableFrom({ signedOn: "2026-09-25", signedKind: "rookie_extension" }), null);
  });

  it("un traspaso con un recién fichado es válido desde esa fecha", () => {
    const a = team(1, "ORL", 190 * M);
    const b = team(2, "NYK", 190 * M);
    const moves: [TradePlayer, number][] = [[player(1, 10 * M, { signedOn: "2026-08-13" }), 2], [player(2, 10 * M), 1]];
    const before = checkTrade(trade([a, b], moves), TODAY);
    assert.equal(before.status, "valid_from");
    assert.equal(before.validFrom, "2026-12-15");
    assert.equal(checkTrade(trade([a, b], moves), "2026-12-15").status, "valid");
  });

  it("los errores de salario mandan sobre las fechas", () => {
    const a = team(1, "ORL", 190 * M);
    const b = team(2, "NYK", 190 * M);
    const moves: [TradePlayer, number][] = [[player(1, 30 * M, { signedOn: "2026-08-13" }), 2], [player(2, 5 * M), 1]];
    const verdict = checkTrade(trade([a, b], moves), TODAY);
    assert.equal(verdict.status, "invalid");
    assert.equal(verdict.validFrom, null);
  });

  it("recién traspasado: no puede sumarse a otro salario durante 2 meses", () => {
    const a = team(1, "ORL", 215 * M);
    const b = team(2, "NYK", 190 * M);
    const moves: [TradePlayer, number][] = [
      [player(1, 10 * M, { acquiredOn: "2026-10-20" }), 2],
      [player(1, 10 * M), 2],
      [player(2, 20 * M), 1],
    ];
    const verdict = checkTrade(trade([a, b], moves), TODAY);
    assert.equal(verdict.status, "valid_from");
    assert.equal(verdict.validFrom, "2026-12-20");
  });

  it("recién traspasado: uno por uno sí puede salir", () => {
    const a = team(1, "ORL", 190 * M);
    const b = team(2, "NYK", 190 * M);
    const moves: [TradePlayer, number][] = [[player(1, 10 * M, { acquiredOn: "2026-10-20" }), 2], [player(2, 10 * M), 1]];
    assert.equal(checkTrade(trade([a, b], moves), TODAY).status, "valid");
  });

  it("avisa tras la fecha límite", () => {
    const a = team(1, "ORL", 190 * M);
    const b = team(2, "NYK", 190 * M);
    const verdict = checkTrade(trade([a, b], [[player(1, 10 * M), 2], [player(2, 10 * M), 1]]), "2027-02-12");
    assert.match(verdict.warnings[0].message, /fecha límite/);
  });
});

describe("plantilla", () => {
  it("avisa si recibe más de los que envía y se pasa de 15", () => {
    const a = team(1, "ORL", 190 * M, 15);
    const b = team(2, "NYK", 190 * M, 15);
    const moves: [TradePlayer, number][] = [[player(1, 10 * M), 2], [player(2, 5 * M), 1], [player(2, 4 * M), 1]];
    const verdict = checkTrade(trade([a, b], moves), TODAY);
    assert.equal(verdict.status, "valid");
    assert.match(verdict.warnings.find((w) => w.teamId === 1)?.message ?? "", /debe cortar a un jugador/);
    assert.equal(verdict.teams[0].rosterAfter, 16);
  });

  it("avisa si se queda por debajo de 14", () => {
    const a = team(1, "ORL", 190 * M, 14);
    const b = team(2, "NYK", 190 * M, 14);
    const verdict = checkTrade(trade([a, b], [[player(1, 2 * M), 2], [player(1, 2 * M), 2], [player(2, 3 * M), 1]]), TODAY);
    assert.ok(verdict.warnings.some((w) => w.teamId === 1 && /dos semanas/.test(w.message)));
  });
});

describe("rondas del draft", () => {
  const a = team(1, "ORL", 190 * M);
  const b = team(2, "NYK", 190 * M);
  const pick = (teamId: number, year: number, round: 1 | 2): DraftPick => ({ teamId, year, round });

  it("una ronda sola es válida y avisa de que no conocemos las ya cedidas", () => {
    const verdict = checkTrade(trade([a, b], [], [[pick(1, 2029, 1), 2]]), TODAY);
    assert.equal(verdict.status, "valid");
    assert.match(verdict.warnings[0].message, /rondas ya cedidas/);
  });

  it("no se pueden ceder primeras rondas de dos años seguidos", () => {
    const verdict = checkTrade(trade([a, b], [], [[pick(1, 2029, 1), 2], [pick(1, 2030, 1), 2]]), TODAY);
    assert.equal(verdict.status, "invalid");
    assert.match(verdict.errors[0].message, /Stepien/);
  });

  it("sí en años alternos, y las segundas rondas no tienen esa regla", () => {
    assert.equal(checkTrade(trade([a, b], [], [[pick(1, 2029, 1), 2], [pick(1, 2031, 1), 2]]), TODAY).status, "valid");
    assert.equal(checkTrade(trade([a, b], [], [[pick(1, 2029, 2), 2], [pick(1, 2030, 2), 2]]), TODAY).status, "valid");
  });

  it("solo hasta el séptimo draft", () => {
    assert.equal(checkTrade(trade([a, b], [], [[pick(1, 2034, 1), 2]]), TODAY).status, "invalid");
  });

  it("la primera ronda congelada no se puede ceder, pero la segunda sí", () => {
    const cle = team(3, "CLE", 200 * M);
    assert.equal(checkTrade(trade([cle, b], [], [[pick(3, 2033, 1), 2]]), TODAY).status, "invalid");
    assert.equal(checkTrade(trade([cle, b], [], [[pick(3, 2033, 2), 2]]), TODAY).status, "valid");
  });
});

describe("traspasos a tres bandas", () => {
  it("cada equipo se juzga por sus propios totales", () => {
    const a = team(1, "ORL", 190 * M);
    const b = team(2, "NYK", 190 * M);
    const c = team(3, "DEN", 190 * M);
    const verdict = checkTrade(trade([a, b, c], [[player(1, 10 * M), 2], [player(2, 10 * M), 3], [player(3, 10 * M), 1]]), TODAY);
    assert.equal(verdict.status, "valid");
    assert.deepEqual(verdict.teams.map((t) => [t.outgoing, t.incoming]), [[10 * M, 10 * M], [10 * M, 10 * M], [10 * M, 10 * M]]);
  });

  it("un fallo en un solo equipo invalida el traspaso y lo señala", () => {
    const a = team(1, "ORL", 190 * M);
    const b = team(2, "NYK", 215 * M);
    const c = team(3, "DEN", 190 * M);
    const verdict = checkTrade(trade([a, b, c], [[player(1, 20 * M), 2], [player(2, 10 * M), 3], [player(3, 10 * M), 1]]), TODAY);
    assert.equal(verdict.status, "invalid");
    assert.deepEqual(verdict.errors.map((e) => e.teamId), [2]);
  });
});

describe("utilidades", () => {
  it("un traspaso sin nada está vacío", () => {
    assert.equal(checkTrade(trade([team(1, "ORL", 190 * M), team(2, "NYK", 190 * M)], []), TODAY).status, "empty");
  });

  it("zonas salariales", () => {
    assert.equal(salaryZone(SALARY_CAP), "room");
    assert.equal(salaryZone(SALARY_CAP + 1), "over_cap");
    assert.equal(salaryZone(205 * M), "tax");
    assert.equal(salaryZone(FIRST_APRON + 1), "first_apron");
    assert.equal(salaryZone(SECOND_APRON + 1), "second_apron");
  });

  it("formatea en español", () => {
    assert.equal(formatMoney(6_424_800), "6,4 M$");
  });
});

describe("contratos sin cifra pública (Tarea 4.4)", () => {
  it("el rango de una estimación va del mínimo de novato al máximo del 35 %", () => {
    assert.equal(MAX_SALARY, 57_736_350);
    assert.ok(isValidEstimate(MIN_SALARY) && isValidEstimate(MAX_SALARY));
    assert.ok(!isValidEstimate(MIN_SALARY - 1) && !isValidEstimate(MAX_SALARY + 1) && !isValidEstimate(12_500_000.5));
  });

  it("un jugador sin cifra no se puede traspasar hasta que el usuario la estime", () => {
    const a = team(1, "ORL", 150 * M);
    const b = team(2, "NYK", 150 * M);
    const verdict = checkTrade(trade([a, b], [[player(1, 0, { salaryStatus: "pending" }), 2], [player(2, 5 * M), 1]]), TODAY);
    assert.equal(verdict.status, "invalid");
    assert.match(verdict.errors[0].message, /Falta la cifra/);
  });

  it("la estimación sustituye al salario y se suma también a la nómina de su equipo", () => {
    const a = team(1, "ORL", 190 * M, 15);
    const b = team(2, "NYK", 190 * M);
    const pending = player(1, 0, { salaryStatus: "pending" });
    const base = { teams: [{ ...a, pendingContracts: 1 }, b], players: [{ player: pending, to: 2 }, { player: player(2, 10 * M), to: 1 }] };
    const priced = applyEstimates(base, [{ id: pending.id, salary: 10 * M }]);
    assert.ok(priced);
    assert.equal(priced.players[0].player.salary, 10 * M);
    assert.equal(priced.players[0].player.salaryStatus, "estimated");
    assert.equal(priced.teams[0].payroll, 200 * M);
    assert.equal(priced.teams[0].pendingContracts, 0);

    const verdict = checkTrade({ ...priced, picks: [] }, TODAY);
    assert.equal(verdict.status, "valid");
    assert.equal(verdict.teams[0].payrollAfter, 200 * M);
    assert.ok(verdict.warnings.some((w) => /cifra estimada/.test(w.message)));
  });

  it("rechaza estimaciones de jugadores con cifra, fuera del traspaso, repetidas o fuera de rango", () => {
    const pending = player(1, 0, { salaryStatus: "pending" });
    const known = player(1, 8 * M);
    const base = { teams: [team(1, "ORL", 150 * M), team(2, "NYK", 150 * M)], players: [{ player: pending, to: 2 }, { player: known, to: 2 }] };
    assert.equal(applyEstimates(base, [{ id: known.id, salary: 5 * M }]), null);
    assert.equal(applyEstimates(base, [{ id: 999, salary: 5 * M }]), null);
    assert.equal(applyEstimates(base, [{ id: pending.id, salary: 5 * M }, { id: pending.id, salary: 6 * M }]), null);
    assert.equal(applyEstimates(base, [{ id: pending.id, salary: 500_000 }]), null);
    assert.deepEqual(applyEstimates(base, []), base);
  });

  it("una cifra redondeada por la prensa vale para el veredicto, con aviso", () => {
    const a = team(1, "ORL", 150 * M);
    const b = team(2, "NYK", 150 * M);
    const verdict = checkTrade(trade([a, b], [[player(1, 5 * M, { salaryStatus: "approx" }), 2], [player(2, 5 * M), 1]]), TODAY);
    assert.equal(verdict.status, "valid");
    assert.ok(verdict.warnings.some((w) => /redondeada por la prensa/.test(w.message)));
  });

  it("avisa si la nómina de un equipo tiene contratos o dinero muerto sin cifra", () => {
    const a = { ...team(1, "ORL", 150 * M), pendingContracts: 2, pendingDeadMoney: 1 };
    const verdict = checkTrade(trade([a, team(2, "NYK", 150 * M)], [[player(1, 5 * M), 2], [player(2, 5 * M), 1]]), TODAY);
    assert.equal(verdict.status, "valid");
    assert.ok(verdict.warnings.some((w) => w.teamId === 1 && /2 contratos firmados/.test(w.message)));
    assert.ok(verdict.warnings.some((w) => w.teamId === 1 && /dinero muerto por confirmar/.test(w.message)));
  });
});
