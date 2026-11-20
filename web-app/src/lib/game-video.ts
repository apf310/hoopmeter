// Modo Creador en vídeo (Tarea 6.15): línea de tiempo del vídeo vertical de un partido. Para cada
// instante del vídeo dice cómo iba el partido: marcador, reloj, tiros ya lanzados y cuarto a cuarto.
// Puro (sin DOM): lo dibuja `components/share/GameVideo.ts`. Contiene el resultado: solo Nivel 3.
import type { FlowPoint, GameDetail, Shot } from "./game-detail.ts";
import { periodStart } from "./game-pbp.ts";

export const VIDEO_FPS = 30;
/** Duración total del vídeo, en segundos. */
export const VIDEO_DURATION = 12;
/** Presentación (equipos, 0-0) antes de que eche a andar el reloj. */
export const VIDEO_INTRO = 1.2;
/** El partido corre hasta aquí; el resto es el final congelado (resultado, cuartos y nota). */
export const VIDEO_PLAY_END = 9.4;
/** Los tiros "aparecen" durante este tiempo (vídeo). */
export const SHOT_POP = 0.35;

/** Los últimos 5 minutos del tiempo reglamentario y la prórroga van 2,5 veces más despacio. */
const CLUTCH_WINDOW_S = 300;
const CLUTCH_WEIGHT = 2.5;

/** Lo que el vídeo necesita de la ficha del partido. */
export type VideoGame = Pick<GameDetail, "status" | "periodText" | "regulationPeriods" | "flow" | "shots" | "elapsed" | "length"> & {
  away: { id: number; score: number; periods: number[] };
  home: { id: number; score: number; periods: number[] };
  /** Nota del partido (solo si es Final y ya la tiene). */
  excitementScore: number | null;
};

export type VideoShot = Shot & {
  /** Segundos de vídeo desde que apareció (0 = justo ahora). */
  age: number;
};

export type VideoFrame = {
  phase: "intro" | "game" | "final";
  /** 0 → 1 durante la presentación (1 después). */
  intro: number;
  /** 0 → 1 durante el final congelado (0 antes). */
  outro: number;
  /** Segundos de juego transcurridos que enseña el fotograma. */
  gameSeconds: number;
  period: number;
  /** Reloj del periodo ("5:31"). */
  clock: string;
  away: number;
  home: number;
  /** Puntos por periodo de cada equipo, solo de los periodos ya empezados. */
  periods: { away: number[]; home: number[] };
  shots: VideoShot[];
};

const PERIOD_S = (period: number, regulation: number) => (period <= regulation ? 720 : 300);

/** "5:31" del periodo → segundos de juego transcurridos. */
export function shotSeconds(shot: Pick<Shot, "period" | "clock">, regulation: number): number {
  const [m, s] = shot.clock.split(":").map(Number);
  const remaining = (m || 0) * 60 + (s || 0);
  return periodStart(shot.period, regulation) + PERIOD_S(shot.period, regulation) - remaining;
}

/** Periodo y reloj en el instante `seconds` (el final de un periodo es su 0:00, no el 12:00 del siguiente). */
export function clockOf(seconds: number, regulation: number): { period: number; clock: string } {
  let period = 1;
  while (seconds > periodStart(period + 1, regulation)) period++;
  const remaining = Math.max(0, Math.ceil(periodStart(period + 1, regulation) - seconds));
  return { period, clock: `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}` };
}

/** Peso acumulado hasta el segundo de juego `s`: el tramo final cuenta más (más tiempo de vídeo). */
function weighted(s: number, clutchFrom: number): number {
  return Math.min(s, clutchFrom) + CLUTCH_WEIGHT * Math.max(0, s - clutchFrom);
}

function unweighted(w: number, clutchFrom: number): number {
  return w <= clutchFrom ? w : clutchFrom + (w - clutchFrom) / CLUTCH_WEIGHT;
}

