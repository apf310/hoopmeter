"use client";

import { useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { toBlob } from "html-to-image";
import { LoaderCircle, RectangleHorizontal, RectangleVertical } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

export type CardFormat = "16:9" | "9:16";

export const CARD_SIZE: Record<CardFormat, { width: number; height: number }> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
};

/** Alto de la franja inferior con la marca de agua; la tarjeta ocupa el resto. */
export const WATERMARK_HEIGHT: Record<CardFormat, number> = { "16:9": 84, "9:16": 112 };

const FORMATS: { format: CardFormat; label: string; hint: string; Icon: typeof RectangleHorizontal }[] = [
  { format: "16:9", label: "16:9", hint: "X / YouTube", Icon: RectangleHorizontal },
  { format: "9:16", label: "9:16", hint: "Stories / TikTok", Icon: RectangleVertical },
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

/** En móvil (y en la app de Capacitor) se abre el menú nativo de compartir; en escritorio, descarga directa. */
async function deliver(blob: Blob, fileName: string) {
  const file = new File([blob], fileName, { type: "image/png" });
  const touch = window.matchMedia("(pointer: coarse)").matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), { href: url, download: fileName });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Modo Creador: exporta en 1 clic una tarjeta HD (16:9 o 9:16) con la marca de agua de la app.
 * La tarjeta solo se monta (fuera de pantalla y a tamaño real) mientras se genera la imagen.
 */
export function SocialCardExporter({
  fileName,
  caption,
  renderCard,
  className,
}: {
  /** Nombre base del archivo, sin formato ni extensión (p. ej. "lebron-james"). */
  fileName: string;
  /** Texto a la derecha de la marca de agua (p. ej. "Ficha de jugador · 2025-26"). */
  caption?: string;
  renderCard: (format: CardFormat) => ReactNode;
  className?: string;
}) {
  const [pending, setPending] = useState<CardFormat | null>(null);
  const [failed, setFailed] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  async function exportAs(format: CardFormat) {
    if (pending) return;
    setFailed(false);
    flushSync(() => setPending(format));
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
      await deliver(blob, `${fileName}-${format.replace(":", "x")}.png`);
    } catch (error) {
      console.error(error);
      setFailed(true);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className={className}>
      <p className="font-display text-[11px] font-semibold uppercase tracking-[0.25em] text-white/70">Exportar imagen para redes</p>
      <div className="mt-2 flex w-fit border border-white/25 bg-slate-950/60">
        {FORMATS.map(({ format, label, hint, Icon }, i) => (
          <button
            key={format}
            type="button"
            onClick={() => exportAs(format)}
            disabled={pending !== null}
            aria-label={`Descargar imagen ${label} para ${hint}`}
            className={cn(
              "flex items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-orange-500 hover:text-slate-950 disabled:cursor-wait disabled:opacity-60",
              i > 0 && "border-l border-white/25"
            )}
          >
            {pending === format ? <LoaderCircle className="size-5 animate-spin" /> : <Icon className="size-5" />}
            <span className="flex flex-col leading-none">
              <span className="font-display text-base font-extrabold">{label}</span>
              <span className="text-[10px] uppercase tracking-wider opacity-75">{hint}</span>
            </span>
          </button>
        ))}
      </div>
      {failed && <p className="mt-2 text-xs text-red-400">No se pudo generar la imagen. Inténtalo de nuevo.</p>}

      {pending && (
        // Fuera de pantalla pero renderizada (con display:none la captura saldría vacía)
        <div className="pointer-events-none fixed left-[-20000px] top-0" aria-hidden>
          <CardFrame ref={cardRef} format={pending} caption={caption}>
            {renderCard(pending)}
          </CardFrame>
        </div>
      )}
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
        <span className="flex items-baseline gap-4 font-display uppercase">
          <span className={cn("font-semibold tracking-[0.3em] text-slate-400", vertical ? "text-2xl" : "text-xl")}>Creado en</span>
          <span className={cn("font-extrabold tracking-wide text-white", vertical ? "text-5xl" : "text-4xl")}>
            {BRAND.lead} <span className="text-orange-500">{BRAND.accent}</span>
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
