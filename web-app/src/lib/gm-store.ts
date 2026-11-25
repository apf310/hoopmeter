// Evaluaciones del GM guardadas y tope diario (Tarea 7.7). Solo servidor.
//
// En Vercel `"use cache"` no se conserva entre visitas: el mismo traspaso llamaba a Gemini cada vez (medido: 10, 7 y 6 s
// seguidos). Ahora se guarda tres días en Supabase (`backend-data/gm.sql`) y allí se cuentan las nuevas de cada día. Las
// funciones piden `GM_DB_SECRET`: la anon key es pública y no basta para escribir. Sin la clave, o si Supabase falla,
// cada instancia lleva su propia caché y su propia cuenta: el GM nunca deja de funcionar por esto.
import { createHash } from "node:crypto";
import type { TradeEvaluation } from "./gm";
import { getSupabase } from "./supabase.ts";

/** Subirla al cambiar el *prompt* o el modelo: las guardadas con la anterior dejan de valer. */
const EVALUATION_VERSION = 1;
const DEFAULT_DAILY_LIMIT = 300;
const TIMEOUT_MS = 2_500;
const MEMORY_MS = 24 * 3_600_000;
const MEMORY_SIZE = 200;

/** Evaluaciones nuevas al día entre todos (cada una es una llamada a Gemini). */
export const dailyLimit = (value = process.env.GM_DAILY_LIMIT): number => {
  const limit = Number(value);
  return value && Number.isInteger(limit) && limit >= 0 ? limit : DEFAULT_DAILY_LIMIT;
};

export const evaluationId = (canonical: string) => createHash("sha256").update(`v${EVALUATION_VERSION}:${canonical}`).digest("hex");

/** ¿Es la evaluación de este traspaso? Una por equipo y con todos los textos. */
export function isEvaluationOf(value: unknown, teamIds: number[]): value is TradeEvaluation {
  const { summary, teams } = (value ?? {}) as Partial<TradeEvaluation>;
  const text = (part: unknown) => typeof part === "string" && part !== "";
  return (
    text(summary) &&
    Array.isArray(teams) &&
    teams.length === teamIds.length &&
    teamIds.every((id) => teams.some((team) => team?.teamId === id && text(team.grade) && text(team.headline) && text(team.analysis)))
  );
}

/** Lo que cada instancia recuerda: evita la ida a la base de datos y es el respaldo si no se puede usar. */
export function createMemory(limit: () => number, now: () => number = Date.now) {
  const stored = new Map<string, { at: number; evaluation: TradeEvaluation }>();
  let day = "";
  let used = 0;
  return {
    get(id: string): TradeEvaluation | null {
      const entry = stored.get(id);
      if (entry && now() - entry.at < MEMORY_MS) return entry.evaluation;
      stored.delete(id);
      return null;
    },
    set(id: string, evaluation: TradeEvaluation) {
      stored.delete(id);
      stored.set(id, { at: now(), evaluation });
      if (stored.size > MEMORY_SIZE) stored.delete(stored.keys().next().value!);
    },
    /** Cuenta una evaluación nueva; false = ya no queda cupo hoy. */
    claim(): boolean {
      const today = new Date(now()).toISOString().slice(0, 10);
      if (day !== today) [day, used] = [today, 0];
      if (used >= limit()) return false;
      used++;
      return true;
    },
  };
}

const memory = createMemory(dailyLimit);

async function call(name: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await getSupabase().rpc(name, args).abortSignal(AbortSignal.timeout(TIMEOUT_MS));
  if (error) throw new Error(error.message);
  return data;
}

/** La evaluación ya hecha de este traspaso o, si no la hay, si hoy queda cupo para pedirla (y ya la cuenta). */
export async function startEvaluation(canonical: string, teamIds: number[]): Promise<{ evaluation: TradeEvaluation } | { allowed: boolean }> {
  const id = evaluationId(canonical);
  const remembered = memory.get(id);
  if (remembered) return { evaluation: remembered };

  const secret = process.env.GM_DB_SECRET;
  if (secret) {
    try {
      const result = (await call("gm_evaluation_start", { p_secret: secret, p_id: id, p_daily_limit: dailyLimit() })) as { evaluation?: unknown; allowed?: boolean };
      if (isEvaluationOf(result.evaluation, teamIds)) {
        memory.set(id, result.evaluation);
        return { evaluation: result.evaluation };
      }
      if (typeof result.allowed === "boolean") return { allowed: result.allowed };
    } catch (error) {
      console.error("[gm] sin caché compartida:", error instanceof Error ? error.message : error);
    }
  }
  return { allowed: memory.claim() };
}

/** Guarda una evaluación recién hecha. Nunca lanza. */
export async function saveEvaluation(canonical: string, evaluation: TradeEvaluation): Promise<void> {
  const id = evaluationId(canonical);
  memory.set(id, evaluation);
  const secret = process.env.GM_DB_SECRET;
  if (!secret) return;
  try {
    await call("gm_evaluation_save", { p_secret: secret, p_id: id, p_evaluation: evaluation });
  } catch (error) {
    console.error("[gm] evaluación no guardada:", error instanceof Error ? error.message : error);
  }
}
