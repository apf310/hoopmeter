// Motor de reglas del convenio colectivo (CBA) para el GM Virtual. Funciones puras y sin dependencias:
// se usa en el cliente (veredicto instantáneo), en el servidor (antes de gastar IA) y en los tests.
//
// Fuera del alcance, porque no tenemos esos datos: excepciones de traspaso que ya tenga cada equipo,
// cláusulas de no traspaso, bonus por traspaso, excepción de mínimo y rondas ya cedidas. La nómina es
// la de cap: la del apron puede variar algo (bonus improbables, contratos de 0-1 años de servicio).

// ---------- Cifras de la temporada: revisar todo este bloque cada verano ----------

export const SEASON = "2026-27";

export const SALARY_CAP = 164_961_000;
export const LUXURY_TAX = 200_428_000;
export const FIRST_APRON = 209_015_000;
export const SECOND_APRON = 221_686_000;

/** Límites de un contrato nuevo, y por tanto de una estimación: mínimo de un novato y máximo (35 % del tope). */
export const MIN_SALARY = 1_357_763;
export const MAX_SALARY = Math.round(SALARY_CAP * 0.35);

/** Margen sobre lo que sale. Desaparece si el equipo acaba por encima del primer apron. */
const TRADE_CUSHION = 250_000;
/** Base de la excepción ampliada: sube con el tope y de ella salen sus dos cortes (8.846.000 y 35.384.000). */
const EXPANDED_AMOUNT = 9_096_000;

export const TRADE_DEADLINE = "2027-02-11";
/** Rondas que se pueden ceder: hasta el séptimo draft tras la fecha del traspaso. */
export const PICK_YEARS = [2027, 2028, 2029, 2030, 2031, 2032, 2033];

const ROSTER_MIN = 14;
const ROSTER_MAX = 15;

export type Apron = "first" | "second";

/** Hard caps ya activos esta temporada, por abreviatura (lista de Hoops Rumors, sep. 2026). */
export const HARD_CAPS: Record<string, Apron> = {
  ATL: "first", BOS: "first", CHA: "first", CHI: "first", CLE: "first", DAL: "first", DET: "first",
  IND: "first", LAC: "first", LAL: "first", MEM: "first", MIA: "first", MIL: "first", NOP: "first",
  PHI: "first", POR: "first", SAC: "first", SAS: "first", TOR: "first", UTA: "first", WAS: "first",
  GSW: "second", HOU: "second", MIN: "second", PHX: "second",
};

/** Primeras rondas congeladas por acabar la temporada anterior sobre el segundo apron. */
const FROZEN_FIRSTS: Record<string, number[]> = { CLE: [2033] };

// ---------- Tipos ----------

export type SignedKind = "free_agent" | "extension" | "rookie" | "rookie_extension";

/**
 * confirmed: cifra exacta · approx: redondeada por la prensa o prorrateada (≈) · pending: firmado, aún
 * sin cifra pública · estimated: la ha escrito el usuario.
 */
export type SalaryStatus = "confirmed" | "approx" | "pending" | "estimated";

export type TradePlayer = {
  id: number;
  name: string;
  teamId: number;
  /** 0 mientras el contrato no tenga cifra pública. */
  salary: number;
  signedOn: string | null; // YYYY-MM-DD
  signedKind: SignedKind | null;
  acquiredOn: string | null; // YYYY-MM-DD
  /** Por defecto "confirmed". */
  salaryStatus?: SalaryStatus;
};

export type TradeTeam = {
  id: number;
  name: string;
  abbreviation: string;
  /** Contratos + dinero muerto. No incluye los contratos sin cifra pública. */
  payroll: number;
  /** Contratos estándar (los two-way no cuentan). */
  rosterSize: number;
  /** Contratos firmados sin cifra pública, que por eso no suman en `payroll`. */
  pendingContracts?: number;
  /** Jugadores cortados cuyo dinero muerto aún no se conoce con seguridad. */
  pendingDeadMoney?: number;
};

