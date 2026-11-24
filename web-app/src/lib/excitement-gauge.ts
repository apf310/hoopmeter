// Velocímetro de la nota (Tarea 7.1): geometría y animación puras, sin React ni DOM.
// Solo recibe la nota: el dibujo no puede depender de nada más del partido (marcador, prórroga…).
import { EXCITEMENT_THRESHOLDS, getExcitementTone, type ExcitementTone } from "./spoilers.ts";

export const GAUGE_MIN = 1;
export const GAUGE_MAX = 10;

/** Recorrido de la aguja en grados: de la izquierda (1,0) a la derecha (10,0) por arriba. */
export const GAUGE_SWEEP = 180;

/** Duración fija de la animación: la misma para cualquier nota (ms). */
export const GAUGE_DURATION_MS = 1200;

/** Lienzo del SVG: el eje (balón) en (CX, CY) y el arco por encima. */
export const GAUGE_VIEWBOX = { width: 220, height: 128 } as const;
export const GAUGE_CENTER = { x: 110, y: 112 } as const;
export const GAUGE_RADIUS = 80;

/** Colores de la escala, los mismos que las pestañas del logo (`assets/logo.svg`). */
export const GAUGE_TONE_COLORS: Record<ExcitementTone, string> = {
  low: "#ef4444",
  mid: "#f59e0b",
  high: "#10b981",
  pending: "#475569",
};

/** Tramos de la escala: rojo < 5, ámbar 5-7,9, verde 8+. */
export const GAUGE_ZONES: { from: number; to: number; tone: ExcitementTone }[] = [
  { from: GAUGE_MIN, to: EXCITEMENT_THRESHOLDS.mid, tone: "low" },
  { from: EXCITEMENT_THRESHOLDS.mid, to: EXCITEMENT_THRESHOLDS.high, tone: "mid" },
  { from: EXCITEMENT_THRESHOLDS.high, to: GAUGE_MAX, tone: "high" },
];

export function clampScore(value: number): number {
  if (!Number.isFinite(value)) return GAUGE_MIN;
  return Math.min(GAUGE_MAX, Math.max(GAUGE_MIN, value));
}

/** Giro de la aguja (grados, sentido horario en pantalla) desde la posición del 1,0, que apunta a la izquierda. */
export function needleRotation(value: number): number {
  return ((clampScore(value) - GAUGE_MIN) / (GAUGE_MAX - GAUGE_MIN)) * GAUGE_SWEEP;
}

/** Punto del arco de radio `radius` para una nota (coordenadas del SVG, y hacia abajo). */
export function pointAt(value: number, radius: number): { x: number; y: number } {
  const angle = ((180 - needleRotation(value)) * Math.PI) / 180;
  return {
    x: round(GAUGE_CENTER.x + radius * Math.cos(angle)),
    y: round(GAUGE_CENTER.y - radius * Math.sin(angle)),
  };
}

/** Trazo de arco entre dos notas (vacío si no hay recorrido). */
export function arcPath(from: number, to: number, radius: number = GAUGE_RADIUS): string {
  const a = clampScore(from);
  const b = clampScore(to);
  if (b - a < 1e-6) return "";
  const start = pointAt(a, radius);
  const end = pointAt(b, radius);
  return `M${start.x} ${start.y}A${radius} ${radius} 0 0 1 ${end.x} ${end.y}`;
}

/** Tramos de color rellenos hasta `value` (la parte de la escala que la aguja ya ha recorrido). */
export function filledZones(value: number): { tone: ExcitementTone; d: string }[] {
  const v = clampScore(value);
  return GAUGE_ZONES.filter((zone) => v > zone.from).map((zone) => ({
    tone: zone.tone,
    d: arcPath(zone.from, Math.min(v, zone.to)),
  }));
}

/** Pestañas (como las del logo): una marca por punto entero de la escala, con el color de su tramo. */
export function gaugeLashes(inner: number, outer: number): { value: number; tone: ExcitementTone; x1: number; y1: number; x2: number; y2: number }[] {
  return Array.from({ length: GAUGE_MAX - GAUGE_MIN + 1 }, (_, i) => {
    const value = GAUGE_MIN + i;
    const a = pointAt(value, inner);
    const b = pointAt(value, outer);
    return { value, tone: getExcitementTone(value), x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  });
}

/** Curva de la aguja: arranca rápida, se pasa un poco y vuelve (como la de un coche al arrancar). */
export function easeOutBack(t: number): number {
  const c1 = 1.4;
  const c3 = c1 + 1;
  const x = Math.min(1, Math.max(0, t)) - 1;
  return 1 + c3 * x * x * x + c1 * x * x;
}

/** Curva de la cifra: sin pasarse, para que nunca enseñe una nota que no es. */
export function easeOutCubic(t: number): number {
  const x = 1 - Math.min(1, Math.max(0, t));
  return 1 - x * x * x;
}

/**
 * Estado del velocímetro `elapsed` ms después de empezar a subir de `from` a `to`:
 * la aguja (que puede pasarse un poco, pero nunca del 10 ni bajar del 1) y la cifra (que no se pasa).
 */
export function gaugeFrame(from: number, to: number, elapsed: number): { needle: number; label: number; done: boolean } {
  const a = clampScore(from);
  const b = clampScore(to);
  const t = GAUGE_DURATION_MS > 0 ? elapsed / GAUGE_DURATION_MS : 1;
  if (t >= 1) return { needle: b, label: b, done: true };
  return {
    needle: clampScore(a + (b - a) * easeOutBack(t)),
    label: a + (b - a) * easeOutCubic(t),
    done: false,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
