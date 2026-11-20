// Posición del modo diferido (Tarea 6.13): por dónde va quien ve el partido grabado, los pasos de
// cuarto y de ±1 min y sus textos. Puro y pequeño: lo usan el cliente, la ruta y `deferred.ts`.
import { periodName } from "./game-format.ts";

const REGULATION_PERIOD_S = 12 * 60;
const OVERTIME_PERIOD_S = 5 * 60;

/** Por dónde va el usuario: periodo (5 = 1.ª prórroga) y segundos que le quedan a su reloj. */
export type DeferredPosition = { period: number; remaining: number };

/** 4 cuartos + hasta 10 prórrogas. */
export const MAX_PERIOD = 14;
const STEP_S = 60;

export function periodLength(period: number, regulation = 4): number {
  return period <= regulation ? REGULATION_PERIOD_S : OVERTIME_PERIOD_S;
}

/** Inicio de un periodo, con el reloj entero. */
export function periodStartPosition(period: number, regulation = 4): DeferredPosition {
  return { period, remaining: periodLength(period, regulation) };
}

/** Al entrar en el modo diferido: el salto inicial. */
export const DEFERRED_START: DeferredPosition = periodStartPosition(1);

export function isDeferredPosition(value: unknown, regulation = 4): value is DeferredPosition {
  if (!value || typeof value !== "object") return false;
  const { period, remaining } = value as Record<string, unknown>;
  return (
    typeof period === "number" &&
    typeof remaining === "number" &&
    Number.isInteger(period) &&
    Number.isInteger(remaining) &&
    period >= 1 &&
    period <= MAX_PERIOD &&
    remaining >= 0 &&
    remaining <= periodLength(period, regulation)
  );
}

/** `?p=3&s=360` → 3.er cuarto con 6:00 por jugar. Null si no es una posición válida. */
export function parsePosition(period: string | null, remaining: string | null): DeferredPosition | null {
  if (!period || !remaining || !/^\d{1,2}$/.test(period) || !/^\d{1,3}$/.test(remaining)) return null;
  const position = { period: Number(period), remaining: Number(remaining) };
  return isDeferredPosition(position) ? position : null;
}

export const positionQuery = (position: DeferredPosition) => `p=${position.period}&s=${position.remaining}`;

export const samePosition = (a: DeferredPosition, b: DeferredPosition) => a.period === b.period && a.remaining === b.remaining;

/**
 * Un minuto adelante o atrás. Al llegar al final de un periodo, el siguiente paso entra un minuto
 * en el siguiente (el final de uno y el inicio del otro son el mismo instante).
 */
export function stepPosition(position: DeferredPosition, direction: 1 | -1, regulation = 4): DeferredPosition {
  const { period, remaining } = position;
  if (direction === 1) {
    if (remaining > 0) return { period, remaining: Math.max(0, remaining - STEP_S) };
    if (period >= MAX_PERIOD) return position;
    return { period: period + 1, remaining: periodLength(period + 1, regulation) - STEP_S };
  }
  const length = periodLength(period, regulation);
  if (remaining < length) return { period, remaining: Math.min(length, remaining + STEP_S) };
  if (period === 1) return position;
  return { period: period - 1, remaining: STEP_S };
}

/** 360 → "6:00" */
export function clockLabel(remaining: number): string {
  return `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;
}

/** "3.er cuarto · 6:00", "Fin del 4.º cuarto", "Fin de la prórroga". */
export function positionLabel(position: DeferredPosition, regulation = 4): string {
  const name = periodName(position.period, regulation);
  if (position.remaining === 0) return position.period > regulation ? `Fin de la ${name.toLowerCase()}` : `Fin del ${name}`;
  return `${name} · ${clockLabel(position.remaining)}`;
}
