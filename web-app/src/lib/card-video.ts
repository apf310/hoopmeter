// Vídeo vertical de la carta (Tarea 7.11, motor de la 6.15): la carta se enciende, sube y da una vuelta completa
// (el reverso pasa por delante a mitad de vídeo) y se queda de frente con el nombre debajo. Línea de tiempo pura:
// la dibuja `components/cards/card-video.ts`. No lleva nada de ningún partido: se ofrece en los tres niveles.

export const CARD_VIDEO_FPS = 30;
export const CARD_VIDEO_DURATION = 8;

/** Ángulo de reposo: un poco girada, como en la ficha. */
export const REST_ANGLE = -0.42;

const INTRO_END = 1.3;
/** Media vuelta hasta el reverso, un segundo quieta para que se lea y la otra media hasta el frente. */
const TO_BACK = [1.5, 3.2] as const;
const TO_FRONT = [4.3, 6.0] as const;
const SPIN_END = TO_FRONT[1];
const TEXT_START = 6.0;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (v: number) => 1 - (1 - clamp01(v)) ** 3;
const easeInOut = (v: number) => {
  const x = clamp01(v);
  return x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2;
};

export type CardVideoPose = {
  /** Giro alrededor del eje vertical (radianes; 0 = de frente). */
  ry: number;
  /** Inclinación hacia delante o atrás. */
  rx: number;
  /** 0 → 1: la carta sube desde abajo. */
  rise: number;
  /** 0 → 1: se encienden el foco y los reflejos. */
  light: number;
  /** 0 → 1: aparece el nombre bajo la carta. */
  caption: number;
};

/** Pose de la carta en el instante `t` (segundos de vídeo). */
export function cardVideoPose(t: number): CardVideoPose {
  const intro = clamp01(t / INTRO_END);
  const light = clamp01((intro - 0.15) / 0.55);
  const rise = easeOut((intro - 0.05) / 0.95);
  // Entra girando hasta el reposo, da la vuelta completa (con una parada en el reverso) y se mece un poco al final
  const entry = REST_ANGLE - 2.2 * (1 - rise);
  const half = ([from, to]: readonly [number, number]) => easeInOut((t - from) / (to - from)) * Math.PI;
  const spin = half(TO_BACK) + half(TO_FRONT);
  const settle = clamp01((t - SPIN_END) / 0.8);
  const sway = Math.sin(Math.max(0, t - SPIN_END) * 1.6) * 0.12 * settle;
  return {
    ry: entry + spin + sway,
    rx: 0.07 + Math.sin(t * 0.9) * 0.03,
    rise,
    light: light * light,
    caption: easeOut((t - TEXT_START) / 0.7),
  };
}

/** La cara que mira a la cámara con un giro `ry`. */
export function faceAt(ry: number): "front" | "back" {
  return Math.cos(ry) >= 0 ? "front" : "back";
}
