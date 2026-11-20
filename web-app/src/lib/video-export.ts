// Vídeo MP4 (H.264) a partir de un canvas, fotograma a fotograma, con WebCodecs (Tarea 6.15).
// MP4 y no WebM: Instagram, TikTok y WhatsApp no aceptan WebM. Más rápido que grabar en tiempo
// real (MediaRecorder) y sin saltos aunque el móvil vaya cargado. `mediabunny` se carga bajo demanda.

/** Sin WebCodecs (navegadores antiguos) no se ofrece el vídeo. */
export function canEncodeVideoHere(): boolean {
  return typeof window !== "undefined" && "VideoEncoder" in window && "VideoFrame" in window;
}

export type EncodeOptions = {
  width: number;
  height: number;
  fps: number;
  duration: number;
  /** Dibuja el instante `t` (segundos) en el canvas del vídeo. */
  draw: (ctx: CanvasRenderingContext2D, t: number) => void;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
};

// Gráficos planos: 5 Mbit/s bastan para 1080×1920 (unos 7-8 MB en 12 s)
const BITRATE = 5_000_000;

export async function encodeVideo({ width, height, fps, duration, draw, onProgress, signal }: EncodeOptions): Promise<Blob> {
  const { BufferTarget, CanvasSource, Mp4OutputFormat, Output, canEncodeVideo } = await import("mediabunny");
  if (!(await canEncodeVideo("avc", { width, height, bitrate: BITRATE }))) throw new Error("H.264 no disponible");

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas 2D no disponible");

  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target });
  const source = new CanvasSource(canvas, { codec: "avc", bitrate: BITRATE, keyFrameInterval: 2 });
  output.addVideoTrack(source, { frameRate: fps });
  await output.start();

  try {
    const frames = Math.round(duration * fps);
    for (let i = 0; i < frames; i++) {
      if (signal?.aborted) throw new DOMException("Cancelado", "AbortError");
      draw(ctx, i / fps);
      // Espera al codificador cuando va por detrás: la memoria no crece con la duración
      await source.add(i / fps, 1 / fps);
      onProgress?.((i + 1) / frames);
    }
    await output.finalize();
  } catch (error) {
    await output.cancel().catch(() => undefined);
    throw error;
  }

  if (!target.buffer) throw new Error("Vídeo vacío");
  return new Blob([target.buffer], { type: "video/mp4" });
}
