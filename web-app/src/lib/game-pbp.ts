// Lectura pura de la jugada a jugada y del boxscore de la CDN de la NBA (sin red ni Next):
// tipos del JSON original, utilidades de tiempo y estadística, textos en español y el recorrido
// de las jugadas. Lo usan la ficha completa (`game-detail.ts`) y el modo diferido (`deferred.ts`).
import { periodName } from "./game-format.ts";
import type { BoxLine, FlowPoint, Play, PlayKind, ScoringRun, Shot, ShotZone } from "./game-detail.ts";

export const REGULATION_PERIOD_S = 12 * 60;
export const OVERTIME_PERIOD_S = 5 * 60;
const FEET_TO_METERS = 0.3048;

// --- Forma (parcial) del JSON de la CDN ---

export type RawStats = {
  points: number;
  reboundsTotal: number;
  reboundsOffensive: number;
  reboundsDefensive: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  foulsPersonal: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  threePointersMade: number;
  threePointersAttempted: number;
  freeThrowsMade: number;
  freeThrowsAttempted: number;
  pointsInThePaint: number;
  pointsFastBreak: number;
  pointsSecondChance: number;
  minutes: string;
};
export type RawPlayer = {
  personId: number;
  name: string;
  nameI: string;
  jerseyNum?: string;
  position?: string;
  starter: string;
  oncourt: string;
  played: string;
  status: string;
  notPlayingReason?: string;
  notPlayingDescription?: string;
  statistics: RawStats & { plusMinusPoints: number; foulsDrawn: number };
};
export type RawTeam = {
  teamId: number;
  teamName: string;
  teamCity: string;
  teamTricode: string;
  score: number;
  inBonus: string | null;
  timeoutsRemaining: number | null;
  periods: { period: number; score: number }[];
  players?: RawPlayer[];
  statistics: RawStats & {
    reboundsPersonal: number;
    turnoversTotal: number;
    pointsFromTurnovers: number;
    benchPoints: number;
    biggestLead: number;
    leadChanges: number;
    timesTied: number;
    timeLeading: string;
  };
};
export type RawBoxscoreGame = {
  gameId: string;
  gameStatus: 1 | 2 | 3;
  gameStatusText: string;
  period: number;
  gameClock: string;
  regulationPeriods?: number;
  duration?: number;
  attendance?: number;
  sellout?: string;
  arena?: { arenaName?: string; arenaCity?: string };
  officials?: { name: string }[];
  homeTeam: RawTeam;
  awayTeam: RawTeam;
};
export type RawAction = {
  actionNumber: number;
  orderNumber?: number;
  clock: string;
  period: number;
  teamId?: number | null;
  teamTricode?: string | null;
  personId?: number | null;
  playerNameI?: string | null;
  actionType: string;
  subType?: string | null;
  descriptor?: string | null;
  qualifiers?: string[];
  shotResult?: string | null;
  isFieldGoal?: number;
  xLegacy?: number | null;
  yLegacy?: number | null;
  shotDistance?: number | null;
  pointsTotal?: number | null;
  scoreHome: string;
  scoreAway: string;
  assistPlayerNameInitial?: string | null;
  blockPlayerName?: string | null;
  stealPlayerName?: string | null;
  foulDrawnPlayerName?: string | null;
  jumpBallWonPlayerName?: string | null;
  personIdsFilter?: number[];
  // Ids de los demás implicados (para rehacer el boxscore en el modo diferido)
  assistPersonId?: number | null;
  blockPersonId?: number | null;
  stealPersonId?: number | null;
  foulDrawnPersonId?: number | null;
};

// --- Utilidades ---

/** "PT27M45.00S" → 1665 */
export function isoSeconds(iso: string | null | undefined): number {
  const match = /PT(\d+)M(\d+(?:\.\d+)?)S/.exec(iso ?? "");
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}

