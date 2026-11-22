// "Los nuestros" (Tarea 6.12): los jugadores españoles que juegan en la jornada. Puro y sin dependencias
// (solo tipos): se usa en servidor, cliente y tests. Qué partidos juega cada uno sale del calendario y de
// su equipo actual, nunca del boxscore: en Niveles 1 y 2 no se sabe ni si llegó a jugar.
import type { GameMatchup } from "./game-day.ts";
import type { PlayerGameLine } from "./game-day-store.ts";

/** Valor de `players.country` de los españoles (tal cual lo guarda la NBA). */
export const SPAIN = "Spain";

/** Lo único que viaja en el HTML de la portada: nombre y equipo actual. */
export type SpanishPlayer = { id: number; name: string; teamId: number };

export type SpanishPlayerGame<G extends GameMatchup = GameMatchup> = { player: SpanishPlayer; game: G; home: boolean; opponentId: number };

/** Payload de `/api/los-nuestros?level=3`: la línea de cada jugador (por id) en su partido de la jornada. */
export type SpanishLinesPayload = { day: string; level: 3; lines: Record<string, PlayerGameLine | null> };

const surname = (name: string) => name.split(" ").slice(1).join(" ") || name;

/** "Baba Miller" → "B. Miller": con solo el apellido hay varios Miller en la liga. */
export function shortName(name: string): string {
  const [first, ...rest] = name.trim().split(/\s+/);
  return rest.length > 0 ? `${first[0]}. ${rest.join(" ")}` : name;
}

/**
 * Españoles con partido en la jornada, por hora de su partido y, a igual hora, por apellido. Nunca por
 * nada del partido: el orden es el mismo en los 3 niveles.
 */
export function spanishPlayersOfDay<G extends GameMatchup>(players: SpanishPlayer[], games: G[]): SpanishPlayerGame<G>[] {
  return players
    .flatMap((player) => {
      const game = games.find((g) => g.home_team_id === player.teamId || g.away_team_id === player.teamId);
      if (!game) return [];
      const home = game.home_team_id === player.teamId;
      return [{ player, game, home, opponentId: home ? game.away_team_id : game.home_team_id }];
    })
    .sort(
      (a, b) =>
        a.game.game_datetime_utc.localeCompare(b.game.game_datetime_utc) ||
        surname(a.player.name).localeCompare(surname(b.player.name), "es")
    );
}

/**
 * Línea compacta de Nivel 3: "30 MIN · 18 PTS · 7 REB · 3 AST" (+ robos y tapones si los hay), "No jugó · Lesión"
 * o null si aún no hay nada que enseñar (sin empezar, o no estaba en el boxscore: lo traspasaron después).
 * Los minutos van siempre: "1 MIN · 0 PTS · 0 REB · 0 AST" es un minuto de la basura, no un mal partido.
 */
export function compactLine(line: PlayerGameLine | null | undefined): string | null {
  if (!line) return null;
  if (!line.played || line.seconds <= 0) return line.absence ? `No jugó · ${line.absence}` : "No jugó";
  const mins = line.seconds < 60 ? "<1" : String(Math.round(line.seconds / 60));
  const parts: [number | string, string][] = [
    [mins, "MIN"],
    [line.pts, "PTS"],
    [line.reb, "REB"],
    [line.ast, "AST"],
  ];
  if (line.stl) parts.push([line.stl, "ROB"]);
  if (line.blk) parts.push([line.blk, "TAP"]);
  return parts.map(([value, label]) => `${value} ${label}`).join(" · ");
}
