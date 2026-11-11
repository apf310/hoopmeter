"use client";

import { useState } from "react";
import Image from "next/image";
import { LoaderCircle, Sparkles } from "lucide-react";
import type { GmTeam, Grade, TradeEvaluation, TradeRequest } from "@/lib/gm";
import { teamLogoUrl } from "@/lib/nba-cdn";
import { cn } from "@/lib/utils";

/** Color de cada nota según su letra: verde lo bueno, rojo lo malo. */
export function gradeClass(grade: Grade): string {
  if (grade.startsWith("A")) return "bg-emerald-400 text-slate-950";
  if (grade.startsWith("B")) return "bg-sky-400 text-slate-950";
  if (grade.startsWith("C")) return "bg-amber-400 text-slate-950";
  return "bg-red-500 text-white";
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
  const [error, setError] = useState<string | null>(null);

  async function evaluate() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/gm/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      onEvaluated(body.evaluation);
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : "No se pudo evaluar el traspaso. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

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
            Evaluar con IA
          </button>
        </>
      )}

      {loading && (
        <div className="mt-3" aria-busy>
          <p className="flex items-center gap-2 text-sm text-slate-300">
            <LoaderCircle className="size-4 animate-spin" />
            Analizando el encaje en pista…
          </p>
          <div className={cn("mt-3 grid gap-px", teams.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2")}>
            {teams.map((team) => (
              <div key={team.id} className="h-40 animate-pulse bg-slate-900" />
            ))}
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      {evaluation && (
        <>
          <p className="mt-2 max-w-3xl text-lg text-slate-100">{evaluation.summary}</p>
          <div className={cn("mt-4 grid gap-6 lg:gap-8", teams.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2")}>
            {evaluation.teams.map(({ teamId, grade, headline, analysis }) => {
              const team = teams.find((t) => t.id === teamId);
              if (!team) return null;
              return (
                <article key={teamId} className="border-t-4 pt-3" style={{ borderColor: team.accent }}>
                  <div className="flex items-center gap-3">
                    <span className={cn("flex size-16 shrink-0 items-center justify-center font-display text-4xl font-extrabold", gradeClass(grade))}>{grade}</span>
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 font-display text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">
                        <Image src={teamLogoUrl(team.id)} alt="" width={20} height={20} unoptimized className="size-5" />
                        {team.abbreviation}
                      </p>
                      <h3 className="font-display text-2xl font-bold uppercase leading-tight text-white">{headline}</h3>
                    </div>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-slate-200">{analysis}</p>
                </article>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-slate-400">Análisis generado por IA a partir de los datos de la app: puede equivocarse.</p>
        </>
      )}
    </section>
  );
}
