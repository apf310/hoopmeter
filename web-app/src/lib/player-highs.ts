// Tarea 7.6: récords de un jugador (de carrera y de la temporada) según el nivel de spoilers. Reglas puras, sin
// dependencias (las usan el servidor y `npm test`).
//
// Un récord lleva su fecha y su rival ("55 PTS vs CHI · 23 nov"): en los Niveles 1 y 2 se enseñan los de ANTES de
// la última jornada empezada, como la clasificación (Tarea 6.6). Los de al día solo se piden en el Nivel 3
// (`/api/players/[id]/highs`) y el HTML nunca los lleva.

/** Récord en un partido (clave = STAT de nba_api: PTS, REB, AST, FG3M…). */
export type CareerHigh = { value: number | null; date: string | null; vs: string | null; game_id: string | null };

export type Highs = Record<string, CareerHigh>;

/** `career` = de toda su carrera; `season` = máximos de la temporada en curso (null si no tiene). */
export type PlayerHighs = { career: Highs | null; season: { id: string; highs: Highs } | null };

/** Lo que hay guardado: los de al día y, de los conseguidos en la última jornada, cómo estaban antes de ella. */
export type StoredHighs = {
  career: Highs | null;
  careerBefore: Highs | null;
  season: { id: string; highs: Highs; before: Highs | null } | null;
};

const isBefore = (high: CareerHigh | undefined, day: string): high is CareerHigh => high !== undefined && (high.date ?? "") < day;

/**
 * Récords anteriores a `startedDay` (última jornada empezada; null = aún no ha empezado ninguna y no hay nada que
 * destripar). Se mira cada uno por su fecha, no la pasada del job: si el de antes no está guardado o tampoco es
 * anterior, ese récord no se enseña. Nunca sale uno de esa jornada o posterior.
 */
export function pickHighs(current: Highs | null, before: Highs | null, startedDay: string | null): Highs | null {
  if (current === null || startedDay === null) return current;
  const picked: Highs = {};
  for (const [stat, high] of Object.entries(current)) {
    const shown = isBefore(high, startedDay) ? high : before?.[stat];
    if (isBefore(shown, startedDay)) picked[stat] = shown;
  }
  return picked;
}

/** Niveles 1 y 2: lo único que puede viajar en el HTML. */
export function highsBeforeDay(stored: StoredHighs, startedDay: string | null): PlayerHighs {
  return {
    career: pickHighs(stored.career, stored.careerBefore, startedDay),
    season: stored.season && { id: stored.season.id, highs: pickHighs(stored.season.highs, stored.season.before, startedDay) ?? {} },
  };
}

/** Nivel 3: al día. */
export function highsNow(stored: StoredHighs): PlayerHighs {
  return { career: stored.career, season: stored.season && { id: stored.season.id, highs: stored.season.highs } };
}

const HIGH_FIELDS = ["career_highs", "career_highs_before", "season_highs", "season_highs_before"];

/** `advanced_stats` de una fila sin los récords, para lo que viaja al navegador en cualquier nivel. */
export function withoutHighs<T extends object>(advanced: T): T {
  return Object.fromEntries(Object.entries(advanced).filter(([key]) => !HIGH_FIELDS.includes(key))) as T;
}
