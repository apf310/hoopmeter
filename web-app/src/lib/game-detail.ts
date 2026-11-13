// Ficha completa de un partido: boxscore y jugada a jugada de la CDN de la NBA, reducidos en el
// servidor a lo que pinta la ficha y con las métricas avanzadas ya calculadas (la jugada a jugada
// original pesa ~500 KB). Contiene el resultado: solo se sirve por `/api/games/[id]` en Nivel 3.
// Los componentes del cliente solo importan sus tipos (`import type`).
import { cacheLife } from "next/cache";
import { periodName } from "@/lib/game-format";
import { buildPeriodText, fetchLiveData } from "@/lib/live";
import type { Game } from "@/lib/spoilers";


const REGULATION_PERIOD_S = 12 * 60;
const OVERTIME_PERIOD_S = 5 * 60;
const FEET_TO_METERS = 0.3048;

// --- Tipos que consume la UI ---

/** Zonas de tiro clásicas de la NBA. */
export type ShotZone = "ra" | "paint" | "mid" | "corner3" | "above3";

export type Shot = {
  /** Décimas de pie respecto al aro (coordenadas clásicas de la NBA): `y` crece hacia el centro del campo. */
  x: number;
  y: number;
  made: boolean;
  three: boolean;
  zone: ShotZone;
  teamId: number;
  playerId: number;
  period: number;
  clock: string;
  /** "Triple tras bote de S. Curry (7.6 m) · asist. D. Green" */
  text: string;
};

export type PlayKind = "score" | "miss" | "rebound" | "turnover" | "foul" | "timeout" | "period" | "other";

export type Play = {
  id: number;
  period: number;
  clock: string;
  teamId: number | null;
  playerId: number | null;
  /** Todos los jugadores implicados: autor, asistente, quien roba, tapona o recibe la falta. */
  involved: number[];
  kind: PlayKind;
  /** Puntos que suma la jugada (0 si no anota). */
  points: number;
  /** Puntos acumulados del anotador tras la canasta. */
  total: number | null;
  text: string;
  /** Marcador tras la jugada. */
  away: number;
  home: number;
};

/** [segundos de juego transcurridos, puntos del visitante, puntos del local] */
export type FlowPoint = [seconds: number, away: number, home: number];

/** Mayor parcial sin respuesta del rival. */
export type ScoringRun = {
  points: number;
  from: { period: number; clock: string };
  to: { period: number; clock: string };
};

export type BoxLine = {
  pts: number;
  reb: number;
  oreb: number;
  dreb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
  fgm: number;
  fga: number;
  fg3m: number;
  fg3a: number;
  ftm: number;
  fta: number;
  paintPts: number;
  fastBreakPts: number;
  secondChancePts: number;
};

export type PlayerLine = BoxLine & {
  id: number;
  name: string;
  /** "S. Curry" */
  short: string;
  jersey: string | null;
  /** Solo los titulares traen posición en el boxscore. */
  position: string | null;
  starter: boolean;
  onCourt: boolean;
  played: boolean;
  /** Motivo de la ausencia en español ("Lesión", "Decisión técnica"…); null si ha jugado. */
  absence: string | null;
  absenceDetail: string | null;
  seconds: number;
  plusMinus: number;
  foulsDrawn: number;
  tsPct: number | null;
  efgPct: number | null;
  usgPct: number | null;
  /** Valoración Game Score de John Hollinger. */
  gameScore: number;
};

export type TeamTotals = BoxLine & {
  pointsOffTurnovers: number;
  benchPts: number;
  biggestLead: number;
  timeLeadingS: number;
  possessions: number;
  offRtg: number | null;
  defRtg: number | null;
  efgPct: number | null;
  tsPct: number | null;
  tovPct: number | null;
  orbPct: number | null;
  ftRate: number | null;
};

export type TeamBox = {
  id: number;
  tricode: string;
  name: string;
  score: number;
  periods: number[];
  timeoutsRemaining: number | null;
  inBonus: boolean;
  totals: TeamTotals;
  run: ScoringRun | null;
  players: PlayerLine[];
};

export type GameDetail = {
  id: string;
  status: Game["status"];
  /** Mismo formato que `games.live_period_text`: "Q3 04:12", "Descanso"… (solo en directo). */
  periodText: string | null;
  period: number;
  regulationPeriods: number;
  arena: string | null;
  city: string | null;
  attendance: number | null;
  sellout: boolean;
  durationMin: number | null;
  officials: string[];
  /** Posesiones por 48 minutos. */
  pace: number | null;
  leadChanges: number;
  timesTied: number;
  away: TeamBox;
  home: TeamBox;
  flow: FlowPoint[];
  /** Segundos jugados hasta la última jugada registrada. */
  elapsed: number;
  /** Duración del eje temporal: 48 min + las prórrogas jugadas o en juego. */
  length: number;
  shots: Shot[];
  plays: Play[];
  fetchedAt: string;
};

