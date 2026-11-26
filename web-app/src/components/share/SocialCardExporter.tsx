"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { toBlob, toCanvas } from "html-to-image";
import { Check, Clapperboard, Download, ImageIcon, LoaderCircle, RectangleHorizontal, RectangleVertical, Share2, TriangleAlert, X } from "lucide-react";
import { LogoMark } from "@/components/layout/LogoMark";
import { BRAND } from "@/lib/brand";
import { isNativeApp, shareFileNatively } from "@/lib/native";
import { canEncodeVideoHere } from "@/lib/video-export";
import { cn } from "@/lib/utils";

export type CardFormat = "16:9" | "9:16";

export const CARD_SIZE: Record<CardFormat, { width: number; height: number }> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
};

/** Alto de la franja inferior con la marca de agua; la tarjeta ocupa el resto. */
export const WATERMARK_HEIGHT: Record<CardFormat, number> = { "16:9": 84, "9:16": 112 };

/** Qué se exporta: una de las dos tarjetas o el vídeo vertical (9:16). */
type ShareFormat = CardFormat | "video";

const FORMATS: { format: ShareFormat; label: string; hint: string; Icon: typeof RectangleHorizontal }[] = [
  { format: "9:16", label: "9:16", hint: "Stories / TikTok", Icon: RectangleVertical },
  { format: "16:9", label: "16:9", hint: "X / YouTube", Icon: RectangleHorizontal },
  { format: "video", label: "Vídeo", hint: "Reels / TikTok", Icon: Clapperboard },
];

/** Dibuja el instante `t` (segundos) del contenido del vídeo: 1080 × (1920 − marca de agua). */
export type VideoDraw = (ctx: CanvasRenderingContext2D, t: number) => void;

/** Vídeo vertical opcional de la tarjeta (Tarea 6.15): se dibuja en canvas y sale en MP4 con la misma marca de agua. */
export type ShareVideo = {
  /** Carga fuentes e imágenes y devuelve el dibujo de cada fotograma. */
  prepare: () => Promise<VideoDraw>;
  duration: number;
  fps: number;
  caption?: string;
  includes?: string[];
};

// Si una imagen no carga, se deja hueco transparente en vez de abortar la exportación
const TRANSPARENT_PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/** Espera a que todas las <img> de la tarjeta estén cargadas y decodificadas. */
function imagesReady(node: HTMLElement): Promise<unknown> {
  return Promise.all(
    Array.from(node.querySelectorAll("img"), (img) =>
      img.complete
        ? img.decode().catch(() => undefined)
        : new Promise((resolve) => {
            img.addEventListener("load", resolve, { once: true });
            img.addEventListener("error", resolve, { once: true });
          })
    )
  );
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

/** Lo que la tarjeta aún prepara (la carta 3D del jugador, Tarea 7.11) lleva `data-share-pending`: se espera, con tope. */
async function pendingDone(node: HTMLElement, maxMs = 10_000): Promise<void> {
  for (let waited = 0; waited < maxMs && node.querySelector("[data-share-pending]"); waited += 100) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/** En móvil y en la app nativa se abre el menú de compartir del sistema; en escritorio, descarga directa. */
async function deliver(blob: Blob, fileName: string): Promise<"shared" | "downloaded"> {
  if (isNativeApp()) {
    await shareFileNatively(blob, fileName);
    return "shared";
  }
  const file = new File([blob], fileName, { type: blob.type || "image/png" });
  if (canShareFiles() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "shared";
    }
  }
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), { href: url, download: fileName });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "downloaded";
}

function canShareFiles(): boolean {
  return isNativeApp() || (typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches && "share" in navigator);
}

/**
 * Modo Creador: botón de compartir (solo el icono, con "Compartir imagen" como etiqueta y tooltip) que abre una ventana con la vista previa exacta de la tarjeta HD
 * (16:9 o 9:16, con la marca de agua de la app), qué incluye y el botón para compartirla o descargarla.
 * El usuario ve siempre qué está sacando antes de sacarlo.
 */