/** Reloj del periodo: "PT05M31.00S" → "5:31" */
export function clockText(iso: string): string {
  const total = Math.floor(isoSeconds(iso));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Segundos de juego transcurridos al terminar los periodos anteriores a `period`. */
export function periodStart(period: number, regulation: number): number {
  return (
    Math.min(period - 1, regulation) * REGULATION_PERIOD_S + Math.max(0, period - 1 - regulation) * OVERTIME_PERIOD_S
  );
}

export function elapsedAt(period: number, clock: string, regulation: number): number {
  const length = period <= regulation ? REGULATION_PERIOD_S : OVERTIME_PERIOD_S;
  return periodStart(period, regulation) + length - isoSeconds(clock);
}

export const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);

/** Intentos de tiro "reales": cada tiro libre cuenta como 0.44 de posesión. */
export const shootingAttempts = (l: BoxLine) => l.fga + 0.44 * l.fta;

export function boxLine(s: RawStats, rebounds: number, turnovers: number): BoxLine {
  return {
    pts: s.points,
    reb: rebounds,
    oreb: s.reboundsOffensive,
    dreb: s.reboundsDefensive,
    ast: s.assists,
    stl: s.steals,
    blk: s.blocks,
    tov: turnovers,
    pf: s.foulsPersonal,
    fgm: s.fieldGoalsMade,
    fga: s.fieldGoalsAttempted,
    fg3m: s.threePointersMade,
    fg3a: s.threePointersAttempted,
    ftm: s.freeThrowsMade,
    fta: s.freeThrowsAttempted,
    paintPts: s.pointsInThePaint,
    fastBreakPts: s.pointsFastBreak,
    secondChancePts: s.pointsSecondChance,
  };
}

export function gameScore(l: BoxLine): number {
  return (
    l.pts +
    0.4 * l.fgm -
    0.7 * l.fga -
    0.4 * (l.fta - l.ftm) +
    0.7 * l.oreb +
    0.3 * l.dreb +
    l.stl +
    0.7 * l.ast +
    0.7 * l.blk -
    0.4 * l.pf -
    l.tov
  );
}

/** Posesiones estimadas del partido (fórmula de Basketball-Reference, media de los dos equipos). */
export function possessions(a: BoxLine, b: BoxLine): number {
  const side = (t: BoxLine, o: BoxLine) =>
    t.fga + 0.4 * t.fta - 1.07 * (ratio(t.oreb, t.oreb + o.dreb) ?? 0) * (t.fga - t.fgm) + t.tov;
  return 0.5 * (side(a, b) + side(b, a));
}

// --- Ausencias ---

const ABSENCE_REASONS: [code: string, label: string][] = [
  ["INJURY", "Lesión"],
  ["ILLNESS", "Enfermedad"],
  ["REST", "Descanso"],
  ["PERSONAL", "Motivos personales"],
  ["SUSPENSION", "Sanción"],
  ["GLEAGUE", "G League"],
  ["TWOWAY", "G League"],
  ["TRADE", "Traspaso"],
  ["NOT_WITH_TEAM", "No viajó"],
  ["NWT", "No viajó"],
  ["COACH", "Decisión técnica"],
];

const BODY_PARTS: Record<string, [name: string, feminine: boolean]> = {
  knee: ["rodilla", true],
  ankle: ["tobillo", false],
  hamstring: ["isquiotibial", false],
  "lower back": ["zona lumbar", true],
  back: ["espalda", true],
  hip: ["cadera", true],
  foot: ["pie", false],
  calf: ["gemelo", false],
  shoulder: ["hombro", false],
  wrist: ["muñeca", true],
  hand: ["mano", true],
  groin: ["ingle", true],
  achilles: ["tendón de Aquiles", false],
  thumb: ["pulgar", false],
  finger: ["dedo", false],
  elbow: ["codo", false],
  quadriceps: ["cuádriceps", false],
  quad: ["cuádriceps", false],
  toe: ["dedo del pie", false],
  adductor: ["aductor", false],
  heel: ["talón", false],
  thigh: ["muslo", false],
  neck: ["cuello", false],
  oblique: ["oblicuo", false],
  abdominal: ["abdominal", false],
  rib: ["costilla", true],
  shin: ["tibia", true],
  forearm: ["antebrazo", false],
  eye: ["ojo", false],
  nose: ["nariz", true],
  face: ["cara", true],
};

