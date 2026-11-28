"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { eloOf } from "@/lib/elo";
import { divisionOf, type ChallengeId } from "@/lib/games";
import { useGamesProgress } from "@/lib/games-store";
import { cn } from "@/lib/utils";
import { DIVISION_COLORS, DivisionEmblem } from "./DivisionEmblem";

/** Lo que se espera al par del día antes de enseñar el cambio (si no llega, se calcula con el de siempre). */
const PAR_WAIT_MS = 2_500;

export const formatElo = (n: number) => n.toLocaleString("es-ES");

/** "▲ +12", "▼ −4" (con el signo menos de verdad) o "= 0". */
export const signedElo = (delta: number) => (delta > 0 ? `▲ +${delta}` : delta < 0 ? `▼ −${Math.abs(delta)}` : "= 0");

export const deltaTone = (delta: number) => (delta > 0 ? "text-emerald-400" : delta < 0 ? "text-red-400" : "text-slate-400");

/**
 * Al acabar un reto: lo que ha subido o bajado tu ELO con él, tu ELO y tu división (con "¡Subes a All-Star!" si cambia).
 * Sale de los resultados del dispositivo (`elo.ts`), así que es lo mismo que se ve en `/juegos`. Lleva a `/juegos`.
 */
export function EloChange({ day, game }: { day: string; game: ChallengeId }) {
  const progress = useGamesProgress();
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), PAR_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);
  const state = useMemo(() => (progress ? eloOf(progress.results) : null), [progress]);
  const result = progress?.results.find((r) => r.day === day && r.game === game);
  const entry = state?.entries.find((e) => e.day === day && e.game === game);
  // Hasta saber el par del día (un instante), el hueco: así la cifra no cambia delante de quien la mira
  const ready = !!entry && !!result && (result.par !== undefined || waited);

  const division = entry ? divisionOf(entry.elo) : null;
  const before = entry ? divisionOf(entry.elo - entry.delta) : null;
  const moved = division && before && division.rank !== before.rank ? (division.rank > before.rank ? "up" : "down") : null;

  return (
    <Link
      href="/juegos"
      aria-label={ready && entry ? `Tu ELO: ${formatElo(entry.elo)}, ${signedElo(entry.delta)} con este reto. Ver Juegos` : "Ver Juegos"}
      className="relative flex min-h-18 items-center gap-3 border-t border-slate-800 px-4 py-3 outline-none transition-colors hover:bg-slate-900/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-400 md:px-8"
    >
      {ready && entry && division ? (
        <>
          <DivisionEmblem id={division.division.id} rank={division.rank} className="w-10 animate-in zoom-in-75 fade-in duration-500 motion-reduce:animate-none" />
          <div className="min-w-0 flex-1">
            <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Tu ELO</p>
            <p className="flex flex-wrap items-baseline gap-x-2 font-display uppercase">
              <span className="text-3xl font-extrabold leading-none text-white tabular-nums">{formatElo(entry.elo)}</span>
              <span className={cn("text-xl font-extrabold tabular-nums animate-in slide-in-from-bottom-2 fade-in duration-500 motion-reduce:animate-none", deltaTone(entry.delta))}>
                {signedElo(entry.delta)}
              </span>
            </p>
          </div>
          <p className="min-w-0 max-w-[45%] text-right font-display text-sm font-bold uppercase leading-tight tracking-wide">
            {moved === "up" ? (
              <span className="text-emerald-400">¡Subes a {division.division.name}!</span>
            ) : moved === "down" ? (
              <span className="text-red-400">Bajas a {division.division.name}</span>
            ) : (
              <span className={DIVISION_COLORS[division.division.id]?.text}>{division.division.name}</span>
            )}
            {division.next && (
              <span className="block font-sans text-xs font-normal normal-case tracking-normal text-slate-400">
                Te faltan {formatElo(division.toNext)} para {division.next.name}
              </span>
            )}
          </p>
          <ChevronRight aria-hidden className="size-5 shrink-0 text-slate-500" />
        </>
      ) : (
        <>
          <span aria-hidden className="aspect-[100/112] w-10 animate-pulse bg-slate-800/70" />
          <span aria-hidden className="h-9 flex-1 animate-pulse bg-slate-900/70" />
        </>
      )}
    </Link>
  );
}
