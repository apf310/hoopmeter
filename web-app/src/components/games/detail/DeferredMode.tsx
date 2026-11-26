// Modo diferido (Tarea 6.13): la invitación en Niveles 1 y 2 y la barra para decir por dónde vas.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { History, LoaderCircle, Minus, Plus, X } from "lucide-react";
import { Eyebrow, Segmented } from "@/components/games/detail/ui";
import {
  clockLabel,
  elapsedInPeriod,
  MAX_PERIOD,
  periodLength,
  periodStartPosition,
  positionAt,
  positionLabel,
  samePosition,
  SLIDER_STEP_S,
  stepPosition,
  type DeferredPosition,
} from "@/lib/deferred-position";
import { periodChip, periodName } from "@/lib/game-format";
import { cn } from "@/lib/utils";

/** Niveles 1 y 2, partido ya empezado según la hora: entrar en el diferido. */
export function DeferredInvite({ onStart }: { onStart: () => void }) {
  return (
    <section className="flex flex-col gap-4 border-b border-slate-800 px-4 py-6 sm:flex-row sm:items-center md:px-8">
      <span className="hidden size-11 shrink-0 items-center justify-center rounded-full bg-slate-900 ring-1 ring-slate-700 sm:flex">
        <History className="size-5 text-orange-400" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-xl font-extrabold uppercase text-white">¿Lo estás viendo grabado?</h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-300">
          Dinos por dónde vas y te enseñamos marcador, boxscore, tiros y jugadas solo hasta ese momento. Sin nota ni nada de lo que
          viene después.
        </p>
      </div>
      <button
        type="button"
        onClick={onStart}
        className="inline-flex shrink-0 items-center justify-center gap-2 bg-orange-500 px-4 py-2.5 font-display text-sm font-bold uppercase tracking-wider text-slate-950 outline-none transition-colors hover:bg-orange-400 focus-visible:ring-2 focus-visible:ring-orange-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
      >
        <History className="size-4" />
        Lo veo en diferido
      </button>
    </section>
  );
}

type DeferredBarProps = {
  position: DeferredPosition;
  regulation: number;
  /** Llega la ficha del nuevo instante (mientras, se sigue viendo la anterior). */
  loading: boolean;
  onChange: (position: DeferredPosition) => void;
  onExit: () => void;
};

/** Cuarto y minuto por los que va el usuario. La prórroga siempre se ofrece: no delata si la hubo. */
export function DeferredBar({ position, regulation, loading, onChange, onExit }: DeferredBarProps) {
  const lastChip = Math.min(MAX_PERIOD, Math.max(regulation + 1, position.period + 1));
  const back = stepPosition(position, -1, regulation);
  const forward = stepPosition(position, 1, regulation);
  // Mientras se arrastra la barra (Tarea 7.9) solo cambia el texto; la ficha se pide al soltarla. Si entre medias la
  // posición cambia por otro lado (±1 min), lo arrastrado deja de valer
  const [dragging, setDragging] = useState<{ from: DeferredPosition; to: DeferredPosition } | null>(null);
  const shown = dragging && samePosition(dragging.from, position) ? dragging.to : position;
  const label = positionLabel(shown, regulation);

  return (
    <section aria-label="Modo diferido" className="border-b border-slate-800 bg-slate-900/50 px-4 py-4 md:px-8">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <Eyebrow className="flex items-center gap-1.5 text-orange-400">
            <History className="size-3.5" />
            En diferido · vas por
          </Eyebrow>
          <p aria-live="polite" className="mt-1 flex items-center gap-2 font-display text-2xl font-extrabold uppercase leading-none text-white md:text-3xl">
            {label}
            {loading && <LoaderCircle aria-label="Cargando" className="size-4 animate-spin text-slate-400 motion-reduce:animate-none" />}
          </p>
        </div>
        <button
          type="button"
          onClick={onExit}
          className="inline-flex shrink-0 items-center gap-1 py-1 font-display text-sm font-bold uppercase tracking-wider text-slate-300 outline-none transition-colors hover:text-white focus-visible:text-orange-300"
        >
          <X className="size-4" />
          Salir
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Segmented
          label="Periodo"
          value={position.period}
          // Tocar el periodo en el que ya estás no te devuelve a su inicio
          onChange={(period) => period !== position.period && onChange(periodStartPosition(period, regulation))}
          options={Array.from({ length: lastChip }, (_, i) => ({
            value: i + 1,
            label: periodChip(i + 1, regulation),
            title: periodName(i + 1, regulation),
          }))}
        />
        <div className="flex border border-slate-700">
          <StepButton label="Retroceder un minuto" disabled={samePosition(back, position)} onClick={() => onChange(back)}>
            <Minus className="size-3.5" />1 min
          </StepButton>
          <StepButton
            label="Avanzar un minuto"
            disabled={samePosition(forward, position)}
            onClick={() => onChange(forward)}
            className="border-l border-slate-700"
          >
            <Plus className="size-3.5" />1 min
          </StepButton>
        </div>
      </div>
      <PeriodSlider
        position={position}
        shown={shown}
        regulation={regulation}
        onDrag={(to) => setDragging({ from: position, to })}
        onCommit={(to) => {
          setDragging(null);
          if (!samePosition(to, position)) onChange(to);
        }}
      />
      <p className="mt-3 text-xs text-slate-400">Solo lo ocurrido hasta aquí: ni la nota ni nada de lo que viene después.</p>
    </section>
  );
}

