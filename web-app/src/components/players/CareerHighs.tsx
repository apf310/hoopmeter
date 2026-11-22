import { Flame } from "lucide-react";
import type { CareerHigh } from "@/lib/supabase";

const HIGHS: { stat: string; label: string }[] = [
  { stat: "PTS", label: "Puntos" },
  { stat: "REB", label: "Rebotes" },
  { stat: "AST", label: "Asistencias" },
  { stat: "FG3M", label: "Triples" },
  { stat: "STL", label: "Robos" },
  { stat: "BLK", label: "Tapones" },
];

const highDate = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Récords personales en un partido (Career Highs de temporada regular). */
export function CareerHighs({ highs }: { highs: Record<string, CareerHigh> | undefined }) {
  const items = HIGHS.filter((h) => highs?.[h.stat]?.value != null);
  if (!highs || items.length === 0) return <p className="py-4 text-sm text-slate-400">Sin récords registrados.</p>;

  return (
    <ul className="grid grid-cols-2 gap-px border-y border-slate-800 bg-slate-800 sm:grid-cols-3 lg:grid-cols-6">
      {items.map(({ stat, label }) => {
        const high = highs[stat];
        return (
          <li key={stat} className="bg-slate-950 p-4">
            <p className="flex items-center gap-1.5 font-display text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-300">
              {stat === "PTS" && <Flame className="size-3.5 text-orange-500" aria-hidden />}
              {label}
            </p>
            <p className="font-display text-5xl font-extrabold leading-tight text-white tabular-nums">{high.value}</p>
            <p className="text-xs text-slate-400">
              {high.vs && <span className="font-semibold text-slate-300">vs {high.vs}</span>}
              {high.vs && high.date && " · "}
              {high.date && highDate.format(new Date(`${high.date}T00:00:00Z`))}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