/** Ronda propia del equipo `teamId`. */
export type DraftPick = { teamId: number; year: number; round: 1 | 2 };

export type Trade = {
  teams: TradeTeam[];
  players: { player: TradePlayer; to: number }[];
  picks: { pick: DraftPick; to: number }[];
};

/** Cómo cuadra un equipo su salario. `standard` no pone hard cap; `aggregated` y `expanded`, sí. */
export type SalaryRule = "none" | "under_cap" | "cap_room" | "standard" | "aggregated" | "expanded";

export type TeamReport = {
  teamId: number;
  outgoing: number;
  incoming: number;
  payrollAfter: number;
  rosterAfter: number;
  /** null = el salario no cuadra. */
  rule: SalaryRule | null;
  /** Lo máximo que puede recibir con lo que envía. */
  maxIncoming: number;
  /** Hard cap activo o, si es más estricto, el que le pondría este traspaso. */
  hardCap: Apron | null;
  ok: boolean;
};

export type TradeIssue = { teamId: number | null; message: string };

type TradeIssues = {
  errors: TradeIssue[];
  /** Lo que retrasa el traspaso hasta una fecha. */
  delays: (TradeIssue & { from: string })[];
  warnings: TradeIssue[];
};

export type TradeVerdict = TradeIssues & {
  status: "empty" | "valid" | "valid_from" | "invalid";
  /** Primer día en que el traspaso sería legal (solo con `valid_from`). */
  validFrom: string | null;
  teams: TeamReport[];
};

// ---------- Formato ----------

