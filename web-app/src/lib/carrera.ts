// Carrera oculta (Tarea 8.4): adivinar al jugador del día por sus temporadas. Puro y sin dependencias (tests con `node --test`).
//
// Igual para todos, como Adivina el jugador (8.3): un jugador al día (cambia a las 7:00 de España), mitad leyendas y
// mitad figuras en activo, siempre con cinco temporadas o más y sin repetir en dos meses. Se ve su carrera temporada a
// temporada (edad, partidos, puntos, rebotes y asistencias), sin nombre ni equipos, y hay 6 intentos: cada fallo
// destapa una pista (posición y altura, país, draft, palmarés e iniciales). "Con equipos o sin ellos": sus equipos se
// pueden ver en cualquier momento a cambio de la mitad de los puntos. La solución, las pistas que tocan, el número de
// intento y los puntos viven en el servidor (`carrera-store.ts` y `/api/juegos/carrera`); como la solución es la misma
// para todos y se podría copiar, da 20 puntos como mucho y nunca premio de campeón (Tarea 8.6).
//
// Todo sale de la "foto del día" que congela el servidor al empezar el día (las temporadas del job diario de ese
// momento): nada depende del último partido, igual en los tres niveles de spoilers.
import { parseHeight, positionKey, STAR_SALARY, type Rng } from "./adivina.ts";
import type { Mark } from "./games.ts";
import { LEGEND_AWARDS } from "./player-card.ts";
import { countryLabel } from "./places.ts";

// ---------------------------------------------------------------------------------------------------------
// Datos de la base de datos

/** Una temporada regular de `player_season_stats` (promedios por partido). */
export type SeasonRow = {
  playerId: number;
  /** "2003-04". */
  season: string;
  teamId: number | null;
  /** Abreviatura de entonces ("SEA", "NJN"); "TOT" en las temporadas con traspaso. */
  abbr: string | null;
  /** Desglose por equipo, solo en las temporadas con traspaso. */
  teams: { team_id: number | null; team_abbreviation: string | null; gp?: number | null }[] | null;
  age: number | null;
  gp: number | null;
  pts: number | null;
  reb: number | null;
  ast: number | null;
};

/** Lo que hace falta de cada jugador (`players`, su contrato y si tiene la carrera completa). */
export type PlayerRow = {
  id: number;
  name: string;
  active: boolean;
  teamId: number | null;
  position: string | null;
  height: string | null;
  country: string | null;
  draftYear: number | null;
  draftNumber: number | null;
  /** Salario de esta temporada (para saber quién es una figura); null sin contrato o sin cifra. */
  salary: number | null;
  /** Tiene su fila "Career": el historial está completo (un veterano sin él parecería un novato). */
  hasCareer: boolean;
};

/** Anillos, MVP y All-Star (los premios que reconoce todo el mundo). */
export type Honours = { champion: number; mvp: number; allstar: number };

export const HONOUR_AWARDS: Readonly<Record<keyof Honours, string>> = {
  champion: LEGEND_AWARDS.champion,
  mvp: LEGEND_AWARDS.mvp,
  allstar: LEGEND_AWARDS.allstar,
};

/** De `player_awards` ({player_id, award_name}) a cuántos tiene cada uno. */
export function honoursOf(awards: readonly { player_id: number; award_name: string }[]): Map<number, Honours> {
  const keyOf = new Map(Object.entries(HONOUR_AWARDS).map(([key, name]) => [name, key as keyof Honours]));
  const out = new Map<number, Honours>();
  for (const { player_id, award_name } of awards) {
    const key = keyOf.get(award_name);
    if (!key) continue;
    const own = out.get(player_id) ?? { champion: 0, mvp: 0, allstar: 0 };
    own[key] += 1;
    out.set(player_id, own);
  }
  return out;
}

/** Abreviatura de hoy de cada equipo (nunca la clasificación que lleva). */
export type TeamInfo = { abbr: string };

// ---------------------------------------------------------------------------------------------------------
// Carrera

export type CareerTeam = { id: number; abbr: string; /** Partidos con ese equipo (solo en las temporadas con traspaso). */ gp: number | null };