/**
 * Barra deslizante del periodo (Tarea 7.9): de su inicio (12:00, o 5:00 en la prórroga) a su final, de minuto en minuto.
 * El `input` de React avisa en cada paso; el `change` nativo, al soltar (o con cada tecla), y solo entonces se pide la ficha.
 */
function PeriodSlider({
  position,
  shown,
  regulation,
  onDrag,
  onCommit,
}: {
  position: DeferredPosition;
  shown: DeferredPosition;
  regulation: number;
  onDrag: (to: DeferredPosition) => void;
  onCommit: (to: DeferredPosition) => void;
}) {
  const slider = useRef<HTMLInputElement>(null);
  const { period } = position;
  const length = periodLength(period, regulation);
  const elapsed = elapsedInPeriod(shown, regulation);

  useEffect(() => {
    const input = slider.current;
    if (!input) return;
    const commit = () => onCommit(positionAt(period, Number(input.value), regulation));
    input.addEventListener("change", commit);
    return () => input.removeEventListener("change", commit);
  }, [period, regulation, onCommit]);

  return (
    <div className="mt-3">
      <input
        ref={slider}
        type="range"
        min={0}
        max={length}
        step={SLIDER_STEP_S}
        value={elapsed}
        onChange={(event) => onDrag(positionAt(period, Number(event.target.value), regulation))}
        aria-label="Minuto del periodo"
        aria-valuetext={positionLabel(shown, regulation)}
        className="deferred-range block w-full"
        style={{ "--fill": elapsed / length } as CSSProperties}
      />
      {/* Una marca por minuto, alineadas con el centro del tirador (14 px de ancho) */}
      <div aria-hidden className="flex justify-between px-[7px]">
        {Array.from({ length: length / SLIDER_STEP_S + 1 }, (_, i) => (
          <span key={i} className={cn("h-1.5 w-px", i * SLIDER_STEP_S <= elapsed ? "bg-orange-400" : "bg-slate-600")} />
        ))}
      </div>
      <div aria-hidden className="mt-1 flex justify-between font-display text-[11px] font-semibold uppercase tracking-wider text-slate-400 tabular-nums">
        <span>{clockLabel(length)}</span>
        <span>{clockLabel(length / 2)}</span>
        <span>{clockLabel(0)}</span>
      </div>
    </div>
  );
}

function StepButton({
  label,
  disabled,
  onClick,
  className,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 px-3 py-1.5 font-display text-sm font-bold uppercase tracking-wide text-slate-200 outline-none transition-colors hover:bg-slate-900 hover:text-white focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-400 disabled:text-slate-600 disabled:hover:bg-transparent",
        className
      )}
    >
      {children}
    </button>
  );
}