const CONDITIONS: Record<string, string> = {
  soreness: "molestias",
  sprain: "esguince",
  strain: "distensión",
  contusion: "contusión",
  bruise: "contusión",
  fracture: "fractura",
  surgery: "operación",
  tendinitis: "tendinitis",
  tendonitis: "tendinitis",
  inflammation: "inflamación",
  tear: "rotura",
  tightness: "sobrecarga",
  spasms: "espasmos",
  dislocation: "luxación",
  laceration: "corte",
  "injury management": "gestión de la lesión",
  "injury recovery": "recuperación",
  "plantar fasciitis": "fascitis plantar",
  concussion: "conmoción cerebral",
  illness: "enfermedad",
  rest: "descanso",
};

// Las claves más largas primero: "lower back" antes que "back"
const byLength = (keys: string[]) => keys.sort((a, b) => b.length - a.length);
const BODY_KEYS = byLength(Object.keys(BODY_PARTS));
const CONDITION_KEYS = byLength(Object.keys(CONDITIONS));
const findWord = (text: string, keys: string[]) => keys.find((key) => new RegExp(`\\b${key}\\b`).test(text));

/** "Left Knee; Soreness" o "Left Quadriceps Contusion" → "rodilla izquierda (molestias)". Si no se reconoce, se deja tal cual. */
function translateInjury(description: string): string {
  const text = description.toLowerCase();
  const body = findWord(text, BODY_KEYS);
  const condition = findWord(text, CONDITION_KEYS);
  const conditionEs = condition ? CONDITIONS[condition] : null;
  if (!body) return conditionEs ?? description;

  const [name, feminine] = BODY_PARTS[body];
  const side = /\b(left|right)\b/.exec(text)?.[1];
  const sideEs = side ? ` ${side === "left" ? "izquierd" : "derech"}${feminine ? "a" : "o"}` : "";
  return `${name}${sideEs}${conditionEs ? ` (${conditionEs})` : ""}`;
}

export function absenceOf(player: RawPlayer, live: boolean): { absence: string | null; detail: string | null } {
  if (player.played === "1") return { absence: null, detail: null };
  const code = player.notPlayingReason ?? "";
  const reason = ABSENCE_REASONS.find(([key]) => code.includes(key))?.[1];
  const absence = reason ?? (player.status === "INACTIVE" ? "Inactivo" : live ? "Sin minutos" : "Decisión técnica");
  const detail = player.notPlayingDescription && /INJURY|ILLNESS/.test(code) ? translateInjury(player.notPlayingDescription) : null;
  // "Enfermedad · enfermedad" no aporta nada
  return { absence, detail: detail && detail.toLowerCase() !== absence.toLowerCase() ? detail : null };
}

// --- Jugada a jugada en español ---

const meters = (feet: number) => `${(feet * FEET_TO_METERS).toFixed(1)} m`;