export function SocialCardExporter({
  fileName,
  caption,
  title,
  includes,
  spoiler = false,
  renderCard,
  video,
  className,
}: {
  /** Nombre base del archivo, sin formato ni extensión (p. ej. "lebron-james"). */
  fileName: string;
  /** Texto a la derecha de la marca de agua (p. ej. "Ficha de jugador · 2025-26"). */
  caption?: string;
  /** Qué se comparte, tal como lo verá el usuario (p. ej. "Ficha de LeBron James"). */
  title: string;
  /** Lo que sale en la imagen (y lo que no, si importa por los spoilers). */
  includes?: string[];
  /** La imagen contiene resultados: se avisa antes de compartirla (un texto sustituye al aviso del partido). */
  spoiler?: boolean | string;
  renderCard: (format: CardFormat) => ReactNode;
  /** Además de la imagen, un vídeo vertical (solo donde no destripa nada que el nivel no enseñe). */
  video?: ShareVideo;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Compartir imagen: ${title}`}
        title="Compartir imagen"
        className={cn(
          "inline-flex size-11.5 md:size-10 items-center justify-center border border-white/25 bg-slate-950/60 text-white outline-none transition-colors hover:border-orange-500 hover:bg-orange-500 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-orange-400",
          className
        )}
      >
        <Share2 className="size-5" />
      </button>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-slate-950/85 backdrop-blur-sm transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[94dvh] flex-col border-t border-slate-800 bg-slate-950 outline-none transition-all duration-150",
            "pb-[env(safe-area-inset-bottom)] data-[ending-style]:translate-y-4 data-[ending-style]:opacity-0 data-[starting-style]:translate-y-4 data-[starting-style]:opacity-0",
            "md:inset-x-0 md:bottom-auto md:top-[6vh] md:mx-auto md:max-h-[88vh] md:w-[min(34rem,calc(100vw-4rem))] md:border md:shadow-2xl md:shadow-black/60"
          )}
        >
          <span aria-hidden className="h-[3px] shrink-0 bg-orange-500" />
          {open && (
            <SharePanel fileName={fileName} caption={caption} title={title} includes={includes} spoiler={spoiler} renderCard={renderCard} video={video} />
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SharePanel({
  fileName,
  caption,
  title,
  includes,
  spoiler,
  renderCard,
  video,
}: {
  fileName: string;
  caption?: string;
  title: string;
  includes?: string[];
  spoiler: boolean | string;
  renderCard: (format: CardFormat) => ReactNode;
  video?: ShareVideo;
}) {
  const [format, setFormat] = useState<ShareFormat>("9:16");
  const [state, setState] = useState<"idle" | "working" | "done" | "failed">("idle");
  const [progress, setProgress] = useState(0);
  const [delivered, setDelivered] = useState<"shared" | "downloaded" | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const share = canShareFiles();
  // Sin WebCodecs (navegadores antiguos) no hay opción de vídeo
  const formats = FORMATS.filter((f) => f.format !== "video" || (video && canEncodeVideoHere()));
  const clip = format === "video" ? video : undefined;
  // El dibujo del vídeo se prepara una vez al elegirlo: vista previa y exportación comparten fuentes y logos
  const videoDraw = useMemo(() => clip?.prepare(), [clip]);
  const frameFormat: CardFormat = format === "video" ? "9:16" : format;

  // Las tarjetas se diseñan con la letra base de 16 px; en móvil la app usa 14 px (globals.css) y la imagen
  // saldría más pequeña. Mientras la ventana está abierta (la página queda tapada) se vuelve a 16 px.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = root.style.fontSize;
    root.style.fontSize = "16px";
    return () => {
      root.style.fontSize = previous;
    };
  }, []);

  // Cerrar la ventana a medio vídeo lo cancela
  useEffect(() => () => abort.current?.abort(), []);

  async function exportCard() {
    if (state === "working") return;
    setState("working");
    setProgress(0);
    try {
      const node = cardRef.current;
      if (!node) throw new Error("Tarjeta no montada");
      await document.fonts.ready;
      await pendingDone(node);
      await imagesReady(node);
      await nextFrame();
      const { width, height } = CARD_SIZE[frameFormat];
      if (clip && videoDraw) {
        const blob = await exportVideo(node, clip, videoDraw, width, height);
        setDelivered(await deliver(blob, `${fileName}-video.mp4`));
      } else {
        const blob = await toBlob(node, {
          width,
          height,
          pixelRatio: 1, // Ya se dibuja a tamaño final
          backgroundColor: "#020617",
          imagePlaceholder: TRANSPARENT_PIXEL,
        });
        if (!blob) throw new Error("No se pudo generar la imagen");
        setDelivered(await deliver(blob, `${fileName}-${frameFormat.replace(":", "x")}.png`));
      }
      setState("done");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error(error);
      setState("failed");
    }
  }

  /** Vídeo: cada fotograma = el dibujo del instante + la franja de la marca de agua (la misma de la vista previa). */
  async function exportVideo(node: HTMLElement, value: ShareVideo, prepared: Promise<VideoDraw>, width: number, height: number): Promise<Blob> {
    const footer = node.querySelector("footer");
    if (!footer) throw new Error("Sin marca de agua");
    const watermarkHeight = WATERMARK_HEIGHT["9:16"];
    const watermark = await toCanvas(footer, {
      width,
      height: watermarkHeight,
      pixelRatio: 1,
      backgroundColor: "#020617",
      imagePlaceholder: TRANSPARENT_PIXEL,
    });
    const [draw, { encodeVideo }] = await Promise.all([prepared, import("@/lib/video-export")]);
    abort.current = new AbortController();
    return encodeVideo({
      width,
      height,
      fps: value.fps,
      duration: value.duration,
      signal: abort.current.signal,
      onProgress: setProgress,
      draw: (ctx, t) => {
        draw(ctx, t);
        ctx.drawImage(watermark, 0, height - watermarkHeight, width, watermarkHeight);
      },
    });
  }

  const shownIncludes = clip ? (clip.includes ?? includes) : includes;
  const working = state === "working";
  const idleNote = clip
    ? `Vídeo MP4 ${CARD_SIZE["9:16"].width}×${CARD_SIZE["9:16"].height} de ${clip.duration} s con la marca de ${BRAND.name}`
    : `Imagen HD ${CARD_SIZE[frameFormat].width}×${CARD_SIZE[frameFormat].height} con la marca de ${BRAND.name}`;
  const buttonLabel = working
    ? clip
      ? `Creando vídeo… ${Math.round(progress * 100)} %`
      : "Generando imagen…"
    : share
      ? "Compartir"
      : clip
        ? "Descargar vídeo"
        : "Descargar imagen";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex items-start gap-3 px-4 pb-3 pt-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-display text-[11px] font-semibold uppercase tracking-[0.25em] text-orange-400">
            {clip ? <Clapperboard className="size-3.5" /> : <ImageIcon className="size-3.5" />}
            {clip ? "Compartir vídeo" : "Compartir imagen"}
          </p>
          <Dialog.Title className="mt-0.5 font-display text-xl font-extrabold uppercase leading-tight text-white">{title}</Dialog.Title>
        </div>
        <Dialog.Close
          aria-label="Cerrar"
          className="flex size-10 shrink-0 items-center justify-center text-slate-400 outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-orange-400"
        >
          <X className="size-5" />
        </Dialog.Close>
      </div>

      {/* Vista previa: la misma tarjeta (o el mismo vídeo, en bucle) que se exporta, a escala */}
      <CardPreview format={frameFormat}>
        <CardFrame ref={cardRef} format={frameFormat} caption={clip ? (clip.caption ?? caption) : caption}>
          {clip && videoDraw ? <VideoPreview draw={videoDraw} duration={clip.duration} paused={working} /> : renderCard(frameFormat)}
        </CardFrame>
      </CardPreview>

      <div className="space-y-3 px-4 pb-4 pt-3">
        {spoiler && (
          <p className="flex items-center gap-2 border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-xs text-orange-200">
            <TriangleAlert className="size-4 shrink-0 text-orange-400" />
            {typeof spoiler === "string"
              ? spoiler
              : clip
                ? "Este vídeo muestra el resultado: quien lo vea se enterará de cómo acabó."
                : "Esta imagen muestra el resultado: quien la vea se enterará de cómo acabó."}
          </p>
        )}
        {shownIncludes && shownIncludes.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label={clip ? "Qué incluye el vídeo" : "Qué incluye la imagen"}>
            {shownIncludes.map((item) => (
              <li key={item} className="flex items-center gap-1 bg-slate-900 px-2 py-1 text-xs text-slate-300">
                <Check className="size-3 text-emerald-400" />
                {item}
              </li>
            ))}
          </ul>
        )}

        <div className={cn("grid border border-slate-800", formats.length > 2 ? "grid-cols-3" : "grid-cols-2")} role="radiogroup" aria-label="Formato">
          {formats.map(({ format: value, label, hint, Icon }, i) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={format === value}
              disabled={working}
              onClick={() => {
                setFormat(value);
                setState("idle");
              }}
              className={cn(
                "flex min-w-0 items-center gap-2 py-2 text-left transition-colors disabled:cursor-wait",
                formats.length > 2 ? "px-2" : "px-3",
                i > 0 && "border-l border-slate-800",
                format === value ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-900 hover:text-white"
              )}
            >
              <Icon className={cn("size-5 shrink-0", format === value && "text-orange-400")} />
              <span className="flex min-w-0 flex-col leading-none">
                <span className="font-display text-base font-extrabold">{label}</span>
                <span className="mt-0.5 truncate text-[10px] uppercase tracking-wider opacity-75">{hint}</span>
              </span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={exportCard}
          disabled={working}
          className="flex w-full items-center justify-center gap-2 bg-orange-500 py-3 font-display text-lg font-extrabold uppercase tracking-wide text-slate-950 transition-colors hover:bg-orange-400 disabled:cursor-wait disabled:opacity-70"
        >
          {working ? <LoaderCircle className="size-5 animate-spin" /> : share ? <Share2 className="size-5" /> : <Download className="size-5" />}
          {buttonLabel}
        </button>
        <p aria-live="polite" className="min-h-4 text-center text-xs">
          {state === "failed" && (
            <span className="text-red-400">{clip ? "No se pudo crear el vídeo. Inténtalo de nuevo." : "No se pudo generar la imagen. Inténtalo de nuevo."}</span>
          )}
          {state === "done" && delivered === "downloaded" && (
            <span className="text-emerald-400">{clip ? "Vídeo descargado (MP4)." : `Imagen descargada (${frameFormat}).`}</span>
          )}
          {state === "idle" && <span className="text-slate-500">{idleNote}</span>}
        </p>
      </div>
    </div>
  );
}

/** El vídeo en bucle dentro de la tarjeta: el mismo dibujo que se codifica, en tiempo real. */
function VideoPreview({ draw, duration, paused }: { draw: Promise<VideoDraw>; duration: number; paused: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d", { alpha: false });
    if (!ctx) return;
    let frame = 0;
    let stopped = false;
    draw.then((paint) => {
      if (stopped) return;
      // Mientras se codifica (o con movimiento reducido), el fotograma final quieto
      if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        paint(ctx, duration);
        return;
      }
      const start = performance.now();
      const loop = (now: number) => {
        paint(ctx, ((now - start) / 1000) % duration);
        frame = requestAnimationFrame(loop);
      };
      frame = requestAnimationFrame(loop);
    }, console.error);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
    };
  }, [draw, duration, paused]);

  const { width, height } = CARD_SIZE["9:16"];
  return <canvas ref={canvasRef} width={width} height={height - WATERMARK_HEIGHT["9:16"]} className="absolute inset-0 size-full" />;
}

/** Encaja la tarjeta (1920×1080 o 1080×1920) en el ancho disponible y en ~la mitad de la altura de la pantalla. */
function CardPreview({ format, children }: { format: CardFormat; children: ReactNode }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 320, height: 480 });
  const { width, height } = CARD_SIZE[format];

  useLayoutEffect(() => {
    const node = boxRef.current;
    if (!node) return;
    // Ancho útil: sin el margen interior del contenedor (si no, la tarjeta se recorta por la derecha)
    const measure = () => {
      const style = getComputedStyle(node);
      const width = node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      setBox({ width, height: window.innerHeight * 0.48 });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const scale = Math.min(box.width / width, box.height / height);
  return (
    <div ref={boxRef} className="flex justify-center bg-slate-900/60 px-4 py-3">
      <div className="overflow-hidden shadow-xl shadow-black/50 ring-1 ring-white/10" style={{ width: width * scale, height: height * scale }}>
        <div style={{ width, height, transform: `scale(${scale})`, transformOrigin: "top left" }}>{children}</div>
      </div>
    </div>
  );
}

function CardFrame({
  ref,
  format,
  caption,
  children,
}: {
  ref: React.Ref<HTMLDivElement>;
  format: CardFormat;
  caption?: string;
  children: ReactNode;
}) {
  const { width, height } = CARD_SIZE[format];
  const vertical = format === "9:16";

  return (
    <div ref={ref} style={{ width, height }} className="flex flex-col overflow-hidden bg-slate-950 font-sans text-white">
      <div className="relative min-h-0 flex-1">{children}</div>
      {/* Marca de agua: siempre presente en todas las tarjetas exportadas */}
      <footer
        style={{ height: WATERMARK_HEIGHT[format] }}
        className={cn("flex shrink-0 items-center justify-between border-t-4 border-orange-500 bg-slate-950", vertical ? "px-16" : "px-20")}
      >
        <span className="flex items-center gap-4 font-display uppercase">
          <LogoMark className={vertical ? "size-16" : "size-14"} />
          {/* El dominio entero, que es lo que hay que teclear */}
          <span className={cn("font-extrabold tracking-wide text-white", vertical ? "text-5xl" : "text-4xl")}>
            {BRAND.lead}
            <span className="text-orange-500">{BRAND.accent}</span>
            <span className="text-slate-400">{BRAND.domain.slice(BRAND.name.length)}</span>
          </span>
        </span>
        {caption && (
          <span className={cn("font-display font-semibold uppercase tracking-[0.25em] text-slate-400", vertical ? "text-xl" : "text-lg")}>
            {caption}
          </span>
        )}
      </footer>
    </div>
  );
}
