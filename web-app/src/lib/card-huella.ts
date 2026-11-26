// Huella de las cartas 2.0 (Tarea 7.11): el dibujo del fondo de cada carta nace de seis valores del jugador
// (sus atributos o, en las leyendas, su palmarés), con una técnica distinta en cada material. No hay dos iguales
// y cambia solo cuando cambian los atributos (job diario). Puro y sin DOM: lo pintan la carta de la página
// (máscaras en canvas), la carta 3D y el vídeo. Se prueba con `npm test`. Diseño aprobado el 25-nov (prototipo).
import type { CardTier } from "./player-card.ts";

const TAU = Math.PI * 2;

/** Seis valores de 0 a 1, en el orden del radar: anotación arriba y en el sentido del reloj. */
export type HuellaValues = readonly number[];

/** Trazos con el mismo grosor. `width` = múltiplo del grosor base de quien pinta; cada línea, [x0, y0, x1, y1…]. */
export type HuellaStroke = { width: number; lines: number[][] };

/**
 * Faceta del zafiro: triángulo [x0, y0, x1, y1, x2, y2], la altura de cada vértice (relieve de la talla 3D) y la
 * media (0 a ~1,1: más alta donde es mejor).
 */
export type HuellaFacet = { points: number[]; z: number[]; height: number };

export type HuellaLayer = { strokes: HuellaStroke[]; facets: HuellaFacet[] };

/**
 * Coordenadas del arte: el ancho mide 1 y el alto `aspect`. Dos capas que brillan en momentos distintos: `main`
 * (el dibujo) y `accent` (sus líneas maestras o, en el zafiro, el relleno de las facetas).
 */
export type Huella = { tier: CardTier; aspect: number; cx: number; cy: number; radius: number; main: HuellaLayer; accent: HuellaLayer };

/** Proporción del arte de la carta (ancho 5 × alto 7). */
export const CARD_ASPECT = 1.4;

/** Centro del dibujo: detrás de la cabeza del jugador. */
const CENTER_Y = 0.4;
const RADIUS = 0.44;

/** Seis cimas del relieve y ejes del radar: la primera arriba. */
export const PEAKS = Array.from({ length: 6 }, (_, i) => -Math.PI / 2 + (i / 6) * TAU);

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const round2 = (v: number) => Math.round(v * 100) / 100;

/** Números repetibles a partir de una semilla (misma semilla = mismo dibujo). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Los seis atributos de la temporada (40 a 99) en valores de la huella; null si aún no ha jugado (atributos a 0):
 * sin atributos no hay huella, nunca la del año pasado. Con dos decimales: en el HTML viajan seis números cortos.
 */
export function huellaFromAttributes(attributes: readonly number[]): number[] | null {
  if (attributes.length !== 6 || attributes.every((a) => !a)) return null;
  return attributes.map((a) => round2(Math.max(0.03, clamp((a - 40) / 59))));
}

/** Palmarés de una leyenda en el orden de su huella (y de su reverso). */
export const LEGEND_HONOURS = ["champion", "mvp", "fmvp", "allnba", "alldef", "allstar"] as const;
export type LegendHonour = (typeof LEGEND_HONOURS)[number];

/** Cuánto hace falta en cada premio para acercarse al borde: un anillo pesa más que un All-Star. */
const HONOUR_SCALE: Record<LegendHonour, number> = { champion: 4, mvp: 3, fmvp: 3, allnba: 8, alldef: 6, allstar: 8 };

/**
 * Leyendas: sin radar de la temporada, la huella sale del palmarés (anillos, MVP, MVP de las Finales, All-NBA,
 * Quintetos Defensivos y All-Star). Crece rápido con los primeros premios y se satura con los muchos.
 */
export function huellaFromHonours(counts: Partial<Record<LegendHonour, number>>): number[] {
  return LEGEND_HONOURS.map((key) => round2(0.12 + 0.88 * (1 - Math.exp(-(counts[key] ?? 0) / HONOUR_SCALE[key]))));
}

/** Los seis valores alrededor del centro, unidos con suavidad (anotación arriba, en el sentido del reloj). */
function envelope(values: HuellaValues): (theta: number) => number {
  return (theta) => {
    let u = ((theta + Math.PI / 2) / TAU) * 6;
    u = ((u % 6) + 6) % 6;
    const i = Math.floor(u);
    const f = u - i;
    const s = f * f * (3 - 2 * f);
    return values[i] * (1 - s) + values[(i + 1) % 6] * s;
  };
}

