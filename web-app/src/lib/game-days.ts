// La "foto del día" de los retos iguales para todos (Tareas 8.3 y 8.4): Adivina el jugador y Carrera oculta. Solo servidor.
//
// La foto (el jugador del día y todo lo que hace falta para jugar) se hace con el primer jugador del día y se guarda en
// `game_days` (`backend-data/juegos.sql`): así es la misma para todos durante todo el día aunque el job diario cambie
// medias a media mañana, y el jugador no se repite en `repeatDays` días. Si dos instancias la hacen a la vez, vale la
// primera que llega a la base de datos. Sin la clave (o si Supabase falla), cada instancia la hace con una semilla del
// día y la clave: sale igual en todas y no se puede adivinar leyendo el código.
import { seededRng, seedOf, type Rng } from "./adivina";
import { addDays } from "./game-day";
import { callGameDb, gameSecret, type RunGame } from "./game-runs";

/** Días que recuerda cada instancia (hoy y ayer, para las partidas empezadas antes de las 7:00). */
const DAYS_KEPT = 3;
/** Una foto que no llegó a la base de datos se vuelve a pedir pasado este rato. */
const UNSHARED_MS = 5 * 60_000;

type DayEntry<P> = { at: number; value: Promise<{ puzzle: P; shared: boolean }> };

export function createDayStore<P extends { day: string; target: number }, D>(
  game: Exclude<RunGame, "mas-o-menos">,
  {
    isPuzzle,
    repeatDays,
    load,
    build,
  }: {
    isPuzzle: (value: unknown) => value is P;
    repeatDays: number;
    /** Los datos de la base de datos con los que se hace la foto. */
    load: () => Promise<D>;
    /** La foto de ese día sin repetir a los de `recent`; null si no hay a quién poner. */
    build: (data: D, day: string, recent: ReadonlySet<number>, rng: Rng) => P | null;
  }
) {
  const days = new Map<string, DayEntry<P>>();

  async function makeDay(day: string): Promise<{ puzzle: P; shared: boolean }> {
    const key = gameSecret();
    if (key) {
      try {
        const stored = await callGameDb("game_day_get", { p_secret: key, p_game: game, p_day: day });
        if (isPuzzle(stored) && stored.day === day) return { puzzle: stored, shared: true };
      } catch (error) {
        console.error(`[juegos/${game}] foto del día no leída:`, error instanceof Error ? error.message : error);
      }
    }

    const [data, recent] = await Promise.all([
      load(),
      key
        ? (callGameDb("game_day_recent", { p_secret: key, p_game: game, p_since: addDays(day, -repeatDays) }) as Promise<number[] | null>).catch(() => null)
        : Promise.resolve(null),
    ]);
    const puzzle = build(data, day, new Set(recent ?? []), seededRng(seedOf(`${game}:${day}:${key ?? ""}`)));
    if (!puzzle) throw new Error("No hay jugadores para el reto");

    if (key) {
      try {
        // Devuelve la que se guardó primero (otra instancia pudo adelantarse)
        const saved = await callGameDb("game_day_create", { p_secret: key, p_game: game, p_day: day, p_target: puzzle.target, p_state: puzzle });
        if (isPuzzle(saved) && saved.day === day) return { puzzle: saved, shared: true };
      } catch (error) {
        console.error(`[juegos/${game}] foto del día solo en esta instancia:`, error instanceof Error ? error.message : error);
      }
    }
    return { puzzle, shared: false };
  }

  /** La foto de un día (el de hoy, o el de una partida empezada antes de las 7:00). */
  return async function getPuzzle(day: string): Promise<P> {
    const cached = days.get(day);
    if (cached) {
      const { shared } = await cached.value.catch(() => ({ shared: false }));
      if (shared || Date.now() - cached.at < UNSHARED_MS) return (await cached.value).puzzle;
    }
    const value = makeDay(day);
    const entry = { at: Date.now(), value };
    days.set(day, entry);
    // Si falla, la próxima petición lo vuelve a intentar
    value.catch(() => {
      if (days.get(day) === entry) days.delete(day);
    });
    while (days.size > DAYS_KEPT) days.delete(days.keys().next().value!);
    return (await value).puzzle;
  };
}