export type CareerSeason = {
  season: string;
  age: number | null;
  gp: number | null;
  pts: number | null;
  reb: number | null;
  ast: number | null;
  /** En el orden en que jugó en ellos; vacío si no se sabe. Nunca sale del servidor hasta destaparlos. */
  teams: CareerTeam[];
};

export type PublicSeason = Omit<CareerSeason, "teams">;

const SEASON = /^(\d{4})-(\d{2})$/;

/** "2003-04" → 2003; null si no es una temporada. */
export const seasonStart = (season: string): number | null => {
  const m = SEASON.exec(season);
  return m ? Number(m[1]) : null;
};

/** 1999 → "1999-00". */
export const seasonOf = (start: number): string => `${start}-${String((start + 1) % 100).padStart(2, "0")}`;

/** Los equipos de una temporada: el suyo o, con traspaso, los de su desglose (sin "TOT"). */
export function seasonTeams(row: SeasonRow, teams: ReadonlyMap<number, TeamInfo>): CareerTeam[] {
  const abbrOf = (id: number, abbr: string | null | undefined) => (abbr && abbr !== "TOT" ? abbr : (teams.get(id)?.abbr ?? null));
  const split = (row.teams ?? []).flatMap((t): CareerTeam[] => {
    const abbr = t.team_id ? abbrOf(t.team_id, t.team_abbreviation) : null;
    return t.team_id && abbr && t.team_abbreviation !== "TOT" ? [{ id: t.team_id, abbr, gp: typeof t.gp === "number" ? t.gp : null }] : [];
  });
  if (split.length > 0) return split;
  const abbr = row.teamId ? abbrOf(row.teamId, row.abbr) : null;
  return row.teamId && abbr ? [{ id: row.teamId, abbr, gp: null }] : [];
}

const round1 = (n: number | null): number | null => (typeof n === "number" && Number.isFinite(n) ? Math.round(n * 10) / 10 : null);

/** Sus temporadas regulares, de la primera a la última. */
export function careerOf(rows: readonly SeasonRow[], teams: ReadonlyMap<number, TeamInfo>): CareerSeason[] {
  return rows
    .filter((r) => seasonStart(r.season) !== null)
    .sort((a, b) => a.season.localeCompare(b.season))
    .map((r) => ({
      season: r.season,
      age: typeof r.age === "number" ? Math.round(r.age) : null,
      gp: typeof r.gp === "number" ? Math.round(r.gp) : null,
      pts: round1(r.pts),
      reb: round1(r.reb),
      ast: round1(r.ast),
      teams: seasonTeams(r, teams),
    }));
}

/** Cada fila de la carrera: una temporada (su posición en la lista) o un hueco sin jugar entre dos ("no jugó"). */
export type TimelineEntry = { kind: "season"; index: number } | { kind: "gap"; from: string; to: string; count: number };

/** La carrera con sus huecos: los años sin jugar entre la primera temporada y la última (la retirada de Jordan). */
export function careerTimeline(seasons: readonly Pick<CareerSeason, "season">[]): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  seasons.forEach((s, index) => {
    const start = seasonStart(s.season)!;
    const prev = index > 0 ? seasonStart(seasons[index - 1].season)! : null;
    if (prev !== null && start - prev > 1) out.push({ kind: "gap", from: seasonOf(prev + 1), to: seasonOf(start - 1), count: start - prev - 1 });
    out.push({ kind: "season", index });
  });
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// Quién se puede decir y quién puede ser el del día

/** Lo que viaja al buscador: nombre y equipo de hoy (null si está retirado o sin equipo). */
export type CareerSuspect = { id: number; name: string; teamId: number | null; team: string | null; retired: boolean };

/** Para entrar en el buscador: dos temporadas guardadas o más (con una no hay carrera que adivinar). */
export const GUESSABLE_MIN_SEASONS = 2;
/** Para ser el del día: cinco o más, con forma de carrera. */
export const TARGET_MIN_SEASONS = 5;
/** Días sin repetir jugador. */
export const REPEAT_DAYS = 60;
/** Figura en activo por su contrato: el mismo corte que Adivina el jugador. */
export { STAR_SALARY };