export function formatMoney(value: number): string {
  const millions = (value / 1_000_000).toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${millions} M$`;
}

const dateFormat = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function formatTradeDate(day: string): string {
  return dateFormat.format(new Date(`${day}T00:00:00Z`));
}

export const RULE_LABEL: Record<SalaryRule, string> = {
  none: "No recibe salario",
  under_cap: "Cabe bajo el tope salarial",
  cap_room: "Usa su espacio salarial",
  standard: "Cuadra con el salario que envía",
  aggregated: "Suma varios salarios para cuadrar",
  expanded: "Usa la excepción ampliada",
};

export const APRON_LABEL: Record<Apron, string> = { first: "primer apron", second: "segundo apron" };

export const APRON_AMOUNT: Record<Apron, number> = { first: FIRST_APRON, second: SECOND_APRON };

export type SalaryZone = "room" | "over_cap" | "tax" | "first_apron" | "second_apron";

export const ZONE_LABEL: Record<SalaryZone, string> = {
  room: "Con espacio salarial",
  over_cap: "Sobre el tope",
  tax: "Paga impuesto de lujo",
  first_apron: "Sobre el primer apron",
  second_apron: "Sobre el segundo apron",
};

export function salaryZone(payroll: number): SalaryZone {
  if (payroll > SECOND_APRON) return "second_apron";
  if (payroll > FIRST_APRON) return "first_apron";
  if (payroll > LUXURY_TAX) return "tax";
  return payroll > SALARY_CAP ? "over_cap" : "room";
}

/** Titular del veredicto. */
export function verdictTitle({ status, validFrom }: Pick<TradeVerdict, "status" | "validFrom">): string {
  if (status === "valid") return "Traspaso válido";
  if (status === "invalid") return "No cumple el convenio";
  return validFrom ? `Válido desde el ${formatTradeDate(validFrom)}` : "Añade jugadores o rondas";
}

// ---------- Fechas (YYYY-MM-DD: se comparan como texto) ----------

function addToDate(day: string, months: number, days = 0): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + months, date + days)).toISOString().slice(0, 10);
}

/** Primer día en que se puede traspasar a un jugador, o null si nunca tuvo restricción. */
export function tradableFrom({ signedOn, signedKind }: Pick<TradePlayer, "signedOn" | "signedKind">): string | null {
  if (!signedOn) return null;
  if (signedKind === "rookie") return addToDate(signedOn, 0, 30);
  if (signedKind !== "free_agent") return null;

  // Lo que ocurra más tarde: 3 meses desde la firma o el 15 de diciembre de esa temporada
  const [year, month] = signedOn.split("-").map(Number);
  const december = `${month >= 7 ? year : year - 1}-12-15`;
  const threeMonths = addToDate(signedOn, 3);
  return threeMonths > december ? threeMonths : december;
}

// ---------- Salarios ----------

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

/** ¿Vale como estimación? Un contrato nuevo nunca baja del mínimo ni pasa del máximo. */
export function isValidEstimate(salary: number): boolean {
  return Number.isInteger(salary) && salary >= MIN_SALARY && salary <= MAX_SALARY;
}

/**
 * Pone a los contratos aún sin cifra pública la estimación del usuario. Ese salario no estaba en la
 * nómina de su equipo, así que también se suma ahí. Devuelve null si alguna estimación no vale: jugador
 * fuera del traspaso, con cifra ya conocida, repetido o fuera de rango.
 */
export function applyEstimates<T extends TradeTeam, P extends TradePlayer>(
  trade: { teams: T[]; players: { player: P; to: number }[] },
  estimates: { id: number; salary: number }[]
): { teams: T[]; players: { player: P; to: number }[] } | null {
  const byId = new Map(estimates.map(({ id, salary }) => [id, salary]));
  if (byId.size !== estimates.length) return null;
  const moving = new Map(trade.players.map(({ player }) => [player.id, player]));
  for (const [id, salary] of byId) {
    if (moving.get(id)?.salaryStatus !== "pending" || !isValidEstimate(salary)) return null;
  }

  const added = new Map<number, { amount: number; count: number }>();
  const players = trade.players.map((move) => {
    const salary = byId.get(move.player.id);
    if (salary === undefined) return move;
    const total = added.get(move.player.teamId) ?? { amount: 0, count: 0 };
    added.set(move.player.teamId, { amount: total.amount + salary, count: total.count + 1 });
    return { ...move, player: { ...move.player, salary, salaryStatus: "estimated" } as P };
  });
  const teams = trade.teams.map((team) => {
    const extra = added.get(team.id);
    if (!extra) return team;
    return { ...team, payroll: team.payroll + extra.amount, pendingContracts: Math.max(0, (team.pendingContracts ?? 0) - extra.count) };
  });
  return { teams, players };
}

/** Lo máximo que se puede recibir con la excepción ampliada: 200%, +cantidad fija o 125%, según lo que sale. */
export function expandedLimit(outgoing: number): number {
  const small = 2 * outgoing + TRADE_CUSHION;
  const medium = outgoing + EXPANDED_AMOUNT;
  const large = Math.floor(1.25 * outgoing) + TRADE_CUSHION;
  return Math.max(Math.min(small, medium), large);
}

/** ¿Encaja cada jugador recibido en el sueldo de uno solo de los enviados, sin sumar salarios? */
function fitsSeparately(outgoing: number[], incoming: number[], cushion: number): boolean {
  const room = outgoing.map((salary) => salary + cushion);
  const pending = [...incoming].sort((a, b) => b - a);

  function place(index: number): boolean {
    if (index === pending.length) return true;
    return room.some((space, bin) => {
      if (space < pending[index]) return false;
      room[bin] -= pending[index];
      const placed = place(index + 1);
      room[bin] += pending[index];
      return placed;
    });
  }
  return place(0);
}

/** La vía que menos penaliza para que cuadre el salario. Lo que cuenta es dónde acaba el equipo. */
function salaryRule(payroll: number, sent: number[], received: number[]): SalaryRule | null {
  const outgoing = sum(sent);
  const incoming = sum(received);
  const after = payroll - outgoing + incoming;

  if (incoming === 0) return "none";
  if (after <= SALARY_CAP) return "under_cap";
  if (after <= SALARY_CAP + TRADE_CUSHION) return "cap_room";
  if (sent.length === 0) return null;

  const cushion = after <= FIRST_APRON ? TRADE_CUSHION : 0;
  if (fitsSeparately(sent, received, cushion)) return "standard";
  if (after <= SECOND_APRON && incoming <= outgoing + cushion) return "aggregated";
  if (after <= FIRST_APRON && incoming <= expandedLimit(outgoing)) return "expanded";
  return null;
}

function incomingLimit(payroll: number, sent: number[], hardCap: Apron | null): number {
  const outgoing = sum(sent);
  const base = payroll - outgoing;
  let limit = SALARY_CAP + TRADE_CUSHION - base;
  if (sent.length > 0) {
    // Acabando bajo el primer apron vale la excepción ampliada; por encima, como mucho lo que sale
    limit = Math.max(limit, Math.min(expandedLimit(outgoing), FIRST_APRON - base));
    limit = Math.max(limit, sent.length === 1 || payroll <= SECOND_APRON ? outgoing : Math.max(...sent));
  }
  return Math.max(0, hardCap ? Math.min(limit, APRON_AMOUNT[hardCap] - base) : limit);
}

/** Hard cap que deja cada vía de cuadre. */
const RULE_HARD_CAP: Partial<Record<SalaryRule, Apron>> = { aggregated: "second", expanded: "first" };

function salaryError(team: TradeTeam, report: TeamReport, sent: number[]): string {
  const { incoming, outgoing, payrollAfter, maxIncoming } = report;
  if (sent.length === 0) {
    return `${team.name} recibe ${formatMoney(incoming)} sin enviar salario, y no tiene espacio para absorberlos.`;
  }
  if (payrollAfter > SECOND_APRON && sent.length > 1) {
    return `${team.name} acabaría sobre el segundo apron (${formatMoney(SECOND_APRON)}), así que no puede sumar salarios: cada jugador que recibe debe encajar en el sueldo de uno solo de los que envía.`;
  }
  if (payrollAfter > FIRST_APRON) {
    return `${team.name} acabaría sobre el primer apron (${formatMoney(FIRST_APRON)}), así que no puede recibir más de lo que envía: envía ${formatMoney(outgoing)} y recibe ${formatMoney(incoming)}.`;
  }
  return `${team.name} recibe demasiado salario: enviando ${formatMoney(outgoing)} puede recibir como mucho ${formatMoney(maxIncoming)}, y recibe ${formatMoney(incoming)}.`;
}

// ---------- Veredicto ----------

function checkTeam(team: TradeTeam, trade: Trade, today: string, issues: TradeIssues): TeamReport {
  const leaving = trade.players.filter((move) => move.player.teamId === team.id).map((move) => move.player);
  const arriving = trade.players.filter((move) => move.to === team.id).map((move) => move.player);
  const sent = leaving.map((player) => player.salary);
  const received = arriving.map((player) => player.salary);

  const outgoing = sum(sent);
  const incoming = sum(received);
  const payrollAfter = team.payroll - outgoing + incoming;
  const rosterAfter = team.rosterSize - leaving.length + arriving.length;

  const activeCap = HARD_CAPS[team.abbreviation] ?? null;
  const rule = salaryRule(team.payroll, sent, received);
  const overHardCap = activeCap !== null && incoming > outgoing && payrollAfter > APRON_AMOUNT[activeCap];
  const ruleCap = rule ? (RULE_HARD_CAP[rule] ?? null) : null;
  // Un hard cap nuevo solo importa si es más estricto que el que ya tiene
  const newCap = ruleCap && (activeCap === null || (activeCap === "second" && ruleCap === "first")) ? ruleCap : null;

  const report: TeamReport = {
    teamId: team.id,
    outgoing,
    incoming,
    payrollAfter,
    rosterAfter,
    rule,
    maxIncoming: incomingLimit(team.payroll, sent, activeCap),
    hardCap: newCap ?? activeCap,
    ok: rule !== null && !overHardCap,
  };

  if (overHardCap) {
    const label = APRON_LABEL[activeCap];
    issues.errors.push({
      teamId: team.id,
      message: `${team.name} tiene hard cap en el ${label} (${formatMoney(APRON_AMOUNT[activeCap])}) y acabaría en ${formatMoney(payrollAfter)}: no puede superarlo en toda la temporada.`,
    });
  } else if (rule === null) {
    issues.errors.push({ teamId: team.id, message: salaryError(team, report, sent) });
  }

  if (newCap) {
    issues.warnings.push({
      teamId: team.id,
      message: `${team.name} quedaría con hard cap en el ${APRON_LABEL[newCap]} (${formatMoney(APRON_AMOUNT[newCap])}) el resto de la temporada.`,
    });
  }

  const pendingContracts = team.pendingContracts ?? 0;
  if (pendingContracts > 0) {
    issues.warnings.push({
      teamId: team.id,
      message: `La nómina de ${team.name} no incluye ${pendingContracts === 1 ? "un contrato firmado" : `${pendingContracts} contratos firmados`} aún sin cifra pública: el veredicto podría cambiar.`,
    });
  }
  const pendingDeadMoney = team.pendingDeadMoney ?? 0;
  if (pendingDeadMoney > 0) {
    issues.warnings.push({
      teamId: team.id,
      message: `${team.name} tiene dinero muerto por confirmar (${pendingDeadMoney === 1 ? "un jugador cortado" : `${pendingDeadMoney} jugadores cortados`}): su nómina real puede variar.`,
    });
  }

  if (arriving.length > leaving.length && rosterAfter > ROSTER_MAX) {
    const cuts = rosterAfter - ROSTER_MAX;
    issues.warnings.push({
      teamId: team.id,
      message: `${team.name} tendría ${rosterAfter} contratos: antes de cerrar el traspaso debe cortar a ${cuts === 1 ? "un jugador" : `${cuts} jugadores`}.`,
    });
  }
  if (leaving.length > arriving.length && rosterAfter < ROSTER_MIN) {
    issues.warnings.push({
      teamId: team.id,
      message: `${team.name} se queda con ${rosterAfter} contratos: tendrá dos semanas para volver a ${ROSTER_MIN}.`,
    });
  }

  // Sumar salarios: quien llegó por traspaso hace menos de 2 meses aún no puede entrar en la suma
  if (sent.length > 1 && (rule === "aggregated" || rule === "expanded")) {
    for (const player of leaving) {
      const from = player.acquiredOn ? addToDate(player.acquiredOn, 2) : null;
      if (from && today < from) {
        issues.delays.push({
          teamId: team.id,
          from,
          message: `${player.name} llegó a ${team.name} por traspaso hace poco: no puede sumarse a otro salario hasta el ${formatTradeDate(from)}.`,
        });
      }
    }
  }

  return report;
}

function checkPlayers(trade: Trade, today: string, issues: TradeIssues) {
  const approx = trade.players.map(({ player }) => player).filter((player) => player.salaryStatus === "approx");
  if (approx.length > 0) {
    const list = approx.map((player) => `${player.name}, ≈${formatMoney(player.salary)}`).join("; ");
    issues.warnings.push({
      teamId: null,
      message: `Incluye ${approx.length === 1 ? "una cifra redondeada" : "cifras redondeadas"} por la prensa (${list}): en un traspaso muy justo, el veredicto podría variar.`,
    });
  }

  const estimated = trade.players.map(({ player }) => player).filter((player) => player.salaryStatus === "estimated");
  if (estimated.length > 0) {
    const list = estimated.map((player) => `${player.name}, ${formatMoney(player.salary)}`).join("; ");
    issues.warnings.push({
      teamId: null,
      message: `Incluye ${estimated.length === 1 ? "una cifra estimada" : "cifras estimadas"} por ti (${list}): el veredicto real puede cambiar cuando se publique el contrato.`,
    });
  }

  for (const { player } of trade.players) {
    if (player.salaryStatus === "pending") {
      issues.errors.push({
        teamId: player.teamId,
        message: `Falta la cifra de ${player.name}: su contrato aún no es público. Escribe tu estimación para simular el traspaso.`,
      });
    }
    const from = tradableFrom(player);
    if (from && today < from) {
      issues.delays.push({
        teamId: player.teamId,
        from,
        message: `${player.name} firmó hace poco: no se puede traspasar hasta el ${formatTradeDate(from)}.`,
      });
    }
    if (player.signedKind === "extension" && player.signedOn && today < addToDate(player.signedOn, 6)) {
      issues.warnings.push({
        teamId: player.teamId,
        message: `${player.name} renovó el ${formatTradeDate(player.signedOn)}: si fue con una subida fuerte, no se podría traspasar hasta 6 meses después.`,
      });
    }
  }
}

function checkPicks(trade: Trade, issues: TradeIssues) {
  for (const team of trade.teams) {
    const picks = trade.picks.filter((move) => move.pick.teamId === team.id).map((move) => move.pick);
    const firsts = picks.filter((pick) => pick.round === 1).map((pick) => pick.year).sort((a, b) => a - b);

    for (const { year, round } of picks) {
      if (!PICK_YEARS.includes(year)) {
        issues.errors.push({ teamId: team.id, message: `${team.name} no puede ceder rondas de ${year}: solo las de ${PICK_YEARS[0]} a ${PICK_YEARS.at(-1)}.` });
      }
      if (round === 1 && FROZEN_FIRSTS[team.abbreviation]?.includes(year)) {
        issues.errors.push({ teamId: team.id, message: `La primera ronda de ${year} de ${team.name} está congelada por acabar la temporada pasada sobre el segundo apron.` });
      }
    }

    const consecutive = firsts.find((year) => firsts.includes(year + 1));
    if (consecutive !== undefined) {
      issues.errors.push({
        teamId: team.id,
        message: `${team.name} no puede quedarse sin primera ronda dos años seguidos (${consecutive} y ${consecutive + 1}): lo prohíbe la regla Stepien.`,
      });
    }
  }
}

/** Veredicto completo de un traspaso en la fecha `today` (YYYY-MM-DD). */
export function checkTrade(trade: Trade, today: string): TradeVerdict {
  const issues: TradeIssues = { errors: [], delays: [], warnings: [] };
  const teams = trade.teams.map((team) => checkTeam(team, trade, today, issues));

  if (trade.players.length + trade.picks.length === 0) return { status: "empty", validFrom: null, teams, errors: [], delays: [], warnings: [] };

  checkPlayers(trade, today, issues);
  checkPicks(trade, issues);

  const validFrom = issues.delays.reduce<string | null>((latest, { from }) => (latest && latest > from ? latest : from), null);
  if ((validFrom ?? today) > TRADE_DEADLINE) {
    issues.warnings.push({
      teamId: null,
      message: `La fecha límite de traspasos es el ${formatTradeDate(TRADE_DEADLINE)}: después, no se podría cerrar hasta acabar la temporada.`,
    });
  }
  if (trade.picks.length > 0) {
    issues.warnings.push({ teamId: null, message: "No tenemos datos de las rondas ya cedidas: comprueba que cada equipo conserva las que ofrece." });
  }

  const status = issues.errors.length > 0 ? "invalid" : validFrom ? "valid_from" : "valid";
  return { status, validFrom: status === "valid_from" ? validFrom : null, teams, ...issues };
}
