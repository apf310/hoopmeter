// Formatos y cálculos ligeros de la ficha del partido. Sin "use client" ni dependencias de servidor:
// se usa en cliente y servidor (de `game-detail.ts` solo se importan tipos).
import type { BoxLine, GameDetail, PlayerLine, ShotZone, TeamBox } from "@/lib/game-detail";

/** Equipo de un partido tal como lo pinta la ficha. Sin balance V-D: delataría el resultado. */
export type MatchupTeam = {
  id: number;
  name: string;
  abbreviation: string;
  /** Color de franquicia para los fondos (puede ser oscuro). */
  primary: string;
  secondary: string;
  /** Color para marcas y gráficos: visible sobre oscuro y distinto del rival (`matchupAccents`). */
  accent: string;
};

/** 0.505 → "50.5" */
export function pct(value: number | null | undefined, digits = 1): string {
  return value == null ? "–" : (value * 100).toFixed(digits);
}

export function decimal(value: number | null | undefined, digits = 1): string {
  return value == null ? "–" : value.toFixed(digits);
}

export function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

/** 1665 → "27:45" */
export function minutes(seconds: number): string {
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** 159 → "2 h 39 min" */
export function duration(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h ? `${h} h ${m} min` : `${m} min`;
}

export const shooting = (made: number, attempted: number) => `${made}/${attempted}`;

/** Nombre corto del periodo: "1.er cuarto", "4.º cuarto", "Prórroga", "2.ª prórroga". */
export function periodName(period: number, regulation = 4): string {
  if (period <= regulation) return `${period === 1 || period === 3 ? `${period}.er` : `${period}.º`} cuarto`;
  const ot = period - regulation;
  return ot === 1 ? "Prórroga" : `${ot}.ª prórroga`;
}

/** Etiqueta de filtro: "1", "2", "3", "4", "PR1"… (igual que el cuarto a cuarto de la jornada). */
export function periodChip(period: number, regulation = 4): string {
  return period <= regulation ? String(period) : `PR${period - regulation}`;
}

/** Periodo y reloj del instante `seconds` del partido (para el gráfico de flujo). */
export function clockAt(seconds: number, regulation = 4): { period: number; clock: string } {
  let start = 0;
  for (let period = 1; ; period++) {
    const length = period <= regulation ? 720 : 300;
    if (seconds <= start + length || period > 20) return { period, clock: minutes(start + length - seconds) };
    start += length;
  }
}

/** Inicio (en segundos de juego) de cada periodo a partir del segundo: las líneas divisorias del gráfico. */
export function periodStarts(length: number, regulation = 4): number[] {
  const starts: number[] = [];
  for (let period = 1, t = 0; ; period++) {
    t += period <= regulation ? 720 : 300;
    if (t >= length) return starts;
    starts.push(t);
  }
}

export function teamOf(detail: GameDetail, teamId: number): TeamBox {
  return detail.home.id === teamId ? detail.home : detail.away;
}

export function findPlayer(detail: GameDetail, playerId: number): { player: PlayerLine; team: TeamBox } | null {
  for (const team of [detail.away, detail.home]) {
    const player = team.players.find((p) => p.id === playerId);
    if (player) return { player, team };
  }
  return null;
}

/** Jugador del partido: la mejor valoración (Game Score) de los dos equipos. */
export function playerOfTheGame(detail: GameDetail): { player: PlayerLine; team: TeamBox } | null {
  let best: { player: PlayerLine; team: TeamBox } | null = null;
  for (const team of [detail.away, detail.home]) {
    for (const player of team.players) {
      if (player.played && (!best || player.gameScore > best.player.gameScore)) best = { player, team };
    }
  }
  return best;
}

/** Líder del equipo en una estadística (null si nadie la tiene). */
export function teamLeader(team: TeamBox, value: (p: PlayerLine) => number): PlayerLine | null {
  let best: PlayerLine | null = null;
  for (const player of team.players) {
    if (player.played && value(player) > 0 && (!best || value(player) > value(best))) best = player;
  }
  return best;
}

/** "Triple-doble", "Doble-doble" o null (10+ en puntos, rebotes, asistencias, robos o tapones). */
export function doubleDouble(line: BoxLine): "Triple-doble" | "Doble-doble" | null {
  const count = [line.pts, line.reb, line.ast, line.stl, line.blk].filter((v) => v >= 10).length;
  return count >= 3 ? "Triple-doble" : count === 2 ? "Doble-doble" : null;
}

/** Puntos de cada origen. La media distancia se deduce: canastas de 2 menos las de la pintura. */
export function scoringOrigin(line: BoxLine): { label: string; points: number }[] {
  const twos = 2 * (line.fgm - line.fg3m);
  return [
    { label: "Pintura", points: line.paintPts },
    { label: "Media distancia", points: Math.max(0, twos - line.paintPts) },
    { label: "Triples", points: 3 * line.fg3m },
    { label: "Tiros libres", points: line.ftm },
  ];
}

/** Zonas de tiro con el acierto medio de referencia de la liga (aprox., temporadas recientes). */
export const SHOT_ZONES: { zone: ShotZone; label: string; league: number }[] = [
  { zone: "ra", label: "Zona restringida", league: 0.655 },
  { zone: "paint", label: "Resto de la pintura", league: 0.44 },
  { zone: "mid", label: "Media distancia", league: 0.42 },
  { zone: "corner3", label: "Triple de esquina", league: 0.385 },
  { zone: "above3", label: "Triple frontal", league: 0.355 },
];

export const LEAGUE_ZONE_PCT = Object.fromEntries(SHOT_ZONES.map((z) => [z.zone, z.league])) as Record<ShotZone, number>;
