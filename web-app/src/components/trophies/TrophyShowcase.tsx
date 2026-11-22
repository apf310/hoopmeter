"use client";

// Vitrina de trofeos de la ficha del jugador. El 3D (Three.js) solo se descarga cuando la vitrina se
// acerca a la pantalla y el navegador tiene WebGL; sin WebGL, versión plana con un icono por premio.

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { Trophy } from "lucide-react";
import type { PlayerAward } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { groupAwards, type TrophyGroup } from "./trophy-catalog";
import { TrophyIcon } from "./TrophyIcon";

/** Mismo tamaño que la vitrina 3D (escenario + panel + miniaturas): sin saltos al cargar. */
function CabinetSkeleton({ groups }: { groups: TrophyGroup[] }) {
  const first = groups[0];
  return (
    <div className="border-y border-slate-800" aria-hidden>
      <div className="grid md:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex h-[22rem] items-center justify-center bg-[radial-gradient(ellipse_58%_52%_at_50%_40%,rgba(148,163,184,0.12),transparent_70%)] md:h-[26rem]">
          <TrophyIcon group={first} className="size-24 animate-pulse opacity-40" />
        </div>
        <div className="flex flex-col gap-2 border-t border-slate-800 p-4 md:border-l md:border-t-0">
          <div className="h-3 w-24 bg-slate-800" />
          <div className="h-8 w-40 bg-slate-800" />
          <div className="h-4 w-32 bg-slate-900" />
        </div>
      </div>
      {groups.length > 1 && (
        <ul className="grid grid-cols-3 border-t border-slate-800 sm:grid-cols-4 lg:grid-cols-6">
          {groups.map((g) => (
            <li key={g.key} className="flex flex-col items-center gap-1 border-b border-r border-slate-800 px-1.5 pb-2.5 pt-1">
              <span className="flex aspect-[4/5] w-full max-w-28 items-center justify-center">
                <TrophyIcon group={g} className="size-10 opacity-40" />
              </span>
              <span className="font-display text-xs font-bold uppercase leading-tight tracking-wide text-slate-500">{g.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Versión plana (sin WebGL): un icono distinto por premio, los grandes trofeos en dorado. */
function FlatCabinet({ groups }: { groups: TrophyGroup[] }) {
  return (
    <ul className="grid grid-cols-2 border-t border-l border-slate-800 sm:grid-cols-3 xl:grid-cols-4">
      {groups.map((g) => (
        <li
          key={g.key}
          className={cn(
            "flex flex-col gap-2 border-b border-r border-slate-800 bg-slate-950 p-4",
            g.major && "bg-gradient-to-b from-amber-500/15 to-slate-950 to-80%"
          )}
        >
          <div className="flex items-center justify-between">
            <TrophyIcon group={g} className="size-8" />
            <span className={cn("font-display text-4xl font-extrabold leading-none tabular-nums", g.major ? "text-amber-300" : "text-white")}>
              {g.count}
              <span className="ml-0.5 text-xl text-slate-500">×</span>
            </span>
          </div>
          <p className="font-display text-lg font-bold uppercase leading-tight tracking-wide text-white">{g.label}</p>
          {g.trophy && <p className="-mt-1.5 text-xs text-slate-300">{g.trophy}</p>}
          {g.detail && <p className="font-display text-sm font-semibold text-slate-300">{g.detail}</p>}
          {g.seasons.length > 0 && <p className="text-xs leading-relaxed text-slate-400">{g.seasons.join(" · ")}</p>}
        </li>
      ))}
    </ul>
  );
}

function hasWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export function TrophyShowcase({ awards, name }: { awards: PlayerAward[]; name: string }) {
  const groups = useMemo(() => groupAwards(awards), [awards]);
  // null = aún no se sabe (servidor y primer render): esqueleto
  const [mode, setMode] = useState<"3d" | "flat" | null>(null);
  const [Cabinet3D, setCabinet3D] = useState<ComponentType<{ groups: TrophyGroup[]; name?: string }> | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- WebGL solo se puede comprobar en el navegador
    setMode(hasWebGL() ? "3d" : "flat");
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || mode !== "3d") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          observer.disconnect();
          // Import dinámico (como next/dynamic): Three.js va en su propio trozo, solo si hace falta
          import("./TrophyCabinet3D")
            .then((m) => setCabinet3D(() => m.default))
            .catch(() => setMode("flat"));
        }
      },
      { rootMargin: "600px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [mode]);

  if (groups.length === 0) {
    return (
      <p className="flex items-center gap-3 py-6 text-sm text-slate-400">
        <Trophy className="size-5 text-slate-600" aria-hidden />
        Vitrina por estrenar: todavía no tiene premios individuales.
      </p>
    );
  }
  if (mode === "flat") return <FlatCabinet groups={groups} />;
  return (
    <div ref={ref} className="relative">
      {/* El esqueleto se queda hasta que llega el 3D: misma altura, sin saltos */}
      {Cabinet3D ? <Cabinet3D groups={groups} name={name} /> : <CabinetSkeleton groups={groups} />}
    </div>
  );
}
