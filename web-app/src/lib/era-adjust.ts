// Comparador ajustado por épocas (Tarea 7.3). Funciones puras: se usan en el servidor, en el cliente y en los tests.
//
// Puntos, rebotes y asistencias se miden frente a lo que hacía por partido un equipo medio de aquella liga, y el
// TS% frente al acierto medio. Esa media ya junta el ritmo (cuántos ataques) y lo que salía de cada uno, así que un
// solo cociente ajusta las dos cosas: con el ritmo a secas, los 60 (más ataques y mucho peor tiro) saldrían castigados
// dos veces. El ritmo de la tabla solo se enseña: explica el cambio, no entra en el cálculo.
// Lo demás (robos, tapones, triples, % de tiro) no se toca, y tampoco se ajustan los minutos ni el nivel del rival.
import type { SeasonType } from "@/lib/supabase";
import { CAREER, type DuelRow, type StatLine } from "./compare.ts";

export const ERA_STATS = ["pts", "reb", "ast", "tsPct"] as const;
export type EraStat = (typeof ERA_STATS)[number];

/** Media de un equipo de la liga por cada 48 minutos. Null = esa temporada no lo registraba. */
export type LeagueAverages = Record<EraStat, number | null> & {
  /** Posesiones por 48 minutos. */
  pace: number | null;
  /** Ritmo estimado: hasta 1977-78 no hay pérdidas (y hasta 1973-74, tampoco rebotes de ataque). */
  paceEstimated: boolean;
};

/** Temporada -> medias, por fase: los playoffs se miden con los playoffs. */
export type LeagueTable = Record<SeasonType, Record<string, LeagueAverages>>;

type PlayedSeason = { id: string; line: StatLine };

/** Medias de una temporada o, si aún no está en la tabla (recién empezada), las de la anterior. */
export function leagueOf(seasonId: string, phase: SeasonType, table: LeagueTable): LeagueAverages | null {
  const seasons = table[phase];
  if (seasons[seasonId]) return seasons[seasonId];
  const previous = Object.keys(seasons).filter((id) => id < seasonId).sort();
  return seasons[previous[previous.length - 1]] ?? null;
}

/**
 * La liga que tuvo delante una carrera: cada temporada pesa lo que el jugador produjo en ella. Así, ajustar el
 * promedio de la carrera da exactamente lo mismo que ajustar temporada a temporada y volver a promediar.
 */
export function careerLeague(seasons: PlayedSeason[], phase: SeasonType, table: LeagueTable): LeagueAverages | null {
  const played = seasons.flatMap(({ id, line }) => {
    const league = id === CAREER ? null : leagueOf(id, phase, table);
    return league && line.games ? [{ line, league, games: line.games }] : [];
  });
  if (played.length === 0) return null;

  const average = (stat: EraStat): number | null => {
    let produced = 0;
    let relative = 0;
    for (const { line, league, games } of played) {
      const value = line[stat];
      const base = league[stat];
      // El TS% se pondera por los tiros (puntos / TS), no por los partidos
      const weight = stat === "tsPct" ? (line.tsPct ? (games * (line.pts ?? 0)) / line.tsPct : 0) : games;
      if (value === null || !base || !weight) continue;
      produced += weight * value;
      relative += (weight * value) / base;
    }
    return relative > 0 ? produced / relative : null;
  };

  const paced = played.filter(({ league }) => league.pace !== null);
  const games = paced.reduce((sum, season) => sum + season.games, 0);
  return {
    pts: average("pts"),
    reb: average("reb"),
    ast: average("ast"),
    tsPct: average("tsPct"),
    pace: games ? paced.reduce((sum, season) => sum + season.games * season.league.pace!, 0) / games : null,
    paceEstimated: paced.some(({ league }) => league.paceEstimated),
  };
}

/** Por cuánto se multiplica una cifra de `league` para llevarla a `reference`. Null = falta la media en una de las dos. */
export function eraFactor(stat: EraStat, league: LeagueAverages, reference: LeagueAverages): number | null {
  const from = league[stat];
  const to = reference[stat];
  return from && to ? to / from : null;
}