/** Correspondencia entre segundos de juego y segundos de vídeo (solo entre la presentación y el final). */
export function videoClock(game: Pick<VideoGame, "elapsed" | "regulationPeriods">) {
  const clutchFrom = game.regulationPeriods * 720 - CLUTCH_WINDOW_S;
  const total = Math.max(1, weighted(game.elapsed, clutchFrom));
  const span = VIDEO_PLAY_END - VIDEO_INTRO;
  return {
    /** Segundo de juego que se ve en el instante `t` del vídeo. */
    gameAt: (t: number) => unweighted((Math.min(1, Math.max(0, (t - VIDEO_INTRO) / span)) * total), clutchFrom),
    /** Instante del vídeo en el que se llega al segundo de juego `s`. */
    videoAt: (s: number) => VIDEO_INTRO + (weighted(Math.min(s, game.elapsed), clutchFrom) / total) * span,
  };
}

/** Último punto del marcador en el instante `seconds` (el marcador cambia a saltos). */
function scoreAt(flow: FlowPoint[], seconds: number): FlowPoint {
  let lo = 0;
  let hi = flow.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (flow[mid][0] <= seconds) lo = mid;
    else hi = mid - 1;
  }
  return flow[lo] ?? [0, 0, 0];
}

/** Puntos de cada periodo ya empezado, sacados del marcador en cada cambio de periodo. */
function periodsAt(flow: FlowPoint[], seconds: number, period: number, regulation: number) {
  const away: number[] = [];
  const home: number[] = [];
  for (let p = 1; p <= period; p++) {
    const [, a0, h0] = scoreAt(flow, periodStart(p, regulation));
    const [, a1, h1] = scoreAt(flow, Math.min(seconds, periodStart(p + 1, regulation)));
    away.push(a1 - a0);
    home.push(h1 - h0);
  }
  return { away, home };
}

/** Cómo iba el partido en el instante `t` del vídeo. */
export function frameAt(game: VideoGame, t: number): VideoFrame {
  const { regulationPeriods: regulation } = game;
  const clock = videoClock(game);
  const phase = t < VIDEO_INTRO ? "intro" : t < VIDEO_PLAY_END ? "game" : "final";
  const intro = Math.min(1, Math.max(0, t / VIDEO_INTRO));
  const outro = phase === "final" ? Math.min(1, (t - VIDEO_PLAY_END) / 0.6) : 0;
  const gameSeconds = phase === "final" ? game.elapsed : clock.gameAt(t);

  const shots: VideoShot[] = [];
  for (const shot of game.shots) {
    const at = clock.videoAt(shotSeconds(shot, regulation));
    // Un tiro aparece cuando el reloj del vídeo llega a él (todos están en el final)
    if (at <= t || phase === "final") shots.push({ ...shot, age: Math.max(0, t - at) });
  }

  // En el final, las cifras oficiales del boxscore (la jugada a jugada puede ir unos segundos por detrás)
  if (phase === "final") {
    const { period, clock: text } = clockOf(game.elapsed, regulation);
    return {
      phase,
      intro,
      outro,
      gameSeconds,
      period,
      clock: text,
      away: game.away.score,
      home: game.home.score,
      periods: { away: game.away.periods, home: game.home.periods },
      shots,
    };
  }

  const [, away, home] = scoreAt(game.flow, gameSeconds);
  const { period, clock: text } = clockOf(Math.max(gameSeconds, 0.001), regulation);
  return { phase, intro, outro, gameSeconds, period, clock: text, away, home, periods: periodsAt(game.flow, gameSeconds, period, regulation), shots };
}

/** Datos del vídeo a partir de la ficha completa (Nivel 3). */
export function toVideoGame(detail: GameDetail, excitementScore: number | null): VideoGame {
  return {
    status: detail.status,
    periodText: detail.periodText,
    regulationPeriods: detail.regulationPeriods,
    flow: detail.flow,
    shots: detail.shots,
    elapsed: detail.elapsed,
    length: detail.length,
    away: { id: detail.away.id, score: detail.away.score, periods: detail.away.periods },
    home: { id: detail.home.id, score: detail.home.score, periods: detail.home.periods },
    excitementScore: detail.status === "Final" ? excitementScore : null,
  };
}

/** Hay algo que animar: el partido ha empezado y la NBA ya ha publicado jugadas. */
export function canMakeVideo(detail: Pick<GameDetail, "flow" | "elapsed">): boolean {
  return detail.flow.length > 1 && detail.elapsed > 0;
}
