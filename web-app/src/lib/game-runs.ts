// Partidas de los retos en el servidor (Tareas 8.2-8.4): ¿Más o menos?, Adivina el jugador y Carrera oculta. Solo servidor.
//
// Viven en Supabase (`game_runs`, `backend-data/juegos.sql`), con la clave del GM (`GM_DB_SECRET`), para que cualquier
// instancia de Vercel pueda seguir una partida empezada en otra. Cada instancia recuerda además las suyas: lo normal es
// una sola llamada a la base de datos por jugada, la que la guarda (y solo si la partida seguía donde estaba: así
// reenviar una jugada, o mandar dos a la vez desde dos pestañas, nunca cuenta dos veces).
// Sin la clave, o si Supabase falla, la partida sigue en la memoria de la instancia: el juego nunca deja de funcionar.
import { randomUUID } from "node:crypto";
import { getSupabase } from "./supabase";

export type RunGame = "mas-o-menos" | "adivina" | "carrera";

const TIMEOUT_MS = 2_500;
const MEMORY_MS = 24 * 3_600_000;
const MEMORY_SIZE = 2_000;

export const gameSecret = () => process.env.GM_DB_SECRET || null;

/** Llamada a una función de la base de datos con tiempo máximo. */
export async function callGameDb(name: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await getSupabase().rpc(name, args).abortSignal(AbortSignal.timeout(TIMEOUT_MS));
  if (error) throw new Error(error.message);
  return data;
}

/** Lo que guarda la base de datos de cada partida, además de su estado. */
export type RunScore = { score: number; totalMs: number; finished: boolean };

/** Resultado de aplicar una jugada: el estado nuevo y lo que se responde, o por qué no vale. */
export type Applied<S, O, E extends string> = { state: S; outcome: O; changed: boolean } | { error: E };

export type PlayResult<O, E extends string> = { outcome: O } | { error: E | "not-found" | "conflict" };

type Entry<S> = { state: S; at: number; shared: boolean };

/**
 * Almacén de las partidas de un reto. `step` = jugadas ya hechas (las respuestas del estado); `score` = lo que se
 * guarda en sus columnas (puntos, tiempo y si ha acabado).
 */
export function createRunStore<S extends { day: string; answers: unknown[] }>(
  game: RunGame,
  { isState, score }: { isState: (value: unknown) => value is S; score: (state: S) => RunScore }
) {
  const memory = new Map<string, Entry<S>>();

  function remember(id: string, state: S, shared: boolean) {
    memory.delete(id);
    memory.set(id, { state, shared, at: Date.now() });
    if (memory.size > MEMORY_SIZE) memory.delete(memory.keys().next().value!);
  }

  function recall(id: string): Entry<S> | null {
    const entry = memory.get(id);
    if (entry && Date.now() - entry.at < MEMORY_MS) return entry;
    memory.delete(id);
    return null;
  }

  /** La partida tal como está en la base de datos. */
  async function loadShared(id: string): Promise<Entry<S> | null> {
    const key = gameSecret();
    if (!key) return null;
    try {
      const run = (await callGameDb("game_run_get", { p_secret: key, p_id: id })) as { game?: unknown; state?: unknown } | null;
      if (!run || (run.game !== undefined && run.game !== game) || !isState(run.state)) return null;
      remember(id, run.state, true);
      return recall(id);
    } catch (error) {
      console.error(`[juegos/${game}] partida no leída:`, error instanceof Error ? error.message : error);
      return null;
    }
  }

  /** Guarda la jugada `step` solo si la partida seguía ahí. false = otra petición la contestó antes. */
  async function advance(id: string, step: number, state: S): Promise<boolean> {
    const { score: points, totalMs, finished } = score(state);
    try {
      const saved = await callGameDb("game_run_advance", {
        p_secret: gameSecret(),
        p_id: id,
        p_step: step,
        p_state: state,
        p_score: points,
        p_total_ms: totalMs,
        p_finished: finished,
      });
      if (saved !== true) {
        memory.delete(id);
        return false;
      }
      remember(id, state, true);
    } catch (error) {
      // Supabase no responde: la partida sigue en esta instancia
      console.error(`[juegos/${game}] jugada solo en esta instancia:`, error instanceof Error ? error.message : error);
      remember(id, state, false);
    }
    return true;
  }

  return {
    /** Guarda una partida nueva y devuelve su id. */
    async create(state: S): Promise<string> {
      const id = randomUUID();
      const key = gameSecret();
      let shared = false;
      if (key) {
        try {
          await callGameDb("game_run_create", { p_secret: key, p_id: id, p_game: game, p_day: state.day, p_state: state });
          shared = true;
        } catch (error) {
          console.error(`[juegos/${game}] partida solo en esta instancia:`, error instanceof Error ? error.message : error);
        }
      }
      remember(id, state, shared);
      return id;
    },

    /**
     * La partida, de esta instancia o de la base de datos; null si no existe o es de hace más de un día. Con `fresh`, la
     * de la base de datos aunque esté en memoria (la memoria puede ir por detrás si la partida siguió en otra instancia).
     */
    async get(id: string, { fresh = true }: { fresh?: boolean } = {}): Promise<S | null> {
      const entry = recall(id);
      if (entry?.shared && fresh) return (await loadShared(id))?.state ?? entry.state;
      return entry?.state ?? (await loadShared(id))?.state ?? null;
    },

    /**
     * Hace una jugada con `apply` (que decide con la hora del servidor). Repetir una jugada devuelve la que contó; si la
     * memoria de esta instancia se ha quedado atrás (la partida siguió en otra), manda la base de datos.
     */
    async play<O, E extends string>(id: string, apply: (state: S) => Applied<S, O, E>): Promise<PlayResult<O, E>> {
      let entry = recall(id) ?? (await loadShared(id));
      if (!entry) return { error: "not-found" };

      let result = apply(entry.state);
      if (("error" in result || !result.changed) && entry.shared) {
        const fresh = await loadShared(id);
        if (fresh) {
          entry = fresh;
          result = apply(entry.state);
        }
      }
      if ("error" in result) return { error: result.error };
      if (!result.changed) return { outcome: result.outcome };

      if (!entry.shared) {
        remember(id, result.state, false);
        return { outcome: result.outcome };
      }
      if (await advance(id, entry.state.answers.length, result.state)) return { outcome: result.outcome };

      // Otra petición hizo esta jugada a la vez: vale la primera
      const winner = await loadShared(id);
      const replay = winner && apply(winner.state);
      return replay && !("error" in replay) && !replay.changed ? { outcome: replay.outcome } : { error: "conflict" };
    },
  };
}
