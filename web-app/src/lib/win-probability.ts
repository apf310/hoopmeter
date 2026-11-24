// Probabilidad de victoria (Tarea 7.2): el mismo modelo que la nota (`processors/excitement_calculator.py`),
// llevado a TypeScript. `tests/test_excitement.py` comprueba que las constantes coinciden y
// `win-probability.test.ts`, que salen los mismos valores.
// Puro: solo lee el marcador y las jugadas de la ficha que ya tiene el cliente, así que en diferido la curva
// acaba en el corte sin que nadie la recorte. Destripa el partido: solo Nivel 3 y diferido, nunca en 1 y 2.
import type { FlowPoint, GameDetail, Play } from "./game-detail.ts";

const REGULATION_PERIOD = 720;
const OT_PERIOD = 300;
const FULL_GAME = 4 * REGULATION_PERIOD;

// Ajustadas con 1.527 partidos (ver excitement_calculator.py)
export const SIGMA = 18.2;
export const HOME_EDGE = 2.5;
export const TIME_FLOOR = 15.0;
export const ALIVE_CHANCE = 0.1;

export type Side = "away" | "home";

/** [segundo de juego, probabilidad del local 0-1] */
export type ProbabilityPoint = [seconds: number, home: number];

/** Canasta (con sus tiros libres) que cambió la probabilidad de victoria del equipo que anota. */
export type KeyPlay = {
  id: number;
  seconds: number;
  period: number;
  clock: string;
  side: Side;
  playerId: number | null;
  text: string;
  points: number;
  /** Marcador tras la jugada. */
  away: number;
  home: number;
  /** Probabilidad del equipo que anota, antes y después. */
  before: number;
  after: number;
};

export type Moment = { seconds: number; chance: number };

export type WinProbability = {
  curve: ProbabilityPoint[];
  /** Quién ha ganado; null mientras no se sabe (en directo o en diferido). */
  winner: Side | null;
  /** Momento en que cada equipo tuvo más opciones. En un partido acabado, el del perdedor es el peor del ganador. */
  best: Record<Side, Moment>;
  /** Segundos que quedaban la última vez que el perdedor tuvo al menos `ALIVE_CHANCE` (null si no ha acabado). */
  decidedLeft: number | null;
  /** Las que más la movieron, de mayor a menor. */
  keyPlays: KeyPlay[];
};

/** Función de error (Abramowitz-Stegun 7.1.26, error < 1,5e-7): JavaScript no la trae. */
function erf(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * z);
  const poly = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  const value = 1 - poly * Math.exp(-z * z);
  return x < 0 ? -value : value;
}

/** Lo que queda del reglamento o de la prórroga en curso (en el límite, del periodo que acaba). */
export function secondsLeft(seconds: number, regulation = 4): number {
  const end = regulation * REGULATION_PERIOD;
  if (seconds <= end) return end - seconds;
  return (OT_PERIOD - ((seconds - end) % OT_PERIOD)) % OT_PERIOD;
}

/** Probabilidad de que gane el local yendo `margin` arriba con `left` segundos por jugar (empate al final = 50 %). */
export function winProbability(margin: number, left: number): number {
  const spread = SIGMA * Math.sqrt((left + TIME_FLOOR) / FULL_GAME);
  return 0.5 * (1 + erf((margin + (HOME_EDGE * left) / FULL_GAME) / (spread * Math.SQRT2)));
}

/** Marcador en orden de partido: la NBA añade al final jugadas corregidas de cuartos anteriores. */
function sortFlow(flow: FlowPoint[]): FlowPoint[] {
  return flow
    .map((point, i) => ({ point, i }))
    .sort((a, b) => a.point[0] - b.point[0] || a.i - b.i)
    .map(({ point }) => point);
}

type Source = Pick<GameDetail, "status" | "regulationPeriods" | "flow" | "plays" | "elapsed"> & {
  away: { id: number; players: { id: number; short: string }[] };
  home: { id: number; players: { id: number; short: string }[] };
};

/**
 * Ganador si ya se sabe con lo que hay en la ficha: partido terminado o (en diferido, que nunca dice "Final")
 * el usuario ha llegado al final del 4.º o de una prórroga y no hay empate.
 */
function winnerOf(source: Source, flow: FlowPoint[]): Side | null {
  const [, away, home] = flow[flow.length - 1];
  if (away === home) return null;
  const last = source.plays.at(-1);
  const over = source.status === "Final" || (last?.kind === "period" && last.period >= source.regulationPeriods);
  return over ? (home > away ? "home" : "away") : null;
}

/** [segundo, probabilidad del local] en cada segundo y justo antes y después de cada canasta, hasta `elapsed`. */
function buildCurve(flow: FlowPoint[], elapsed: number, regulation: number, winner: Side | null): ProbabilityPoint[] {
  const curve: ProbabilityPoint[] = [];
  const push = (t: number, margin: number) => curve.push([t, winProbability(margin, secondsLeft(t, regulation))]);
  let margin = flow[0][2] - flow[0][1];
  let i = 1;
  const score = (until: number) => {
    for (; i < flow.length && flow[i][0] <= until; i++) {
      const [t, away, home] = flow[i];
      if (t < elapsed || !winner) {
        push(t, margin);
        push(t, home - away);
      }
      margin = home - away;
    }
  };
  for (let second = 0; second <= Math.floor(elapsed); second++) {
    score(second);
    if (second < elapsed || !winner) push(second, margin);
  }
  score(Infinity);
  if (winner) curve.push([elapsed, winner === "home" ? 1 : 0]);
  else if (elapsed > curve[curve.length - 1][0]) push(elapsed, margin);
  return curve;
}