/** Tipo de tiro y su género gramatical ("una bandeja", "un triple"). */
function shotKind(action: RawAction): { label: string; feminine: boolean; jumper: boolean } {
  const d = (action.descriptor ?? "").toLowerCase();
  const sub = (action.subType ?? "").toLowerCase();
  if (action.actionType === "3pt") {
    const label = d.includes("step back") ? "triple con step back" : d.includes("pullup") ? "triple tras bote" : d.includes("running") ? "triple en carrera" : "triple";
    return { label, feminine: false, jumper: true };
  }
  if (sub === "dunk") {
    return { label: d.includes("alley-oop") ? "alley-oop" : d.includes("tip") ? "palmeo con mate" : "mate", feminine: false, jumper: false };
  }
  if (sub === "layup") {
    if (d.includes("tip")) return { label: "palmeo", feminine: false, jumper: false };
    if (d.includes("alley-oop")) return { label: "alley-oop", feminine: false, jumper: false };
    const label = d.includes("putback") ? "bandeja tras rebote" : d.includes("reverse") ? "bandeja a aro pasado" : "bandeja";
    return { label, feminine: true, jumper: false };
  }
  if (sub === "hook") return { label: d.includes("bank") ? "gancho a tablero" : "gancho", feminine: false, jumper: true };
  if (d.includes("float")) return { label: d.includes("bank") ? "bomba a tablero" : "bomba", feminine: true, jumper: true };
  const label = d.includes("fadeaway")
    ? "fadeaway"
    : d.includes("step back")
      ? "step back"
      : d.includes("turnaround")
        ? "tiro tras giro"
        : d.includes("pullup")
          ? "tiro tras bote"
          : "tiro";
  return { label: d.includes("bank") ? `${label} a tablero` : label, feminine: false, jumper: true };
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function shotText(action: RawAction, made: boolean): string {
  const who = action.playerNameI ?? "";
  const { label, feminine, jumper } = shotKind(action);
  const distance = jumper && action.shotDistance ? ` (${meters(action.shotDistance)})` : "";
  if (made) {
    const extras = [
      action.assistPlayerNameInitial && `asist. ${action.assistPlayerNameInitial}`,
      action.qualifiers?.includes("fastbreak") && "contraataque",
    ].filter(Boolean);
    return `${capitalize(label)} de ${who}${distance}${extras.length ? ` · ${extras.join(" · ")}` : ""}`;
  }
  const block = action.blockPlayerName ? ` · tapón de ${action.blockPlayerName}` : "";
  return `${who} falla ${feminine ? "una" : "un"} ${label}${distance}${block}`;
}

const TURNOVERS: Record<string, string> = {
  "bad pass": "mal pase",
  "lost ball": "balón perdido",
  traveling: "pasos",
  "offensive foul": "falta en ataque",
  "out-of-bounds": "balón fuera",
  "3-second-violation": "3 segundos",
  "shot clock": "24 segundos",
  "8-second-violation": "8 segundos",
  "5-second-violation": "5 segundos",
  backcourt: "campo atrás",
  "double dribble": "dobles",
  "discontinued dribble": "dobles",
  palming: "conducción ilegal",
  "offensive goaltending": "interferencia en ataque",
  "kicked ball": "pie",
  "lane violation": "invasión de la zona",
};

const VIOLATIONS: Record<string, string> = {
  "kicked ball": "pie",
  lane: "invasión de la zona",
  "double lane": "doble invasión de la zona",
  "delay-of-game": "retraso del juego",
  "defensive goaltending": "interferencia defensiva",
  "jump ball": "salto entre dos",
};

function foulText(action: RawAction, who: string): string {
  const sub = (action.subType ?? "").toLowerCase();
  const d = (action.descriptor ?? "").toLowerCase();
  let label = "Falta";
  if (sub === "offensive") label = d.includes("charge") ? "Falta en ataque (carga)" : "Falta en ataque";
  else if (sub === "technical") label = d.includes("3-second") ? "Técnica por 3 segundos defensivos" : d.includes("double") ? "Doble técnica" : "Falta técnica";
  else if (sub === "flagrant") label = `Antideportiva${/2/.test(d) ? " (tipo 2)" : ""}`;
  else if (d.includes("shooting")) label = "Falta en el tiro";
  else if (d.includes("loose ball")) label = "Falta en la lucha por el balón";
  else if (d.includes("take")) label = "Falta táctica";
  else if (sub === "personal") label = "Falta personal";
  const on = action.foulDrawnPlayerName ? ` sobre ${action.foulDrawnPlayerName}` : "";
  return `${label} de ${who}${on}`;
}

/** Texto en español de cada jugada; null para las que no se muestran (cambios, y tapones y robos, que ya van en el tiro o la pérdida). */
export function describe(action: RawAction, regulation: number): { kind: PlayKind; text: string } | null {
  const who = action.playerNameI ?? action.teamTricode ?? "";
  const sub = (action.subType ?? "").toLowerCase();
  const d = (action.descriptor ?? "").toLowerCase();
  const made = action.shotResult === "Made";

  switch (action.actionType) {
    case "2pt":
    case "3pt":
      return { kind: made ? "score" : "miss", text: shotText(action, made) };
    case "freethrow": {
      const which = sub.replace(/flagrant/, "").replace(/technical/, "").replace(" of ", " de ").trim();
      const type = d.includes("technical") || sub.includes("technical") ? "tiro libre técnico" : "tiro libre";
      return { kind: made ? "score" : "miss", text: `${who} ${made ? "anota" : "falla"} el ${type}${which ? ` ${which}` : ""}` };
    }
    case "rebound":
      return { kind: "rebound", text: `Rebote ${sub === "offensive" ? "ofensivo" : "defensivo"} de ${who}` };
    case "turnover": {
      const reason = TURNOVERS[sub] ?? sub;
      const steal = action.stealPlayerName ? ` · robo de ${action.stealPlayerName}` : "";
      return { kind: "turnover", text: `Pérdida de ${who}${reason ? ` (${reason})` : ""}${steal}` };
    }
    case "foul":
      return { kind: "foul", text: foulText(action, who) };
    case "timeout":
      return { kind: "timeout", text: sub.includes("challenge") ? `Challenge de ${who}` : `Tiempo muerto de ${who}` };
    case "jumpball":
      return {
        kind: "other",
        text: `${d.includes("startperiod") ? "Salto inicial" : "Salto entre dos"}${action.jumpBallWonPlayerName ? `: gana ${action.jumpBallWonPlayerName}` : ""}`,
      };
    case "violation":
      return { kind: "other", text: `Violación de ${who}${sub ? ` (${VIOLATIONS[sub] ?? sub})` : ""}` };
    case "ejection":
      return { kind: "other", text: `Expulsión de ${who}${sub.includes("second") ? " (segunda técnica)" : ""}` };
    case "period":
      // El inicio ya lo marca la cabecera de cada periodo en la lista; el final lleva el marcador parcial
      if (sub !== "end") return null;
      return { kind: "period", text: `Termina ${action.period > regulation ? "la" : "el"} ${periodName(action.period, regulation).toLowerCase()}` };
    case "game":
      return sub === "end" ? { kind: "period", text: "Final del partido" } : null;
    default:
      return null;
  }
}

// --- Zonas de tiro ---

/** Hasta aquí (desde la línea de fondo, en décimas de pie) el triple es "de esquina". */
const CORNER_Y = 92.5;

export function zoneOf(x: number, y: number, three: boolean): ShotZone {
  if (three) return y <= CORNER_Y && Math.abs(x) >= 220 ? "corner3" : "above3";
  // Zona restringida: semicírculo de 4 pies alrededor del aro (y su prolongación hasta el fondo)
  if (y <= 0 ? Math.abs(x) <= 40 : Math.hypot(x, y) <= 40) return "ra";
  if (Math.abs(x) <= 80 && y <= 142.5) return "paint";
  return "mid";
}

// --- Recorrido de la jugada a jugada ---

/** Tramo seguido anotando solo un equipo (de ahí salen los mayores parciales). */
export type Streak = ScoringRun & { side: "away" | "home" };

export type ActionScan = {
  /** Marcador a lo largo del partido. */
  flow: FlowPoint[];
  plays: Play[];
  shots: Shot[];
  streaks: Streak[];
  /** Segundos jugados hasta la última jugada recorrida. */
  elapsed: number;
};

/** La jugada a jugada en el orden en que ocurrió. */
export function sortActions(actions: RawAction[]): RawAction[] {
  return [...actions].sort((a, b) => (a.orderNumber ?? a.actionNumber) - (b.orderNumber ?? b.actionNumber));
}

/** Marcador, jugadas en español y tiros de unas jugadas ya ordenadas (`sortActions`). */
export function scanActions(actions: RawAction[], regulation: number): ActionScan {
  const flow: FlowPoint[] = [[0, 0, 0]];
  const plays: Play[] = [];
  const shots: Shot[] = [];
  const streaks: Streak[] = [];
  let score = { away: 0, home: 0 };
  let elapsed = 0;

  for (const action of actions) {
    elapsed = Math.max(elapsed, elapsedAt(action.period, action.clock, regulation));
    const next = { away: Number(action.scoreAway) || score.away, home: Number(action.scoreHome) || score.home };
    const points = next.away - score.away + (next.home - score.home);
    const clock = clockText(action.clock);

    if (points > 0) {
      flow.push([elapsedAt(action.period, action.clock, regulation), next.away, next.home]);
      const side = next.away > score.away ? "away" : "home";
      const at = { period: action.period, clock };
      const last = streaks.at(-1);
      if (last?.side === side) {
        last.points += points;
        last.to = at;
      } else {
        streaks.push({ side, points, from: at, to: at });
      }
    }

    const description = describe(action, regulation);
    if (description) {
      plays.push({
        id: action.actionNumber,
        period: action.period,
        clock,
        teamId: action.teamId || null,
        playerId: action.personId || null,
        involved: (action.personIdsFilter ?? []).filter((id) => id > 0),
        kind: description.kind,
        points: Math.max(0, points),
        total: description.kind === "score" ? (action.pointsTotal ?? null) : null,
        text: description.text,
        away: next.away,
        home: next.home,
      });
    }

    if (action.isFieldGoal === 1 && action.xLegacy != null && action.yLegacy != null && action.teamId && action.personId) {
      const three = action.actionType === "3pt";
      const made = action.shotResult === "Made";
      shots.push({
        x: action.xLegacy,
        y: action.yLegacy,
        made,
        three,
        zone: zoneOf(action.xLegacy, action.yLegacy, three),
        teamId: action.teamId,
        playerId: action.personId,
        period: action.period,
        clock,
        text: shotText(action, made),
      });
    }
    score = next;
  }

  return { flow, plays, shots, streaks, elapsed };
}

/** Mayor parcial de un equipo. */
export function longestRun(streaks: Streak[], side: "away" | "home"): ScoringRun | null {
  const best = streaks.filter((s) => s.side === side).reduce<Streak | null>((max, s) => (s.points > (max?.points ?? 0) ? s : max), null);
  return best && { points: best.points, from: best.from, to: best.to };
}

// --- Métricas avanzadas ---

/** Acierto real, efectivo, uso y Game Score de un jugador. `team` = línea de su equipo. */
export function playerMetrics(line: BoxLine, seconds: number, team: BoxLine, teamSeconds: number) {
  const usageBase = shootingAttempts(team) + team.tov;
  return {
    tsPct: ratio(line.pts, 2 * shootingAttempts(line)),
    efgPct: ratio(line.fgm + 0.5 * line.fg3m, line.fga),
    // Uso: % de jugadas del equipo que termina él mientras está en pista (con menos de 1 min no es fiable)
    usgPct:
      seconds >= 60 && usageBase > 0 ? ((shootingAttempts(line) + line.tov) * (teamSeconds / 5)) / (seconds * usageBase) : null,
    gameScore: gameScore(line),
  };
}

/** Posesiones, ratings y los "cuatro factores" de un equipo frente a su rival. */
export function teamMetrics(line: BoxLine, rival: BoxLine) {
  const poss = possessions(line, rival);
  return {
    possessions: poss,
    offRtg: poss > 0 ? (100 * line.pts) / poss : null,
    defRtg: poss > 0 ? (100 * rival.pts) / poss : null,
    efgPct: ratio(line.fgm + 0.5 * line.fg3m, line.fga),
    tsPct: ratio(line.pts, 2 * shootingAttempts(line)),
    tovPct: ratio(line.tov, shootingAttempts(line) + line.tov),
    orbPct: ratio(line.oreb, line.oreb + rival.dreb),
    ftRate: ratio(line.ftm, line.fga),
  };
}
