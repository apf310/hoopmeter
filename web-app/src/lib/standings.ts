// Tarea 6.6: clasificación y equipos según el nivel de spoilers. Reglas puras, sin dependencias
// (las usan el servidor, el cliente y `npm test`).
//
// En los Niveles 1 y 2 se enseña la clasificación de ANTES de la última jornada empezada: quien aún no ha
// visto los partidos de anoche no se entera por el balance, la racha o el puesto de nadie. La de al día
// solo se pide en el Nivel 3 (`/api/standings`), como los marcadores.
import type { StandingsExtra, Team } from "@/lib/supabase";

/** Lo que cambia con los resultados: balance, puesto y extras de un equipo. */
export type StandingsRow = {
  id: number;
  wins: number;
  losses: number;
  conf_rank: number | null;
  standings_extra: StandingsExtra;
};

/**
 * Clasificación sin spoilers. `day` = la última jornada empezada (no incluida), null si aún no ha empezado
 * ninguna. `teams` = null si no se puede saber cuál era: ante la duda, no se enseña nada.
 */
export type StandingsBefore = { day: string | null; teams: StandingsRow[] | null };

export function toStandingsRow(team: Pick<Team, "id" | "wins" | "losses" | "conf_rank" | "standings_extra">): StandingsRow {
  return {
    id: team.id,
    wins: team.wins,
    losses: team.losses,
    conf_rank: team.conf_rank,
    standings_extra: team.standings_extra ?? {},
  };
}

/**
 * Elige para cada equipo la clasificación de antes de `startedDay`. El backend guarda, en la misma fila y
 * escritura, la de al día y la de antes de la última jornada con partidos terminados (`standings_before.day`):
 * - Si esa jornada es la empezada, se usa la de antes.
 * - Si es anterior, la empezada aún no tiene partidos terminados: la de al día ya es la de antes.
 * - Si es posterior (calendario desajustado) o falta, no se sabe: null.
 */
export function pickStandingsBefore(
  teams: Pick<Team, "id" | "wins" | "losses" | "conf_rank" | "standings_extra" | "standings_before">[],
  startedDay: string | null
): StandingsBefore {
  // Sin ninguna jornada empezada no hay resultados que destripar
  if (startedDay === null) return { day: null, teams: teams.map(toStandingsRow) };

  const rows: StandingsRow[] = [];
  for (const team of teams) {
    const before = team.standings_before;
    if (!before?.day || before.day > startedDay) return { day: startedDay, teams: null };
    rows.push(
      before.day === startedDay
        ? toStandingsRow({ id: team.id, wins: before.wins, losses: before.losses, conf_rank: before.conf_rank, standings_extra: before.standings_extra })
        : toStandingsRow(team)
    );
  }
  return { day: startedDay, teams: rows };
}

/** Última jornada con algún partido ya empezado (por su hora de inicio). `schedule` va ordenado por hora. */
export function lastStartedDay(schedule: { game_datetime_utc: string }[], now: number, dayOf: (utc: string) => string): string | null {
  for (let i = schedule.length - 1; i >= 0; i--) {
    if (Date.parse(schedule[i].game_datetime_utc) <= now) return dayOf(schedule[i].game_datetime_utc);
  }
  return null;
}

/** ¿`current` trae resultados que no están en `before`? (para avisar al compartir la imagen). Solo mira los equipos de `before`. */
export function standingsDiffer(before: StandingsRow[] | null, current: StandingsRow[]): boolean {
  if (before === null) return true;
  const byId = new Map(current.map((row) => [row.id, row]));
  return before.some((row) => {
    const now = byId.get(row.id);
    return !now || now.wins !== row.wins || now.losses !== row.losses;
  });
}