/** Todos los que se pueden decir (retirados o en activo con dos temporadas o más), por orden alfabético. */
export function buildSuspects(players: readonly PlayerRow[], seasonCount: ReadonlyMap<number, number>, teams: ReadonlyMap<number, TeamInfo>): CareerSuspect[] {
  return players
    .flatMap((p): CareerSuspect[] => {
      if ((seasonCount.get(p.id) ?? 0) < GUESSABLE_MIN_SEASONS) return [];
      const team = p.active && p.teamId !== null ? teams.get(p.teamId) : undefined;
      return [{ id: p.id, name: p.name, teamId: team ? p.teamId : null, team: team?.abbr ?? null, retired: !p.active }];
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es") || a.id - b.id);
}

/**
 * Candidatos a jugador del día: las leyendas (todas son figuras) y, en activo, las figuras con la carrera completa: por
 * su contrato (25 M$+) o por haber sido All-Star (un veterano con contrato mínimo sigue siendo LeBron).
 */
export function targetCandidates(
  players: readonly PlayerRow[],
  seasonCount: ReadonlyMap<number, number>,
  honours: ReadonlyMap<number, Honours>
): { legends: PlayerRow[]; active: PlayerRow[] } {
  const enough = (p: PlayerRow) => (seasonCount.get(p.id) ?? 0) >= TARGET_MIN_SEASONS;
  const byId = (a: PlayerRow, b: PlayerRow) => a.id - b.id;
  return {
    legends: players.filter((p) => !p.active && enough(p)).sort(byId),
    active: players
      .filter((p) => p.active && p.teamId !== null && p.hasCareer && enough(p) && ((p.salary ?? 0) >= STAR_SALARY || (honours.get(p.id)?.allstar ?? 0) > 0))
      .sort(byId),
  };
}

/** Lo que dicen las pistas del jugador del día. */
export type Profile = {
  pos: string | null;
  cm: number | null;
  country: string | null;
  draftYear: number | null;
  draftNumber: number | null;
  honours: Honours;
  initials: string;
};

const SUFFIX = /^(jr\.?|sr\.?|i{1,3}|iv|v)$/i;

/** "LeBron James" → "L. J."; "Shai Gilgeous-Alexander" → "S. G.-A."; "Jimmy Butler III" → "J. B.". */
export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter((word, i) => i === 0 || !SUFFIX.test(word))
    .map((word) =>
      word
        .split("-")
        .filter(Boolean)
        .map((part) => `${(/\p{L}/u.exec(part)?.[0] ?? part.charAt(0)).toUpperCase()}.`)
        .join("-")
    )
    .join(" ");
}

export type DayPuzzle = {
  v: 1;
  day: string;
  /** El jugador del día: nunca sale del servidor hasta acabar la partida. */
  target: number;
  /** La temporada en curso de la liga: si es la última suya, se marca "en curso". */
  current: string;
  seasons: CareerSeason[];
  profile: Profile;
  suspects: CareerSuspect[];
};

/** Lo que ve el cliente antes de jugar: su carrera sin equipos y a quién se puede decir. */
export type PublicPuzzle = { day: string; current: string; seasons: PublicSeason[]; suspects: CareerSuspect[] };

export type PuzzleData = {
  players: readonly PlayerRow[];
  seasons: readonly SeasonRow[];
  honours: ReadonlyMap<number, Honours>;
  teams: ReadonlyMap<number, TeamInfo>;
};

/**
 * Foto del día: mitad y mitad entre leyendas y jugadores en activo (al azar entre los que no han salido en
 * `REPEAT_DAYS` días; si ya han salido todos, entre todos), su carrera, sus pistas y a quién se puede decir.
 * null si no hay candidatos.
 */
export function buildPuzzle(data: PuzzleData, day: string, recent: ReadonlySet<number>, rng: Rng): DayPuzzle | null {
  const byPlayer = new Map<number, SeasonRow[]>();
  let current: string | null = null;
  for (const row of data.seasons) {
    if (seasonStart(row.season) === null) continue;
    (byPlayer.get(row.playerId) ?? byPlayer.set(row.playerId, []).get(row.playerId)!).push(row);
    if (current === null || row.season > current) current = row.season;
  }
  if (!current) return null;
  const seasonCount = new Map([...byPlayer].map(([id, rows]) => [id, rows.length]));

  const { legends, active } = targetCandidates(data.players, seasonCount, data.honours);
  const fresh = (list: PlayerRow[]) => list.filter((p) => !recent.has(p.id));
  let groups = [fresh(legends), fresh(active)].filter((g) => g.length > 0);
  if (groups.length === 0) groups = [legends, active].filter((g) => g.length > 0);
  if (groups.length === 0) return null;
  const group = groups.length === 1 ? groups[0] : groups[rng() < 0.5 ? 0 : 1];
  const target = group[Math.floor(rng() * group.length)];

  const seasons = careerOf(byPlayer.get(target.id) ?? [], data.teams);
  return {
    v: 1,
    day,
    target: target.id,
    current,
    seasons,
    profile: {
      pos: positionKey(target.position),
      cm: parseHeight(target.height),
      country: target.country,
      draftYear: target.draftYear,
      draftNumber: target.draftNumber,
      honours: data.honours.get(target.id) ?? { champion: 0, mvp: 0, allstar: 0 },
      initials: initialsOf(target.name),
    },
    suspects: buildSuspects(data.players, seasonCount, data.teams),
  };
}

export const publicPuzzle = (puzzle: DayPuzzle): PublicPuzzle => ({
  day: puzzle.day,
  current: puzzle.current,
  seasons: puzzle.seasons.map(({ season, age, gp, pts, reb, ast }) => ({ season, age, gp, pts, reb, ast })),
  suspects: puzzle.suspects,
});

const isNumOrNull = (v: unknown) => v === null || (typeof v === "number" && Number.isFinite(v));

const isSeason = (s: unknown): s is CareerSeason => {
  const x = s as CareerSeason | null;
  return (
    !!x &&
    typeof x.season === "string" &&
    SEASON.test(x.season) &&
    [x.age, x.gp, x.pts, x.reb, x.ast].every(isNumOrNull) &&
    Array.isArray(x.teams) &&
    x.teams.every((t) => !!t && Number.isInteger(t.id) && typeof t.abbr === "string")
  );
};

const isSuspect = (s: unknown): s is CareerSuspect => {
  const x = s as CareerSuspect | null;
  return !!x && Number.isInteger(x.id) && typeof x.name === "string" && (x.teamId === null || Number.isInteger(x.teamId)) && typeof x.retired === "boolean";
};

/** Lo que vuelve de la base de datos, sin fiarse de la forma. */
export function isDayPuzzle(value: unknown): value is DayPuzzle {
  const p = value as DayPuzzle | null;
  const h = p?.profile?.honours;
  return (
    !!p &&
    p.v === 1 &&
    typeof p.day === "string" &&
    Number.isInteger(p.target) &&
    typeof p.current === "string" &&
    Array.isArray(p.seasons) &&
    p.seasons.length > 0 &&
    p.seasons.every(isSeason) &&
    !!h &&
    [h.champion, h.mvp, h.allstar].every((n) => Number.isInteger(n)) &&
    typeof p.profile.initials === "string" &&
    Array.isArray(p.suspects) &&
    p.suspects.every(isSuspect) &&
    p.suspects.some((s) => s.id === p.target)
  );
}

// ---------------------------------------------------------------------------------------------------------
// Pistas: una más con cada fallo, de la más floja a la más fuerte

export type ClueKey = "body" | "country" | "draft" | "honours" | "initials";
export const CLUE_ORDER: readonly ClueKey[] = ["body", "country", "draft", "honours", "initials"];
export const CLUE_LABEL: Record<ClueKey, string> = { body: "Posición y altura", country: "País", draft: "Draft", honours: "Palmarés", initials: "Iniciales" };

const POSITION_WORD: Record<string, string> = { G: "exterior", F: "alero", C: "pívot" };
const METERS = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "F-C" → "Alero-pívot". */
export function positionName(key: string | null): string | null {
  if (!key) return null;
  const words = key.split("-").map((p) => POSITION_WORD[p] ?? p);
  const text = words.join("-");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Cada pista tal como se lee: "Alero · 2,06 m", "EE. UU.", "N.º 1 del draft de 2003", "4 anillos · 4 MVP · 21 veces All-Star", "L. J.". */
export function clueText(key: ClueKey, profile: Profile): string {
  switch (key) {
    case "body":
      return [positionName(profile.pos), profile.cm === null ? null : `${METERS.format(profile.cm / 100)} m`].filter(Boolean).join(" · ") || "–";
    case "country":
      return countryLabel(profile.country) ?? "–";
    case "draft":
      if (profile.draftYear === null) return "No salió elegido en el draft";
      return profile.draftNumber === null ? `Draft de ${profile.draftYear}` : `N.º ${profile.draftNumber} del draft de ${profile.draftYear}`;
    case "honours": {
      const { champion, mvp, allstar } = profile.honours;
      const parts = [
        champion > 0 ? plural(champion, "anillo", "anillos") : null,
        mvp > 0 ? `${mvp} MVP` : null,
        allstar > 0 ? `${allstar} ${allstar === 1 ? "vez" : "veces"} All-Star` : null,
      ].filter(Boolean);
      return parts.length > 0 ? parts.join(" · ") : "Sin anillos, MVP ni All-Star";
    }
    case "initials":
      return profile.initials || "–";
  }
}

// ---------------------------------------------------------------------------------------------------------
// Partida

export const MAX_GUESSES = 6;
/** Puntos según el intento en que se acierta (20 como mucho: Tarea 8.6). Sin acertar, 0, pero cuenta para la racha. */
export const POINTS_BY_GUESS: readonly number[] = [20, 17, 14, 11, 8, 5];
/** Con los equipos a la vista, la mitad (redondeando hacia arriba): 10, 9, 7, 6, 4 y 3. */
export const POINTS_WITH_TEAMS: readonly number[] = POINTS_BY_GUESS.map((p) => Math.ceil(p / 2));

export const pointsFor = (attempts: number, solved: boolean, withTeams: boolean): number =>
  solved ? ((withTeams ? POINTS_WITH_TEAMS : POINTS_BY_GUESS)[attempts - 1] ?? 0) : 0;

/** La jugada de ver los equipos (las demás son el id del jugador que se dice). */
export const TEAMS_MOVE = "teams";
export type Move = number | typeof TEAMS_MOVE;
/** Seis intentos y, como mucho una vez, ver los equipos. */
export const MAX_MOVES = MAX_GUESSES + 1;

/**
 * La partida en el servidor (nunca sale tal cual): el jugador del día y las jugadas en orden (jugadores dichos y, si
 * los ha visto, cuándo vio los equipos). Las pistas salen siempre de la foto del día.
 */
export type CarreraRun = { v: 1; day: string; target: number; answers: Move[] };

export const newRun = (puzzle: Pick<DayPuzzle, "day" | "target">): CarreraRun => ({ v: 1, day: puzzle.day, target: puzzle.target, answers: [] });

const isGuess = (move: Move): move is number => typeof move === "number";

export function isCarreraRun(value: unknown): value is CarreraRun {
  const run = value as CarreraRun | null;
  return (
    !!run &&
    run.v === 1 &&
    typeof run.day === "string" &&
    Number.isInteger(run.target) &&
    Array.isArray(run.answers) &&
    run.answers.length <= MAX_MOVES &&
    run.answers.every((m) => m === TEAMS_MOVE || Number.isInteger(m)) &&
    run.answers.filter((m) => m === TEAMS_MOVE).length <= 1 &&
    run.answers.filter((m) => m !== TEAMS_MOVE).length <= MAX_GUESSES
  );
}

/** Cómo va: si ha acertado, en qué intento, si ha visto los equipos, si ha acabado y sus puntos. */
export function runScore(run: CarreraRun): { solved: boolean; attempts: number; misses: number; withTeams: boolean; finished: boolean; points: number } {
  const guesses = run.answers.filter(isGuess);
  const hit = guesses.indexOf(run.target);
  const solved = hit >= 0;
  const attempts = solved ? hit + 1 : guesses.length;
  const withTeams = run.answers.includes(TEAMS_MOVE);
  return {
    solved,
    attempts,
    misses: solved ? attempts - 1 : attempts,
    withTeams,
    finished: solved || attempts >= MAX_GUESSES,
    points: pointsFor(attempts, solved, withTeams),
  };
}

/** Un intento ya contestado. */
export type GuessRow = CareerSuspect & { hit: boolean };

export type RevealedClue = { key: ClueKey; text: string };

export type RunSummary = { points: number; attempts: number; solved: boolean; withTeams: boolean; rows: string[]; /** Lo añade la API (Tarea 8.5, `game-receipt.ts`): para pasar el resultado a la cuenta. */ receipt?: string };

export type RunView = {
  day: string;
  /** Jugadas hechas (intentos y ver los equipos): el número de la siguiente. */
  step: number;
  guesses: GuessRow[];
  /** Las pistas destapadas: una por fallo (todas al acabar). */
  clues: RevealedClue[];
  /** Sus equipos, temporada a temporada (en el orden de la carrera), al verlos o al acabar. */
  teams: CareerTeam[][] | null;
  withTeams: boolean;
  solved: boolean;
  finished: boolean;
  /** El jugador del día, solo al acabar. */
  answer: CareerSuspect | null;
  summary: RunSummary | null;
};

/**
 * Para compartir (🟩🟨🟥): una fila con un cuadro por intento, 🟥 los fallos y el acierto 🟩 (🟨 si fue con los
 * equipos a la vista). Nunca el nombre.
 */
export const shareRow = (guesses: readonly Pick<GuessRow, "hit">[], withTeams: boolean): string =>
  guesses.map((g): Mark => (g.hit ? (withTeams ? "c" : "o") : "x")).join("");

export function viewRun(run: CarreraRun, puzzle: DayPuzzle): RunView {
  const byId = new Map(puzzle.suspects.map((s) => [s.id, s]));
  const target = byId.get(run.target) ?? byId.get(puzzle.target)!;
  const guesses = run.answers.filter(isGuess).flatMap((id): GuessRow[] => {
    const s = byId.get(id);
    return s ? [{ ...s, hit: id === target.id }] : [];
  });
  const { solved, attempts, misses, withTeams, finished, points } = runScore(run);
  const shown = finished ? CLUE_ORDER.length : Math.min(misses, CLUE_ORDER.length);
  const teamsShown = withTeams || finished;
  return {
    day: run.day,
    step: run.answers.length,
    guesses,
    clues: CLUE_ORDER.slice(0, shown).map((key) => ({ key, text: clueText(key, puzzle.profile) })),
    teams: teamsShown ? puzzle.seasons.map((s) => s.teams) : null,
    withTeams,
    solved,
    finished,
    answer: finished ? target : null,
    summary: finished ? { points, attempts, solved, withTeams, rows: [shareRow(guesses, withTeams)] } : null,
  };
}

export type MoveError = "out-of-order" | "unknown-player" | "repeated";

/**
 * Jugada `index`: decir un jugador (`move` = su id) o ver los equipos (`TEAMS_MOVE`). Lo decide el servidor: una jugada
 * ya hecha devuelve lo que contó (`changed` false), y ni un jugador que no está en la lista, ni uno ya dicho, ni ver
 * los equipos dos veces gastan nada.
 */
export function playRun(run: CarreraRun, puzzle: DayPuzzle, index: number, move: Move): { state: CarreraRun; outcome: RunView; changed: boolean } | { error: MoveError } {
  if (!Number.isInteger(index) || index < 0) return { error: "out-of-order" };
  if (index < run.answers.length) return { state: run, outcome: viewRun(run, puzzle), changed: false };
  if (index !== run.answers.length || runScore(run).finished) return { error: "out-of-order" };
  if (move === TEAMS_MOVE) {
    if (run.answers.includes(TEAMS_MOVE)) return { error: "repeated" };
  } else {
    if (!puzzle.suspects.some((s) => s.id === move)) return { error: "unknown-player" };
    if (run.answers.includes(move)) return { error: "repeated" };
  }
  const state: CarreraRun = { ...run, answers: [...run.answers, move] };
  return { state, outcome: viewRun(state, puzzle), changed: true };
}
