"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Conference = "East" | "West";

const OPTIONS: { value: Conference; label: string }[] = [
  { value: "East", label: "Este" },
  { value: "West", label: "Oeste" },
];

/** Selector Este/Oeste a todo el ancho con indicador deslizante. Las tablas llegan ya renderizadas. */
export function ConferenceSwitch({ east, west }: { east: ReactNode; west: ReactNode }) {
  const [conference, setConference] = useState<Conference>("East");

  return (
    <div>
      <div role="tablist" aria-label="Conferencia" className="relative grid grid-cols-2 border-b border-slate-800">
        {OPTIONS.map(({ value, label }) => {
          const selected = conference === value;
          return (
            <button
              key={value}
              type="button"
              role="tab"
              id={`tab-${value}`}
              aria-selected={selected}
              aria-controls={`panel-${value}`}
              onClick={() => setConference(value)}
              className={cn(
                "flex flex-col items-center py-3 transition-colors md:py-4",
                selected ? "text-white" : "text-slate-500 hover:text-slate-300"
              )}
            >
              <span className="font-display text-[11px] font-semibold uppercase tracking-[0.25em]">Conferencia</span>
              <span className="font-display text-3xl font-extrabold uppercase leading-none md:text-4xl">{label}</span>
            </button>
          );
        })}
        <span
          aria-hidden
          className={cn(
            "absolute -bottom-px left-0 h-[3px] w-1/2 bg-orange-500 transition-transform duration-300 ease-out",
            conference === "West" && "translate-x-full"
          )}
        />
      </div>
      <div role="tabpanel" id="panel-East" aria-labelledby="tab-East" hidden={conference !== "East"}>
        {east}
      </div>
      <div role="tabpanel" id="panel-West" aria-labelledby="tab-West" hidden={conference !== "West"}>
        {west}
      </div>
    </div>
  );
}