/** Relieve de seis cimas (esmeralda y zafiro), en unidades de 1 = radio. */
function field(values: HuellaValues): (x: number, y: number) => number {
  return (x, y) => {
    let f = 0;
    for (let i = 0; i < 6; i++) {
      const dx = x - Math.cos(PEAKS[i]) * 0.72;
      const dy = y - Math.sin(PEAKS[i]) * 0.72;
      f += values[i] * Math.exp(-(dx * dx + dy * dy) / 0.2);
    }
    return f + 0.1 * Math.exp(-(x * x + y * y) / 0.5) + 0.05 * Math.sin(x * 2.6 + y * 1.7) + 0.04 * Math.cos(y * 3.4 - x);
  };
}

type Frame = { cx: number; cy: number; R: number; aspect: number };

function polar(frame: Frame, r: (theta: number) => number, steps: number): number[] {
  const line: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * TAU;
    const rr = r(t);
    line.push(frame.cx + rr * Math.cos(t), frame.cy + rr * Math.sin(t));
  }
  return line;
}

/** Curvas de nivel (marching squares) del relieve: cada quinta, más gruesa. */
function contours(values: HuellaValues, frame: Frame, levels: number, columns: number): { thin: number[][]; bold: number[][] } {
  const f = field(values);
  const N = columns;
  const M = Math.round(N * frame.aspect);
  const g = new Float32Array((N + 1) * (M + 1));
  let max = 0;
  for (let j = 0; j <= M; j++)
    for (let i = 0; i <= N; i++) {
      const v = f((i / N - frame.cx) / frame.R, ((j / M) * frame.aspect - frame.cy) / frame.R);
      g[j * (N + 1) + i] = v;
      if (v > max) max = v;
    }
  const thin: number[][] = [];
  const bold: number[][] = [];
  const px = (i: number) => i / N;
  const py = (j: number) => (j / M) * frame.aspect;
  for (let l = 1; l <= levels; l++) {
    const iso = -0.08 + ((max + 0.06) * l) / (levels + 0.4);
    const out = l % 5 === 0 ? bold : thin;
    for (let j = 0; j < M; j++)
      for (let i = 0; i < N; i++) {
        const a = g[j * (N + 1) + i] - iso;
        const b = g[j * (N + 1) + i + 1] - iso;
        const c = g[(j + 1) * (N + 1) + i + 1] - iso;
        const d = g[(j + 1) * (N + 1) + i] - iso;
        const pts: number[] = [];
        if (a * b < 0) pts.push(px(i + a / (a - b)), py(j));
        if (b * c < 0) pts.push(px(i + 1), py(j + b / (b - c)));
        if (c * d < 0) pts.push(px(i + 1 - c / (c - d)), py(j + 1));
        if (d * a < 0) pts.push(px(i), py(j + 1 - d / (d - a)));
        for (let k = 0; k + 3 < pts.length; k += 4) out.push([pts[k], pts[k + 1], pts[k + 2], pts[k + 3]]);
      }
  }
  return { thin, bold };
}

/** Talla del zafiro: rejilla de triángulos con un desorden fijo, más altos donde el jugador es mejor. */
export function facetsOf(values: HuellaValues, aspect = CARD_ASPECT): HuellaFacet[] {
  const frame: Frame = { cx: 0.5, cy: CENTER_Y * aspect, R: RADIUS, aspect };
  const f = field(values);
  const r = seeded(41);
  const N = 9;
  const M = Math.round(N * aspect);
  const pt: [number, number, number][] = [];
  for (let j = 0; j <= M; j++)
    for (let i = 0; i <= N; i++) {
      const edgeX = i === 0 || i === N;
      const edgeY = j === 0 || j === M;
      const x = (i + (edgeX ? 0 : (r() - 0.5) * 0.85) + (j % 2 && !edgeX ? 0.25 : 0)) / N;
      const y = ((j + (edgeY ? 0 : (r() - 0.5) * 0.8)) / M) * aspect;
      pt.push([x, y, f((x - frame.cx) / frame.R, (y - frame.cy) / frame.R) + (r() - 0.5) * 0.16]);
    }
  const facets: HuellaFacet[] = [];
  const tri = (p: [number, number, number][]) =>
    facets.push({
      points: p.flatMap(([x, y]) => [x, y]),
      z: p.map(([, , z]) => clamp(z, 0, 1.1)),
      height: clamp((p[0][2] + p[1][2] + p[2][2]) / 3, 0, 1.1),
    });
  for (let j = 0; j < M; j++)
    for (let i = 0; i < N; i++) {
      const a = pt[j * (N + 1) + i];
      const b = pt[j * (N + 1) + i + 1];
      const c = pt[(j + 1) * (N + 1) + i + 1];
      const d = pt[(j + 1) * (N + 1) + i];
      if ((i + j) % 2) {
        tri([a, b, c]);
        tri([a, c, d]);
      } else {
        tri([a, b, d]);
        tri([b, c, d]);
      }
    }
  return facets;
}

