// Modo diferido (Tarea 6.13): la invitación en Niveles 1 y 2 y la barra para decir por dónde vas.
import type { ReactNode } from "react";
import { History, LoaderCircle, Minus, Plus, X } from "lucide-react";
import { Eyebrow, Segmented } from "@/components/games/detail/ui";
import {
  MAX_PERIOD,
  periodStartPosition,
  positionLabel,
  samePosition,
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
  const label = positionLabel(position, regulation);

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
      <p className="mt-3 text-xs text-slate-400">Solo lo ocurrido hasta aquí: ni la nota ni nada de lo que viene después.</p>
    </section>
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