// --- Forma (parcial) del JSON de la CDN ---

type RawStats = {
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
type RawPlayer = {
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
type RawTeam = {
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
type RawBoxscoreGame = {
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
type RawAction = {
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
};

// --- Descarga ---

/** JSON de la NBA; null si aún no existe (antes del salto inicial la NBA responde 403/404). */
async function fetchCdn<T>(path: string): Promise<T | null> {
  return fetchLiveData<T>(path);
}

/**
 * Ficha del partido, null si aún no ha empezado. Caché compartida: 30 s mientras se juega
 * (1 petición a la NBA cada 30 s, la miren 1 o 2.000 personas) y horas cuando ya es Final.
 * Los errores no se cachean.
 */
export async function getGameDetail(gameId: string): Promise<GameDetail | null> {
  "use cache";

  const [box, pbp] = await Promise.all([
    fetchCdn<{ game: RawBoxscoreGame }>(`boxscore/boxscore_${gameId}.json`),
    fetchCdn<{ game: { actions: RawAction[] } }>(`playbyplay/playbyplay_${gameId}.json`),
  ]);
  if (!box || box.game.gameStatus === 1) {
    cacheLife({ stale: 60, revalidate: 60, expire: 300 });
    return null;
  }

  const detail = buildDetail(box.game, pbp?.game.actions ?? []);
  // Sin jugada a jugada todavía (llega con algo de retraso): se reintenta como si estuviera en juego
  if (detail.status === "Final" && pbp) cacheLife("hours");
  else cacheLife({ stale: 30, revalidate: 30, expire: 300 });
  return detail;
}

// --- Utilidades ---

/** "PT27M45.00S" → 1665 */
function isoSeconds(iso: string | null | undefined): number {
  const match = /PT(\d+)M(\d+(?:\.\d+)?)S/.exec(iso ?? "");
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}

/** Reloj del periodo: "PT05M31.00S" → "5:31" */
function clockText(iso: string): string {
  const total = Math.floor(isoSeconds(iso));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Segundos de juego transcurridos al terminar los periodos anteriores a `period`. */
function periodStart(period: number, regulation: number): number {
  return (
    Math.min(period - 1, regulation) * REGULATION_PERIOD_S + Math.max(0, period - 1 - regulation) * OVERTIME_PERIOD_S
  );
}

function elapsedAt(period: number, clock: string, regulation: number): number {
  const length = period <= regulation ? REGULATION_PERIOD_S : OVERTIME_PERIOD_S;
  return periodStart(period, regulation) + length - isoSeconds(clock);
}

const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);

/** Intentos de tiro "reales": cada tiro libre cuenta como 0.44 de posesión. */
const shootingAttempts = (l: BoxLine) => l.fga + 0.44 * l.fta;

function boxLine(s: RawStats, rebounds: number, turnovers: number): BoxLine {
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

function gameScore(l: BoxLine): number {
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
function possessions(a: BoxLine, b: BoxLine): number {
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

function absenceOf(player: RawPlayer, live: boolean): { absence: string | null; detail: string | null } {
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

function shotText(action: RawAction, made: boolean): string {
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
function describe(action: RawAction, regulation: number): { kind: PlayKind; text: string } | null {
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

function zoneOf(x: number, y: number, three: boolean): ShotZone {
  if (three) return y <= CORNER_Y && Math.abs(x) >= 220 ? "corner3" : "above3";
  // Zona restringida: semicírculo de 4 pies alrededor del aro (y su prolongación hasta el fondo)
  if (y <= 0 ? Math.abs(x) <= 40 : Math.hypot(x, y) <= 40) return "ra";
  if (Math.abs(x) <= 80 && y <= 142.5) return "paint";
  return "mid";
}

// --- Montaje de la ficha ---

function buildDetail(game: RawBoxscoreGame, rawActions: RawAction[]): GameDetail {
  const status: Game["status"] = game.gameStatus === 3 ? "Final" : "Live";
  const regulation = game.regulationPeriods ?? 4;

  const actions = [...rawActions].sort((a, b) => (a.orderNumber ?? a.actionNumber) - (b.orderNumber ?? b.actionNumber));

  // Marcador a lo largo del partido, jugada a jugada y tiros
  const flow: FlowPoint[] = [[0, 0, 0]];
  const plays: Play[] = [];
  const shots: Shot[] = [];
  // Tramos seguidos anotando solo un equipo (de ahí salen los mayores parciales)
  const streaks: (ScoringRun & { side: "away" | "home" })[] = [];
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

  const longest = (side: "away" | "home"): ScoringRun | null => {
    const best = streaks.filter((s) => s.side === side).reduce<ScoringRun | null>((max, s) => (s.points > (max?.points ?? 0) ? s : max), null);
    return best && { points: best.points, from: best.from, to: best.to };
  };
  const away = teamBox(game.awayTeam, game.homeTeam, longest("away"), status);
  const home = teamBox(game.homeTeam, game.awayTeam, longest("home"), status);
  const periods = Math.max(game.period, regulation);
  const teamSeconds = isoSeconds(game.homeTeam.statistics.minutes);

  return {
    id: game.gameId,
    status,
    periodText: buildPeriodText({ ...game, regulationPeriods: regulation }, status),
    period: game.period,
    regulationPeriods: regulation,
    arena: game.arena?.arenaName || null,
    city: game.arena?.arenaCity || null,
    attendance: game.attendance || null,
    sellout: game.sellout === "1",
    durationMin: status === "Final" && game.duration ? game.duration : null,
    officials: (game.officials ?? []).map((o) => o.name),
    pace: teamSeconds > 0 ? (away.totals.possessions * 5 * 48 * 60) / teamSeconds : null,
    leadChanges: game.homeTeam.statistics.leadChanges ?? 0,
    timesTied: game.homeTeam.statistics.timesTied ?? 0,
    away,
    home,
    flow,
    elapsed: status === "Final" ? periodStart(periods + 1, regulation) : elapsed,
    length: periodStart(periods + 1, regulation),
    shots,
    plays,
    fetchedAt: new Date().toISOString(),
  };
}

function teamBox(team: RawTeam, rival: RawTeam, run: ScoringRun | null, status: Game["status"]): TeamBox {
  const s = team.statistics;
  const line = boxLine(s, s.reboundsPersonal, s.turnoversTotal);
  const rivalLine = boxLine(rival.statistics, rival.statistics.reboundsPersonal, rival.statistics.turnoversTotal);
  const teamSeconds = isoSeconds(s.minutes);
  const poss = possessions(line, rivalLine);
  const usageBase = shootingAttempts(line) + line.tov;

  const players = (team.players ?? []).map((p): PlayerLine => {
    const ps = p.statistics;
    const pl = boxLine(ps, ps.reboundsTotal, ps.turnovers);
    const seconds = isoSeconds(ps.minutes);
    const { absence, detail } = absenceOf(p, status === "Live");
    return {
      ...pl,
      id: p.personId,
      name: p.name,
      short: p.nameI,
      jersey: p.jerseyNum || null,
      position: p.position || null,
      starter: p.starter === "1",
      onCourt: status === "Live" && p.oncourt === "1",
      played: p.played === "1",
      absence,
      absenceDetail: detail,
      seconds,
      plusMinus: Math.round(ps.plusMinusPoints ?? 0),
      foulsDrawn: ps.foulsDrawn ?? 0,
      tsPct: ratio(pl.pts, 2 * shootingAttempts(pl)),
      efgPct: ratio(pl.fgm + 0.5 * pl.fg3m, pl.fga),
      // Uso: % de jugadas del equipo que termina él mientras está en pista (con menos de 1 min no es fiable)
      usgPct:
        seconds >= 60 && usageBase > 0 ? ((shootingAttempts(pl) + pl.tov) * (teamSeconds / 5)) / (seconds * usageBase) : null,
      gameScore: gameScore(pl),
    };
  });

  return {
    id: team.teamId,
    tricode: team.teamTricode,
    name: `${team.teamCity} ${team.teamName}`,
    score: team.score,
    periods: team.periods.map((p) => p.score),
    timeoutsRemaining: team.timeoutsRemaining ?? null,
    inBonus: team.inBonus === "1",
    run,
    players,
    totals: {
      ...line,
      pointsOffTurnovers: s.pointsFromTurnovers ?? 0,
      benchPts: s.benchPoints ?? 0,
      biggestLead: s.biggestLead ?? 0,
      timeLeadingS: isoSeconds(s.timeLeading),
      possessions: poss,
      offRtg: poss > 0 ? (100 * line.pts) / poss : null,
      defRtg: poss > 0 ? (100 * rivalLine.pts) / poss : null,
      efgPct: ratio(line.fgm + 0.5 * line.fg3m, line.fga),
      tsPct: ratio(line.pts, 2 * shootingAttempts(line)),
      tovPct: ratio(line.tov, shootingAttempts(line) + line.tov),
      orbPct: ratio(line.oreb, line.oreb + rivalLine.dreb),
      ftRate: ratio(line.ftm, line.fga),
    },
  };
}
