"use client";

import { useState } from "react";
import Image from "next/image";
import { Check, Circle, LoaderCircle, Sparkles } from "lucide-react";
import type { GmTeam, Grade, TradeEvaluation, TradeRequest } from "@/lib/gm";
import { teamLogoUrl } from "@/lib/nba-cdn";
import { EVALUATION_STEPS, splitLines, type EvaluationEvent, type EvaluationStep, type PartialEvaluation, type PartialTeamEvaluation } from "@/lib/trade-evaluation-stream";
import { cn } from "@/lib/utils";

/** Color de cada nota según su letra: verde lo bueno, rojo lo malo. */
export function gradeClass(grade: Grade): string {
  if (grade.startsWith("A")) return "bg-emerald-400 text-slate-950";
  if (grade.startsWith("B")) return "bg-sky-400 text-slate-950";
  if (grade.startsWith("C")) return "bg-amber-400 text-slate-950";
  return "bg-red-500 text-white";
}

const STEP_LABEL: Record<EvaluationStep, string> = {
  convenio: "Traspaso validado con el convenio",
  datos: "Plantillas, contratos y estadísticas de hoy",
  modelo: "Estudiando el encaje en pista",
  escritura: "Escribiendo el análisis de cada equipo",
};

const GENERIC_ERROR = "No se pudo evaluar el traspaso. Inténtalo de nuevo.";

/** Lee la respuesta por partes de `/api/gm/evaluate` (NDJSON) y avisa de cada evento. */
async function readEvents(response: Response, onEvent: (event: EvaluationEvent<TradeEvaluation>) => void) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const { lines, rest } = splitLines(done ? `${buffer}\n` : buffer);
    buffer = rest;
    lines.forEach((line) => onEvent(JSON.parse(line)));
    if (done) return;
  }
}

function TeamEvaluation({ team, entry }: { team: GmTeam; entry: Partial<PartialTeamEvaluation> }) {
  const grade = entry.grade as Grade | undefined;
  const writing = !grade;
  return (
    <article className="border-t-4 pt-3" style={{ borderColor: team.accent }}>
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-16 shrink-0 items-center justify-center font-display text-4xl font-extrabold",
            grade ? gradeClass(grade) : "animate-pulse bg-slate-800 text-slate-500",
          )}
        >
          {grade ?? "?"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-display text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">
            <Image src={teamLogoUrl(team.id)} alt="" width={20} height={20} unoptimized className="size-5" />
            {team.abbreviation}
          </p>
          {entry.headline ? (
            <h3 className="font-display text-2xl font-bold uppercase leading-tight text-white">{entry.headline}</h3>
          ) : (
            <div className="mt-1 h-6 w-3/4 animate-pulse bg-slate-800" />
          )}
        </div>
      </div>
      {entry.analysis ? (
        <p className="mt-2 text-sm leading-relaxed text-slate-200">
          {entry.analysis}
          {writing && <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-orange-400 align-middle" aria-hidden />}
        </p>
      ) : (
        <div className="mt-3 space-y-2" aria-hidden>
          <div className="h-3 animate-pulse bg-slate-800" />
          <div className="h-3 animate-pulse bg-slate-800" />
          <div className="h-3 w-2/3 animate-pulse bg-slate-800" />
        </div>
      )}
    </article>
  );
}