function scaleLine(line: StatLine, league: LeagueAverages | null, reference: LeagueAverages): StatLine {
  const adjusted = { ...line };
  for (const stat of ERA_STATS) {
    const factor = league && eraFactor(stat, league, reference);
    adjusted[stat] = factor === null || line[stat] === null ? null : line[stat] * factor;
  }
  return adjusted;
}

/**
 * La línea llevada a la liga de referencia, con los decimales que se enseñan (si no, dos "26.0" tendrían ganador).
 * Lo que no se puede ajustar queda sin dato, nunca sin ajustar.
 */
export function adjustLine(line: StatLine, league: LeagueAverages | null, reference: LeagueAverages): StatLine {
  const { pts, reb, ast, tsPct, ...rest } = scaleLine(line, league, reference);
  const round = (value: number | null, scale: number) => (value === null ? null : Math.round(value * scale) / scale);
  return { ...rest, pts: round(pts, 10), reb: round(reb, 10), ast: round(ast, 10), tsPct: round(tsPct, 1000) };
}

/** Vara de medir del radar: frente a la media de cada liga. Los percentiles salen iguales con cualquier referencia. */
const UNIT: LeagueAverages = { pts: 100, reb: 100, ast: 100, tsPct: 1, pace: null, paceEstimated: false };

export const relativeLine = (line: StatLine, league: LeagueAverages | null) => scaleLine(line, league, UNIT);

/** Filas ajustadas con la cifra real al lado donde cambia. */
export function withRealValues(adjusted: DuelRow[], real: DuelRow[]): DuelRow[] {
  return adjusted.map((row, i) => ((ERA_STATS as readonly string[]).includes(row.key) ? { ...row, aReal: real[i].aText, bReal: real[i].bText } : row));
}

// ---------- Temporada de referencia ----------

/** Temporadas que pueden ser la referencia, de la más reciente a la más antigua: las que lo registran todo. */
export function referenceSeasons(phase: SeasonType, table: LeagueTable): string[] {
  return Object.keys(table[phase])
    .filter((id) => ERA_STATS.every((stat) => table[phase][id][stat] !== null))
    .sort()
    .reverse();
}

/** La elegida si existe en esa fase; si no, la más reciente. */
export function pickReference(wanted: string, phase: SeasonType, table: LeagueTable): string {
  const seasons = referenceSeasons(phase, table);
  return seasons.includes(wanted) ? wanted : seasons[0];
}

// ---------- Temporada en curso ----------

/** Totales de un jugador (`player_season_stats.totals`). */
export type SeasonTotals = Partial<Record<"min" | "pts" | "fgm" | "fga" | "fta" | "oreb" | "reb" | "ast" | "tov", number | null>>;

/** Con menos de 100 partidos de equipo, la media de la liga es aún ruido. */
const MIN_TEAM_GAMES = 100;

/** Pérdidas de equipo por partido: no están en las cifras de los jugadores (como en `fetch_league_averages.py`). */
const TEAM_TURNOVERS = 0.7;

/** Posesiones por partido (fórmula de Dean Oliver, la habitual): con las medias de toda la liga, rival incluido. */
export function possessions({ fgm, fga, fta, oreb, reb, tov }: Record<"fgm" | "fga" | "fta" | "oreb" | "reb" | "tov", number>): number {
  return fga + 0.4 * fta - 1.07 * (oreb / reb) * (fga - fgm) + tov;
}

/** Medias de la temporada en curso con los totales de sus jugadores. Null = aún hay pocos partidos. */
export function averagesFromTotals(players: SeasonTotals[]): LeagueAverages | null {
  const sum = (key: keyof SeasonTotals) => players.reduce((total, player) => total + (player[key] ?? 0), 0);
  const teamGames = sum("min") / 240;
  if (teamGames < MIN_TEAM_GAMES) return null;
  const per = (key: keyof SeasonTotals) => sum(key) / teamGames;
  return {
    pts: per("pts"),
    reb: per("reb"),
    ast: per("ast"),
    tsPct: per("pts") / (2 * (per("fga") + 0.44 * per("fta"))),
    pace: possessions({ fgm: per("fgm"), fga: per("fga"), fta: per("fta"), oreb: per("oreb"), reb: per("reb"), tov: per("tov") + TEAM_TURNOVERS }),
    paceEstimated: false,
  };
}