/** "Triple de S. Curry + tiro libre", "J. Tatum anota 2 tiros libres". */
function playText(plays: Play[], names: Map<number, string>): string {
  const basket = plays.find((p) => p.points > 1);
  const freeThrows = plays.filter((p) => p !== basket).length;
  if (basket) return freeThrows === 0 ? basket.text : `${basket.text} + ${freeThrows === 1 ? "tiro libre" : `${freeThrows} tiros libres`}`;
  const who = plays[0].playerId !== null ? names.get(plays[0].playerId) : undefined;
  return plays.length > 1 && who ? `${who} anota ${plays.length} tiros libres` : plays[0].text;
}

/** Canastas con lo que movieron la probabilidad del equipo que anota; las del mismo jugador en el mismo segundo van juntas. */
function buildKeyPlays(source: Source, flow: FlowPoint[], winner: Side | null): KeyPlay[] {
  const { plays, away, home, regulationPeriods: regulation } = source;
  // El marcador tras cada canasta es único: enlaza la jugada (reloj sin décimas) con su segundo exacto
  const byScore = new Map(plays.filter((p) => p.points > 0 && p.kind === "score" && p.teamId).map((p) => [`${p.away}-${p.home}`, p]));
  const names = new Map([...away.players, ...home.players].map((p) => [p.id, p.short]));

  const groups: { seconds: number; from: FlowPoint; to: FlowPoint; plays: Play[] }[] = [];
  for (let i = 1; i < flow.length; i++) {
    const play = byScore.get(`${flow[i][1]}-${flow[i][2]}`);
    if (!play) continue;
    const last = groups.at(-1);
    if (last && last.to === flow[i - 1] && last.seconds === flow[i][0] && last.plays[0].playerId === play.playerId) {
      last.to = flow[i];
      last.plays.push(play);
    } else {
      groups.push({ seconds: flow[i][0], from: flow[i - 1], to: flow[i], plays: [play] });
    }
  }

  return groups.map(({ seconds, from, to, plays: group }, i): KeyPlay => {
    const first = group[0];
    const side: Side = first.teamId === home.id ? "home" : "away";
    const left = secondsLeft(seconds, regulation);
    const before = winProbability(from[2] - from[1], left);
    // La última canasta sobre la bocina decide: ya no hay tiempo para nada más
    const decisive = winner !== null && i === groups.length - 1 && left < 1;
    const after = decisive ? (winner === "home" ? 1 : 0) : winProbability(to[2] - to[1], left);
    return {
      id: first.id,
      seconds,
      period: first.period,
      clock: first.clock,
      side,
      playerId: first.playerId,
      text: playText(group, names),
      points: group.reduce((total, p) => total + p.points, 0),
      away: to[1],
      home: to[2],
      before: side === "home" ? before : 1 - before,
      after: side === "home" ? after : 1 - after,
    };
  });
}

/** Curva, jugadas clave y momentos del partido a partir de la ficha (completa o cortada en diferido). */
export function gameWinProbability(source: Source, keyPlayCount = 5): WinProbability {
  const flow = sortFlow(source.flow);
  const regulation = source.regulationPeriods;
  const winner = winnerOf(source, flow);
  const curve = buildCurve(flow, source.elapsed, regulation, winner);

  // El último punto de un partido acabado es el resultado (1 o 0), no una probabilidad
  const played = winner ? curve.slice(0, -1) : curve;
  const best: Record<Side, Moment> = { away: { seconds: 0, chance: 0 }, home: { seconds: 0, chance: 0 } };
  let lastAlive = 0;
  for (const [seconds, p] of played) {
    if (p > best.home.chance) best.home = { seconds, chance: p };
    if (1 - p > best.away.chance) best.away = { seconds, chance: 1 - p };
    if (winner && (winner === "home" ? 1 - p : p) >= ALIVE_CHANCE) lastAlive = Math.max(lastAlive, seconds);
  }

  const keyPlays = buildKeyPlays(source, flow, winner)
    .filter((p) => p.after > p.before)
    .sort((a, b) => b.after - b.before - (a.after - a.before) || a.seconds - b.seconds)
    .slice(0, keyPlayCount);

  return { curve, winner, best, decidedLeft: winner ? source.elapsed - lastAlive : null, keyPlays };
}

/** Curva aligerada para dibujarla: un punto cada `step` s, todos los de la recta final y los de cada canasta. */
export function drawableCurve(curve: ProbabilityPoint[], length: number, step = 4): ProbabilityPoint[] {
  const fine = Math.min(length, FULL_GAME) - 300;
  return curve.filter(
    ([t], i) => i === 0 || i === curve.length - 1 || t >= fine || t % step === 0 || t === curve[i - 1][0] || t === curve[i + 1][0]
  );
}

/** [visitante, local] en % enteros que suman 100; "<1" y ">99" mientras no esté decidido. */
export function chancePair(home: number): [away: string, home: string] {
  if (home >= 1) return ["0", "100"];
  if (home <= 0) return ["100", "0"];
  if (home < 0.01) return [">99", "<1"];
  if (home > 0.99) return ["<1", ">99"];
  const pct = Math.round(home * 100);
  return [String(100 - pct), String(pct)];
}

/** Probabilidad de un equipo en %: "63", "<1". */
export const chanceText = (chance: number): string => chancePair(chance)[1];
