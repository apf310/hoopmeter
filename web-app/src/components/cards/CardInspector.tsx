"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { LoaderCircle, Repeat2, Rotate3d, X } from "lucide-react";
import { SEAL_LABEL, type CardSpec } from "@/lib/player-card";
import { cn } from "@/lib/utils";

type Stage = typeof import("./card-stage");
type Model = typeof import("./card-model");

// El 3D (Three.js) solo se descarga al tocar la carta; empieza a bajar al pasar el ratón o al empezar a pulsar
let stageModule: Promise<Stage> | null = null;
const loadStage = () => (stageModule ??= import("./card-stage"));

/**
 * Inspector de la carta (Tarea 7.11): al tocarla, a pantalla completa y en 3D de verdad (canto y grosor), con giro de
 * 360° arrastrando y el reverso (radar, temporadas y palmarés) con un toque. WebGL solo aquí; sin él, frente y reverso
 * en plano. Nada de lo que enseña depende de un partido: se abre igual en los tres niveles.
 */
export function CardInspector({ spec, children }: { spec: CardSpec; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const label = `Ver la carta de ${spec.name} en 3D`;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <div className="relative">
        {/* La carta es un bloque (no cabe en un <button>): botón por rol, con Intro y espacio */}
        <div
          role="button"
          tabIndex={0}
          aria-label={label}
          onClick={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            setOpen(true);
          }}
          onPointerEnter={() => void loadStage()}
          onPointerDown={() => void loadStage()}
          className="block w-full cursor-zoom-in outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
        >
          {children}
        </div>
        {/* Para que se sepa que se puede abrir: el mismo gesto, en pequeño */}
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          title="Ver en 3D"
          onClick={() => setOpen(true)}
          onPointerEnter={() => void loadStage()}
          className="absolute -right-3 bottom-[18%] flex size-8 items-center justify-center bg-slate-950 text-white ring-1 ring-white/25 transition-colors hover:bg-orange-500 hover:text-slate-950"
        >
          <Rotate3d className="size-5" />
        </button>
      </div>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-slate-950 transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="fixed inset-0 z-50 flex flex-col bg-slate-950 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] outline-none transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0">
          {open && <InspectorBody spec={spec}>{children}</InspectorBody>}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function InspectorBody({ spec, children }: { spec: CardSpec; children: ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<{ flip: () => void } | null>(null);
  const [mode, setMode] = useState<"loading" | "3d" | "flat" | "failed">("loading");
  const [face, setFace] = useState<"front" | "back">("front");
  const [back, setBack] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let destroy: (() => void) | null = null;
    loadStage()
      .then(async (stage) => {
        if (!stage.hasWebGL()) {
          const model: Model = await import("./card-model");
          await import("./card-kit").then((kit) => kit.loadCardFonts());
          if (!alive) return;
          setBack(model.drawBack(spec, spec.huella).toDataURL("image/png"));
          setMode("flat");
          return;
        }
        const card = await stage.prepareCard(spec);
        if (!alive || !host.current) return;
        const created = stage.createCardViewer(host.current, card, spec, { onFace: (f) => alive && setFace(f) });
        viewer.current = created;
        destroy = created.destroy;
        setMode("3d");
      })
      .catch((error) => {
        console.error(error);
        if (alive) setMode("failed");
      });
    return () => {
      alive = false;
      destroy?.();
      viewer.current = null;
    };
  }, [spec]);

  const flip = () => (mode === "3d" ? viewer.current?.flip() : setFace((f) => (f === "front" ? "back" : "front")));
  const seals = spec.seals.map((s) => SEAL_LABEL[s.kind]);
  const media = spec.overall === undefined ? spec.line : spec.overall === null ? "Aún sin media esta temporada" : `Media ${spec.overall} · ${spec.line}`;

  return (
    <>
      <div className="flex shrink-0 items-start gap-3 border-b border-slate-800 px-4 py-3 md:px-8">
        <div className="min-w-0 flex-1">
          <p className="font-display text-[11px] font-semibold uppercase tracking-[0.25em] text-orange-400">Carta Hoopmeter</p>
          <Dialog.Title className="truncate font-display text-2xl font-extrabold uppercase leading-tight text-white">{spec.name}</Dialog.Title>
          <Dialog.Description className="truncate text-xs text-slate-400">
            {media}
            {seals.length > 0 && ` · Sellos: ${seals.join(", ")}`}
          </Dialog.Description>
        </div>
        <Dialog.Close
          aria-label="Cerrar"
          className="flex size-11.5 shrink-0 items-center justify-center text-slate-300 outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-orange-400 md:size-10"
        >
          <X className="size-6" />
        </Dialog.Close>
      </div>

      <div ref={host} className="relative min-h-0 flex-1 select-none">
        {mode === "loading" && (
          <p className="absolute inset-0 flex items-center justify-center gap-2 font-display text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
            <LoaderCircle className="size-5 animate-spin text-orange-400" aria-hidden />
            Preparando la carta…
          </p>
        )}
        {mode === "failed" && <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-slate-400">No se pudo abrir la carta en 3D en este dispositivo.</p>}
        {mode === "flat" && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="aspect-[5/7] h-full max-h-[34rem] max-w-full">
              {/* eslint-disable-next-line @next/next/no-img-element -- reverso dibujado en canvas (data URL) */}
              {face === "front" ? children : back && <img src={back} alt="" className="size-full object-contain" />}
            </div>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-800 px-4 py-3 md:px-8">
        <p className="text-xs text-slate-400">{mode === "3d" ? "Arrastra para girarla · tócala para darle la vuelta" : "Su reverso lleva su radar, sus temporadas y su palmarés"}</p>
        <button
          type="button"
          onClick={flip}
          disabled={mode === "loading" || mode === "failed"}
          className={cn(
            "flex shrink-0 items-center gap-2 bg-orange-500 px-4 py-2.5 font-display text-base font-extrabold uppercase tracking-wide text-slate-950 transition-colors hover:bg-orange-400 disabled:opacity-50"
          )}
        >
          <Repeat2 className="size-5" aria-hidden />
          {face === "front" ? "Ver el reverso" : "Ver el frente"}
        </button>
      </div>
    </>
  );
}
