"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Shared, SharedLink } from "@/components/layout/SharedLink";
import { PlayerCard3D } from "@/components/players/PlayerCard3D";
import type { LegendCard } from "@/lib/queries";
import { playerPath } from "@/lib/routes";

/** Las que caben de sobra en la pantalla más ancha: las únicas del HTML (las 113 eran 150 KB, Tarea 7.7). */
const FIRST_CARDS = 16;

/**
 * Leyendas en fichas doradas (Tarea 7.4), de la más laureada a la que menos. Las demás se añaden al acercarse a la tira.
 * Solo se pintan las que están a la vista (`content-visibility`) y solo se inclina la que se toca; el dedo desliza la
 * tira como siempre.
 */
export function LegendStrip({ legends }: { legends: LegendCard[] }) {
  const ref = useRef<HTMLUListElement>(null);
  const [all, setAll] = useState(false);

  useEffect(() => {
    const strip = ref.current;
    if (!strip || all) return;
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && startTransition(() => setAll(true)), { rootMargin: "1200px 0px" });
    observer.observe(strip);
    return () => observer.disconnect();
  }, [all]);

  const scroll = (direction: 1 | -1) => ref.current?.scrollBy({ left: direction * ref.current.clientWidth * 0.8, behavior: "smooth" });

  return (
    <div className="relative">
      <ul ref={ref} aria-label="Leyendas" className="flex overflow-x-auto px-2 pb-1 pt-2 [scrollbar-width:none] md:px-6">
        {(all ? legends : legends.slice(0, FIRST_CARDS)).map((legend) => (
          <li key={legend.id} className="hc-cell shrink-0 px-2 py-3">
            <SharedLink
              href={playerPath(legend.id, legend.name)}
              aria-label={[legend.name, legend.line].filter(Boolean).join(", ")}
              draggable={false}
              className="block outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
            >
              <Shared>
                <div>
                  <PlayerCard3D id={legend.id} name={legend.name} tier="legend" line={legend.line} className="hc-mini" />
                </div>
              </Shared>
            </SharedLink>
          </li>
        ))}
      </ul>
      {/* Con ratón no hay gesto para deslizar: flechas */}
      <Arrow side="left" onClick={() => scroll(-1)} />
      <Arrow side="right" onClick={() => scroll(1)} />
    </div>
  );
}

function Arrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Leyendas anteriores" : "Más leyendas"}
      className={`absolute top-1/2 hidden size-11 -translate-y-1/2 items-center justify-center bg-slate-950 text-white ring-1 ring-slate-700 transition-colors hover:bg-orange-500 hover:text-slate-950 md:pointer-fine:flex ${side === "left" ? "left-0" : "right-0"}`}
    >
      <Icon className="size-6" aria-hidden />
    </button>
  );
}
