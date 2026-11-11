// Piezas comunes de la ficha del partido (estilo "Grafismo TV": secciones a todo el ancho y filetes finos).
import type { ReactNode } from "react";
import Image from "next/image";
import type { MatchupTeam } from "@/lib/game-format";
import { teamLogoUrl } from "@/lib/nba-cdn";
import { cn } from "@/lib/utils";

export function Section({
  title,
  accent = "#f97316",
  aside,
  className,
  children,
}: {
  title: ReactNode;
  accent?: string;
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("border-b border-slate-800 px-4 py-6 md:px-8", className)}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-800 pb-3">
        <h2 className="flex items-center gap-3 font-display text-2xl font-bold uppercase tracking-wide text-white">
          <span className="h-6 w-1" style={{ background: accent }} aria-hidden />
          {title}
        </h2>
        {aside && <div className="ml-auto">{aside}</div>}
      </div>
      <div className="pt-4">{children}</div>
    </section>
  );
}

export function Eyebrow({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <p className={cn("font-display text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400", className)}>{children}</p>
  );
}

type Option<T> = { value: T; label: ReactNode; title?: string };

/** Selector de opciones excluyentes (filtros): cuadrado y con filete, como el exportador. */
export function Segmented<T extends string | number | boolean | null>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex w-fit max-w-full overflow-x-auto border border-slate-700", className)}>
      {options.map((option, i) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex shrink-0 items-center gap-2 px-3 py-1.5 font-display text-sm font-bold uppercase tracking-wide outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-400",
              i > 0 && "border-l border-slate-700",
              active ? "bg-orange-500 text-slate-950" : "text-slate-300 hover:bg-slate-900 hover:text-white"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Selector visitante / local con logo y abreviatura. */
export function TeamToggle({
  away,
  home,
  value,
  onChange,
}: {
  away: MatchupTeam;
  home: MatchupTeam;
  value: number;
  onChange: (teamId: number) => void;
}) {
  return (
    <Segmented
      label="Equipo"
      value={value}
      onChange={onChange}
      options={[away, home].map((team) => ({
        value: team.id,
        title: team.name,
        label: (
          <>
            <Image src={teamLogoUrl(team.id)} alt="" width={20} height={20} unoptimized className="size-5" />
            {team.abbreviation}
          </>
        ),
      }))}
    />
  );
}

export function Placeholder({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block animate-pulse bg-slate-800/80", className)} />;
}

/** Muestra de color del equipo junto a un texto (la identidad nunca va solo en el color del texto). */
export function Swatch({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2.5 shrink-0", className)} style={{ background: color }} />;
}
