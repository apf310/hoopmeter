// Recibos de los retos (Tarea 8.5): al acabar una partida, su servidor firma lo que ha salido (partida, reto, día, puntos,
// tiempo y cuadros) y el dispositivo lo guarda con el resultado. Al pasar a la cuenta, la web solo se fía de los
// resultados con recibo válido: así los puntos nunca los dice el cliente, aunque se jugaran sin cuenta.
// Solo servidor (firma con la clave del GM). La parte pura (firmar y comprobar con una clave dada) la usan los tests.
//
// Formato: "r1.<datos en base64url>.<HMAC-SHA256 en base64url>". El mismo resultado da siempre el mismo recibo, así que
// volver a pedir una partida acabada no crea recibos nuevos. Cada partida vale una sola vez en todo Hoopmeter: lo
// comprueba `account_claim` (`cuentas.sql`) con el número de partida.
import { createHmac, timingSafeEqual } from "node:crypto";
import { CHALLENGES, isMarksRow, RECEIPT_MAX_LENGTH, type ChallengeId } from "./games.ts";

const VERSION = "r1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** Tiempo de respuesta máximo creíble (30 preguntas de 15 s + margen): más sería un dato roto. */
const MAX_MS = 3_600_000;
const MAX_ROWS = 10;

export type Receipt = {
  /** Número de la partida en el servidor del reto. */
  run: string;
  game: ChallengeId;
  day: string;
  points: number;
  /** Tiempo de respuesta medido en el servidor (solo ¿Más o menos?; 0 en los demás). */
  ms: number;
  rows: string[];
};

const maxPoints = new Map(CHALLENGES.map((c) => [c.id, c.maxPoints]));

export function isReceipt(value: unknown): value is Receipt {
  if (!value || typeof value !== "object") return false;
  const { run, game, day, points, ms, rows } = value as Record<string, unknown>;
  const max = maxPoints.get(game as ChallengeId);
  return (
    typeof run === "string" &&
    UUID.test(run) &&
    max !== undefined &&
    typeof day === "string" &&
    DAY.test(day) &&
    Number.isInteger(points) &&
    (points as number) >= 0 &&
    (points as number) <= max &&
    Number.isInteger(ms) &&
    (ms as number) >= 0 &&
    (ms as number) <= MAX_MS &&
    Array.isArray(rows) &&
    rows.length <= MAX_ROWS &&
    rows.every(isMarksRow)
  );
}

const sign = (data: string, key: Buffer) => createHmac("sha256", key).update(`${VERSION}.${data}`).digest("base64url");

/** Firma un resultado con la clave dada. */
export function signReceipt(receipt: Receipt, key: Buffer): string {
  const { run, game, day, points, ms, rows } = receipt;
  const data = Buffer.from(JSON.stringify({ run, game, day, points, ms, rows })).toString("base64url");
  return `${VERSION}.${data}.${sign(data, key)}`;
}

/** El resultado de un recibo si la firma es buena y los datos cuadran; null si no. */
export function verifyReceipt(token: unknown, key: Buffer): Receipt | null {
  if (typeof token !== "string" || token.length > RECEIPT_MAX_LENGTH) return null;
  const [version, data, signature, extra] = token.split(".");
  if (version !== VERSION || !data || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(data, key));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  return isReceipt(parsed) ? parsed : null;
}

// ---------------------------------------------------------------------------------------------------------
// Servidor

let cachedKey: { secret: string; key: Buffer } | null = null;

/** La clave de los recibos sale de la del GM (`GM_DB_SECRET`); sin ella (en local) no hay recibos. */
export function receiptKey(): Buffer | null {
  const secret = process.env.GM_DB_SECRET;
  if (!secret) return null;
  if (cachedKey?.secret !== secret) cachedKey = { secret, key: createHmac("sha256", secret).update("receipt-key|v1").digest() };
  return cachedKey.key;
}

/**
 * El resumen de una partida acabada con su recibo (sin la clave, sin él: el resultado se queda en el dispositivo).
 * Lo llaman los almacenes de cada reto al devolver una partida acabada.
 */
export function withReceipt<S extends { points: number; rows: string[] }>(
  summary: S,
  { run, game, day, ms = 0 }: { run: string; game: ChallengeId; day: string; ms?: number }
): S & { receipt?: string } {
  const key = receiptKey();
  if (!key) return summary;
  const receipt: Receipt = { run, game, day, points: summary.points, ms: Math.max(0, Math.round(ms)), rows: summary.rows };
  return isReceipt(receipt) ? { ...summary, receipt: signReceipt(receipt, key) } : summary;
}
