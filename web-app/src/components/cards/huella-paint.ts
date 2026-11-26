// Pinta la huella (lib/card-huella.ts) en un canvas 2D: máscaras de la carta de la página, texturas de la carta 3D,
// reverso y vídeo. Solo navegador.
import { buildHuella, CARD_ASPECT, type HuellaLayer, type HuellaValues } from "@/lib/card-huella";
import type { CardTier } from "@/lib/player-card";

type PaintOptions = {
  /** Píxeles que mide el ancho del arte (las coordenadas de la huella van de 0 a 1 en ancho). */
  scale: number;
  /** Píxeles del grosor base de las líneas. */
  unit: number;
  ox?: number;
  oy?: number;
  /** Opacidad de cada faceta del zafiro según su altura (sin ella, no se rellenan). */
  facetAlpha?: (height: number) => number;
};

/** Traza una capa con el color y el modo de fusión que ya tenga `ctx`. */
export function paintLayer(ctx: CanvasRenderingContext2D, layer: HuellaLayer, { scale, unit, ox = 0, oy = 0, facetAlpha }: PaintOptions) {
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (facetAlpha) {
    const alpha = ctx.globalAlpha;
    for (const f of layer.facets) {
      const p = f.points;
      ctx.globalAlpha = alpha * facetAlpha(f.height);
      ctx.beginPath();
      ctx.moveTo(ox + p[0] * scale, oy + p[1] * scale);
      ctx.lineTo(ox + p[2] * scale, oy + p[3] * scale);
      ctx.lineTo(ox + p[4] * scale, oy + p[5] * scale);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = alpha;
  }
  for (const stroke of layer.strokes) {
    ctx.lineWidth = Math.max(0.6, stroke.width * unit);
    ctx.beginPath();
    for (const line of stroke.lines) {
      ctx.moveTo(ox + line[0] * scale, oy + line[1] * scale);
      for (let i = 2; i < line.length; i += 2) ctx.lineTo(ox + line[i] * scale, oy + line[i + 1] * scale);
    }
    ctx.stroke();
  }
}

// ---------------------------------------------------------------- máscaras de la carta de la página

export type HuellaMasks = { main: string; accent: string };

type Entry = { promise: Promise<HuellaMasks>; refs: number; release?: ReturnType<typeof setTimeout> };

/** Las máscaras se comparten entre cartas iguales y se liberan un rato después de dejar de verse. */
const masks = new Map<string, Entry>();
const RELEASE_MS = 30_000;

const idle = (fn: () => void) =>
  typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(fn, { timeout: 400 }) : window.setTimeout(fn, 16);

function toUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(URL.createObjectURL(blob)) : reject(new Error("Sin máscara"))), "image/png"));
}

/** Blanco sobre transparente: la carta pone encima el brillo de su material (`player-card.css`). */
async function drawMasks(tier: CardTier, values: HuellaValues, mini: boolean): Promise<HuellaMasks> {
  await new Promise<void>((resolve) => idle(resolve));
  const width = mini ? 320 : 720;
  const height = Math.round(width * CARD_ASPECT);
  const huella = buildHuella(tier, values, { detail: mini ? 0.5 : 1 });
  const unit = width * (mini ? 0.0024 : 0.0019);
  const paint = (part: "main" | "accent") => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.strokeStyle = ctx.fillStyle = "#fff";
    paintLayer(ctx, huella[part], { scale: width, unit, facetAlpha: part === "accent" ? (h) => 0.12 + 0.88 * Math.min(1, h / 1.05) ** 1.6 : undefined });
    return toUrl(canvas);
  };
  const [main, accent] = await Promise.all([paint("main"), paint("accent")]);
  return { main, accent };
}

/** Pide (o reutiliza) las máscaras de una huella. Devuelve la clave para soltarlas con `releaseMasks`. */
export function acquireMasks(tier: CardTier, values: HuellaValues, mini: boolean): { key: string; promise: Promise<HuellaMasks> } {
  const key = `${tier}|${values.join(",")}|${mini ? 1 : 0}`;
  let entry = masks.get(key);
  if (!entry) {
    entry = { promise: drawMasks(tier, values, mini), refs: 0 };
    masks.set(key, entry);
  }
  if (entry.release) clearTimeout(entry.release);
  entry.release = undefined;
  entry.refs += 1;
  return { key, promise: entry.promise };
}

export function releaseMasks(key: string) {
  const entry = masks.get(key);
  if (!entry) return;
  entry.refs -= 1;
  if (entry.refs > 0) return;
  entry.release = setTimeout(() => {
    masks.delete(key);
    entry.promise.then(({ main, accent }) => [main, accent].forEach((url) => URL.revokeObjectURL(url))).catch(() => undefined);
  }, RELEASE_MS);
}
