"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { toBlob } from "html-to-image";
import { Check, Download, ImageIcon, LoaderCircle, RectangleHorizontal, RectangleVertical, Share2, TriangleAlert, X } from "lucide-react";
import { LogoMark } from "@/components/layout/LogoMark";
import { BRAND } from "@/lib/brand";
import { isNativeApp, shareImageNatively } from "@/lib/native";
import { cn } from "@/lib/utils";

export type CardFormat = "16:9" | "9:16";

export const CARD_SIZE: Record<CardFormat, { width: number; height: number }> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
};

/** Alto de la franja inferior con la marca de agua; la tarjeta ocupa el resto. */
export const WATERMARK_HEIGHT: Record<CardFormat, number> = { "16:9": 84, "9:16": 112 };

const FORMATS: { format: CardFormat; label: string; hint: string; Icon: typeof RectangleHorizontal }[] = [
  { format: "9:16", label: "9:16", hint: "Stories / TikTok", Icon: RectangleVertical },
  { format: "16:9", label: "16:9", hint: "X / YouTube", Icon: RectangleHorizontal },
];

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

/** En móvil y en la app nativa se abre el menú de compartir del sistema; en escritorio, descarga directa. */
async function deliver(blob: Blob, fileName: string): Promise<"shared" | "downloaded"> {
  if (isNativeApp()) {
    await shareImageNatively(blob, fileName);
    return "shared";
  }
  const file = new File([blob], fileName, { type: "image/png" });
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
          "inline-flex size-10 items-center justify-center border border-white/25 bg-slate-950/60 text-white outline-none transition-colors hover:border-orange-500 hover:bg-orange-500 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-orange-400",
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
          {open && <SharePanel fileName={fileName} caption={caption} title={title} includes={includes} spoiler={spoiler} renderCard={renderCard} />}
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
}: {
  fileName: string;
  caption?: string;
  title: string;
  includes?: string[];
  spoiler: boolean | string;
  renderCard: (format: CardFormat) => ReactNode;
}) {
  const [format, setFormat] = useState<CardFormat>("9:16");
  const [state, setState] = useState<"idle" | "working" | "done" | "failed">("idle");
  const [delivered, setDelivered] = useState<"shared" | "downloaded" | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const share = canShareFiles();

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

  async function exportCard() {
    if (state === "working") return;
    setState("working");
    try {
      const node = cardRef.current;
      if (!node) throw new Error("Tarjeta no montada");
      await document.fonts.ready;
      await imagesReady(node);
      await nextFrame();
      const { width, height } = CARD_SIZE[format];
      const blob = await toBlob(node, {
        width,
        height,
        pixelRatio: 1, // Ya se dibuja a tamaño final
        backgroundColor: "#020617",
        imagePlaceholder: TRANSPARENT_PIXEL,
      });
      if (!blob) throw new Error("No se pudo generar la imagen");
      setDelivered(await deliver(blob, `${fileName}-${format.replace(":", "x")}.png`));
      setState("done");
    } catch (error) {
      console.error(error);
      setState("failed");
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex items-start gap-3 px-4 pb-3 pt-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-display text-[11px] font-semibold uppercase tracking-[0.25em] text-orange-400">
            <ImageIcon className="size-3.5" />
            Compartir imagen
          </p>
          <Dialog.Title className="mt-0.5 font-display text-xl font-extrabold uppercase leading-tight text-white">{title}</Dialog.Title>
        </div>
        <Dialog.Close
          aria-label="Cerrar"
          className="flex size-9 shrink-0 items-center justify-center text-slate-400 outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-orange-400"
        >
          <X className="size-5" />
        </Dialog.Close>
      </div>

      {/* Vista previa: la misma tarjeta que se exporta, a escala */}
      <CardPreview format={format}>
        <CardFrame ref={cardRef} format={format} caption={caption}>
          {renderCard(format)}
        </CardFrame>
      </CardPreview>

      <div className="space-y-3 px-4 pb-4 pt-3">
        {spoiler && (
          <p className="flex items-center gap-2 border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-xs text-orange-200">
            <TriangleAlert className="size-4 shrink-0 text-orange-400" />
            {typeof spoiler === "string" ? spoiler : "Esta imagen muestra el resultado: quien la vea se enterará de cómo acabó."}
          </p>
        )}
        {includes && includes.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Qué incluye la imagen">
            {includes.map((item) => (
              <li key={item} className="flex items-center gap-1 bg-slate-900 px-2 py-1 text-xs text-slate-300">
                <Check className="size-3 text-emerald-400" />
                {item}
              </li>
            ))}
          </ul>
        )}

        <div className="grid grid-cols-2 border border-slate-800" role="radiogroup" aria-label="Formato">
          {FORMATS.map(({ format: value, label, hint, Icon }, i) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={format === value}
              onClick={() => {
                setFormat(value);
                setState("idle");
              }}
              className={cn(
                "flex items-center gap-2 px-3 py-2 text-left transition-colors",
                i > 0 && "border-l border-slate-800",
                format === value ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-900 hover:text-white"
              )}
            >
              <Icon className={cn("size-5 shrink-0", format === value && "text-orange-400")} />
              <span className="flex flex-col leading-none">
                <span className="font-display text-base font-extrabold">{label}</span>
                <span className="mt-0.5 text-[10px] uppercase tracking-wider opacity-75">{hint}</span>
              </span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={exportCard}
          disabled={state === "working"}
          className="flex w-full items-center justify-center gap-2 bg-orange-500 py-3 font-display text-lg font-extrabold uppercase tracking-wide text-slate-950 transition-colors hover:bg-orange-400 disabled:cursor-wait disabled:opacity-70"
        >
          {state === "working" ? <LoaderCircle className="size-5 animate-spin" /> : share ? <Share2 className="size-5" /> : <Download className="size-5" />}
          {state === "working" ? "Generando imagen…" : share ? "Compartir" : "Descargar imagen"}
        </button>
        <p aria-live="polite" className="min-h-4 text-center text-xs">
          {state === "failed" && <span className="text-red-400">No se pudo generar la imagen. Inténtalo de nuevo.</span>}
          {state === "done" && delivered === "downloaded" && <span className="text-emerald-400">Imagen descargada ({format}).</span>}
          {state === "idle" && <span className="text-slate-500">Imagen HD {CARD_SIZE[format].width}×{CARD_SIZE[format].height} con la marca de {BRAND.name}</span>}
        </p>
      </div>
    </div>
  );
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
          <span className={cn("font-semibold tracking-[0.3em] text-slate-400", vertical ? "text-2xl" : "text-xl")}>Creado en</span>
          <LogoMark className={vertical ? "size-14" : "size-12"} />
          <span className={cn("font-extrabold tracking-wide text-white", vertical ? "text-5xl" : "text-4xl")}>
            {BRAND.lead}
            <span className="text-orange-500">{BRAND.accent}</span>
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