/** Evaluación del traspaso con IA: nota de A+ a F y encaje táctico para cada equipo. */
export function TradeEvaluationCard({
  teams,
  request,
  evaluation,
  disabled,
  onEvaluated,
}: {
  teams: GmTeam[];
  request: TradeRequest;
  evaluation: TradeEvaluation | null;
  /** Un traspaso ilegal no se evalúa: no gasta cuota de IA. */
  disabled: boolean;
  onEvaluated: (evaluation: TradeEvaluation) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<EvaluationStep>("convenio");
  const [partial, setPartial] = useState<PartialEvaluation | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function evaluate() {
    setLoading(true);
    setStep("convenio");
    setPartial(null);
    setError(null);
    try {
      const response = await fetch("/api/gm/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error);
      }
      let finished = false;
      await readEvents(response, (event) => {
        if (event.type === "step") {
          setStep(event.step);
          // Si un modelo falla a medias, el siguiente empieza de cero
          if (event.step === "modelo") setPartial(null);
        } else if (event.type === "partial") setPartial(event.evaluation);
        else if (event.type === "error") throw new Error(event.error);
        else {
          finished = true;
          onEvaluated(event.evaluation);
        }
      });
      if (!finished) throw new Error();
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : GENERIC_ERROR);
    } finally {
      setLoading(false);
    }
  }

  const gridClass = cn("mt-4 grid gap-6 lg:gap-8", teams.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2");
  const currentStep = EVALUATION_STEPS.indexOf(step);

  return (
    <section className="border-t border-slate-800 px-4 py-6 md:px-8" aria-labelledby="evaluacion-ia">
      <p className="font-display text-xs font-semibold uppercase tracking-[0.25em] text-orange-400">Sala de análisis</p>
      <h2 id="evaluacion-ia" className="font-display text-4xl font-extrabold uppercase leading-none text-white">
        Nota del traspaso
      </h2>

      {!evaluation && !loading && (
        <>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            {disabled ? "Primero tiene que cumplir el convenio: ajusta el traspaso para poder evaluarlo." : "La IA puntúa de A+ a F a cada equipo y explica cómo encaja el traspaso en pista."}
          </p>
          <button
            type="button"
            onClick={evaluate}
            disabled={disabled}
            className="mt-3 flex items-center gap-2 bg-orange-500 px-5 py-2.5 font-display text-lg font-extrabold uppercase tracking-wide text-slate-950 transition-colors hover:bg-orange-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-400"
          >
            <Sparkles className="size-5" />
            {error ? "Volver a intentarlo" : "Evaluar con IA"}
          </button>
        </>
      )}

      {loading && (
        <div className="mt-3" aria-busy>
          {/* Móvil: tramos y el paso en curso; escritorio: todos los pasos con su estado */}
          <div className="flex max-w-md gap-1 md:hidden" aria-hidden>
            {EVALUATION_STEPS.map((name, index) => (
              <span key={name} className={cn("h-1 flex-1", index < currentStep ? "bg-emerald-400" : index === currentStep ? "animate-pulse bg-orange-400" : "bg-slate-800")} />
            ))}
          </div>
          <ol className="mt-2 flex flex-wrap gap-x-6 gap-y-1.5 text-sm md:mt-0" aria-live="polite">
            {EVALUATION_STEPS.map((name, index) => {
              const done = index < currentStep;
              const current = index === currentStep;
              return (
                <li
                  key={name}
                  className={cn("items-center gap-2", current ? "flex text-white" : "hidden md:flex", done ? "text-slate-400" : !current && "text-slate-600")}
                  aria-current={current ? "step" : undefined}
                >
                  {done ? (
                    <Check className="size-4 shrink-0 text-emerald-400" />
                  ) : current ? (
                    <LoaderCircle className="size-4 shrink-0 animate-spin text-orange-400" />
                  ) : (
                    <Circle className="size-4 shrink-0" />
                  )}
                  {STEP_LABEL[name]}
                  {current && <span className="text-slate-400 md:hidden">· {index + 1} de {EVALUATION_STEPS.length}</span>}
                </li>
              );
            })}
          </ol>
          {partial?.summary ? (
            <p className="mt-4 max-w-3xl text-lg text-slate-100">{partial.summary}</p>
          ) : (
            <div className="mt-4 max-w-3xl space-y-2" aria-hidden>
              <div className="h-4 animate-pulse bg-slate-900" />
              <div className="h-4 w-1/2 animate-pulse bg-slate-900" />
            </div>
          )}
          <div className={gridClass}>
            {teams.map((team) => (
              <TeamEvaluation key={team.id} team={team} entry={partial?.teams.find((entry) => entry.teamId === team.id) ?? {}} />
            ))}
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      {evaluation && (
        <>
          <p className="mt-2 max-w-3xl text-lg text-slate-100">{evaluation.summary}</p>
          <div className={gridClass}>
            {evaluation.teams.map((entry) => {
              const team = teams.find((t) => t.id === entry.teamId);
              return team ? <TeamEvaluation key={entry.teamId} team={team} entry={entry} /> : null;
            })}
          </div>
          <p className="mt-4 text-xs text-slate-400">Análisis generado por IA a partir de los datos de la app: puede equivocarse.</p>
        </>
      )}
    </section>
  );
}
