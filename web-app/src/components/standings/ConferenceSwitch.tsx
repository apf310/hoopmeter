"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type View = "East" | "West" | "League";

const OPTIONS: { value: View; eyebrow: string; label: string }[] = [
  { value: "East", eyebrow: "Conferencia", label: "Este" },
  { value: "West", eyebrow: "Conferencia", label: "Oeste" },
  // Tarea 6.21: los 30 equipos en una sola tabla
  { value: "League", eyebrow: "Los 30 equipos", label: "Liga (30)" },
];

/** Selector Este/Oeste/Liga a todo el ancho con indicador deslizante. Las tablas llegan ya renderizadas. */
export function ConferenceSwitch({ east, west, league }: { east: ReactNode; west: ReactNode; league: ReactNode }) {
  const [view, setView] = useState<View>("East");
  const panels: Record<View, ReactNode> = { East: east, West: west, League: league };
  const index = OPTIONS.findIndex((option) => option.value === view);

  return (
    <div>
      <div role="tablist" aria-label="Clasificación" className="relative grid grid-cols-3 border-b border-slate-800">
        {OPTIONS.map(({ value, eyebrow, label }) => {
          const selected = view === value;
          return (
            <button
              key={value}
              type="button"
              role="tab"
              id={`tab-${value}`}
              aria-selected={selected}
              aria-controls={`panel-${value}`}
              onClick={() => setView(value)}
              className={cn(
                "flex flex-col items-center py-2 transition-colors md:py-4",
                selected ? "text-white" : "text-slate-500 hover:text-slate-300"
              )}
            >
              <span className="hidden font-display text-[11px] font-semibold uppercase tracking-[0.25em] md:block">{eyebrow}</span>
              <span className="whitespace-nowrap font-display text-2xl font-extrabold uppercase leading-none md:text-4xl">{label}</span>
            </button>
          );
        })}
        <span
          aria-hidden
          className="absolute -bottom-px left-0 h-[3px] w-1/3 bg-orange-500 transition-transform duration-300 ease-out"
          style={{ transform: `translateX(${index * 100}%)` }}
        />
      </div>
      {OPTIONS.map(({ value }) => (
        <div key={value} role="tabpanel" id={`panel-${value}`} aria-labelledby={`tab-${value}`} hidden={view !== value}>
          {panels[value]}
        </div>
      ))}
    </div>
  );
}