const empty = (): HuellaLayer => ({ strokes: [], facets: [] });

/**
 * La huella de un jugador con la técnica de su material: roseta de guilloché (oro), red de rayos (refractor), curvas
 * de nivel (esmeralda), facetas (zafiro) y pintura de pista (cartón). `detail` < 1 aligera el dibujo de las cartas
 * pequeñas (menos líneas: a 140 px no se distinguirían).
 */
export function buildHuella(tier: CardTier, values: HuellaValues, { aspect = CARD_ASPECT, detail = 1 } = {}): Huella {
  const v = Array.from({ length: 6 }, (_, i) => clamp(Number(values[i]) || 0, 0.03, 1));
  const frame: Frame = { cx: 0.5, cy: CENTER_Y * aspect, R: RADIUS, aspect };
  const { cx, cy, R } = frame;
  const E = envelope(v);
  const main = empty();
  const accent = empty();
  const steps = detail < 0.75 ? 360 : 720;

  if (tier === "legend") {
    const rings = Math.max(20, Math.round(54 * detail));
    const lines: number[][] = [];
    for (let k = 0; k < rings; k++) {
      const t = k / (rings - 1);
      lines.push(polar(frame, (a) => R * (0.14 + 1.02 * t) * (0.45 + 0.55 * E(a)) + R * 0.06 * (0.35 + t) * Math.cos(18 * a + k * (TAU / 5)), steps));
    }
    main.strokes.push({ width: 1, lines });
    accent.strokes.push({
      width: 1.6,
      lines: [0, 1, 2].map((k) => polar(frame, (a) => R * (0.5 + 0.3 * k) * (0.45 + 0.55 * E(a)) + R * 0.03 * Math.cos(90 * a), 720)),
    });
  } else if (tier === "elite") {
    const arms = Math.max(24, Math.round(40 * detail));
    const lines: number[][] = [];
    for (const s of [-1, 1])
      for (let j = 0; j < arms; j++) {
        const line: number[] = [];
        for (let i = 0; i <= 120; i++) {
          const t = i / 120;
          const a = (j / arms) * TAU + s * 1.25 * Math.pow(t, 0.8);
          const r = R * (0.05 + 1.6 * t) * (0.35 + 0.65 * E(a));
          line.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
        }
        lines.push(line);
      }
    main.strokes.push({ width: 1, lines });
    accent.strokes.push({ width: 2.2, lines: [0.55, 1.02].map((k) => polar(frame, (a) => R * k * (0.35 + 0.65 * E(a)), steps)) });
  } else if (tier === "great") {
    const { thin, bold } = contours(v, frame, Math.max(14, Math.round(24 * detail)), Math.max(80, Math.round(150 * detail)));
    main.strokes.push({ width: 1, lines: thin });
    accent.strokes.push({ width: 2, lines: bold });
  } else if (tier === "good") {
    const facets = facetsOf(v, aspect);
    main.strokes.push({ width: 1, lines: facets.map((f) => [...f.points, f.points[0], f.points[1]]) });
    accent.facets = facets;
  } else {
    // Pintura de pista: tres líneas con la silueta de sus atributos y un círculo por atributo, mayor donde es mejor
    main.strokes.push(
      { width: 5, lines: [polar(frame, (a) => R * 1.15 * (0.35 + 0.65 * Math.sqrt(E(a))), steps)] },
      { width: 2.5, lines: [0.82, 0.5].map((k) => polar(frame, (a) => R * k * (0.35 + 0.65 * Math.sqrt(E(a))), steps)) },
      {
        width: 1.6,
        lines: PEAKS.map((p, i) => {
          const ox = cx + Math.cos(p) * R * 0.85;
          const oy = cy + Math.sin(p) * R * 0.85;
          const rr = R * 0.3 * Math.sqrt(v[i]);
          return polar({ ...frame, cx: ox, cy: oy }, () => rr, 96);
        }),
      }
    );
  }
  return { tier, aspect, cx, cy, radius: R, main, accent };
}
