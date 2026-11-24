"use client";

import { Section } from "@/components/games/detail/ui";
import type { DuelPlayer, DuelSeason } from "@/lib/compare-data";
import { CAREER } from "@/lib/compare";
import { eraFactor, type EraStat, type LeagueAverages } from "@/lib/era-adjust";
import { cn } from "@/lib/utils";

/** Interruptor "Ajustar por épocas" y, encendido, la temporada a la que se lleva todo. */
export function EraSwitch({ on, onToggle, reference, references, onReference }: { on: boolean; onToggle: () => void; reference: string; references: string[]; onReference: (season: string) => void }) {
  return (
    <div className="mt-3 flex min-h-11.5 flex-wrap items-center justify-center gap-x-4 gap-y-2">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={onToggle}
        className="group flex min-h-11.5 items-center gap-3 font-display text-base font-bold uppercase tracking-wide text-white outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
      >
        <span className={cn("flex h-6 w-11 items-center border p-0.5 transition-colors", on ? "border-orange-500 bg-orange-500" : "border-slate-600 bg-slate-900 group-hover:border-slate-400")} aria-hidden>
          <span className={cn("size-[1.125rem] transition-transform motion-reduce:transition-none", on ? "translate-x-5 bg-slate-950" : "bg-slate-300")} />
        </span>
        Ajustar por épocas
      </button>
      {on && (
        <label className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wide text-slate-300">
          a la liga de
          <select
            value={reference}
            onChange={(event) => onReference(event.target.value)}
            className="border border-slate-700 bg-slate-950 px-2 py-1.5 text-base font-bold text-white outline-none focus-visible:border-orange-400"
          >
            {references.map((season) => (
              <option key={season} value={season}>
                {season}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

const ROWS: { stat: EraStat; label: string }[] = [
  { stat: "pts", label: "Puntos" },
  { stat: "reb", label: "Rebotes" },
  { stat: "ast", label: "Asistencias" },
  { stat: "tsPct", label: "Tiro real (TS%)" },
];

const figure = (stat: EraStat, value: number | null | undefined) => (!value ? "–" : stat === "tsPct" ? (value * 100).toFixed(1) : value.toFixed(1));
const paceText = (league: LeagueAverages | null) => (league?.pace ? `${league.paceEstimated ? "≈" : ""}${league.pace.toFixed(1)}` : "–");
const factorText = (factor: number | null) => (factor === null ? null : `×${factor.toFixed(2)}`);
const shortName = (name: string) => name.split(" ").slice(1).join(" ") || name;

/** De dónde sale el ajuste: un equipo medio de la liga de cada uno, el de la temporada de referencia y el factor. */
export function LeagueContext({
  a,
  b,
  seasonA,
  seasonB,
  reference,
  referenceId,
  colors,
}: {
  a: DuelPlayer;
  b: DuelPlayer;
  seasonA: DuelSeason;
  seasonB: DuelSeason;
  reference: LeagueAverages;
  referenceId: string;
  colors: [string, string];
}) {
  const sides = [
    { player: a, season: seasonA, color: colors[0] },
    { player: b, season: seasonB, color: colors[1] },
  ];
  const estimated = [seasonA.league, seasonB.league, reference].some((league) => league?.pace && league.paceEstimated);
  const cell = "py-2 pl-2 text-right align-baseline font-display text-lg font-bold tabular-nums";

  return (
    <Section title="La liga de cada época">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-y border-slate-800 text-right font-display text-[11px] font-semibold uppercase leading-tight tracking-[0.1em] text-slate-300">
            <th scope="col" className="py-2 pr-2 text-left align-bottom font-semibold">
              Equipo medio
            </th>
            {sides.map(({ player, season, color }, i) => (
              <th key={i} scope="col" className="py-2 pl-2 align-bottom font-semibold">
                <span className="block truncate" style={{ color }}>
                  {shortName(player.name)}
                </span>
                {season.id === CAREER ? "Carrera" : season.id}
              </th>
            ))}
            <th scope="col" className="py-2 pl-2 align-bottom font-semibold text-orange-400">
              <span className="block">Referencia</span>
              {referenceId}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-slate-800/80">
            <RowHeader>Ritmo</RowHeader>
            {sides.map(({ season }, i) => (
              <td key={i} className={cn(cell, "text-white")}>
                {paceText(season.league)}
              </td>
            ))}
            <td className={cn(cell, "text-orange-400")}>{paceText(reference)}</td>
          </tr>
          {ROWS.map(({ stat, label }) => (
            <tr key={stat} className="border-b border-slate-800/80">
              <RowHeader>{label}</RowHeader>
              {sides.map(({ season }, i) => {
                const factor = season.league && factorText(eraFactor(stat, season.league, reference));
                return (
                  <td key={i} className={cn(cell, "text-white")}>
                    {figure(stat, season.league?.[stat])}
                    {factor && <span className="block text-xs font-semibold text-slate-400">{factor}</span>}
                  </td>
                );
              })}
              <td className={cn(cell, "text-orange-400")}>{figure(stat, reference[stat])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 max-w-3xl text-xs leading-relaxed text-slate-400">
        Lo que hacía un equipo medio de la liga por cada 48 minutos (ritmo = posesiones) y, debajo, por cuánto se multiplican las cifras del jugador para llevarlas a {referenceId}. Los puntos por
        equipo ya juntan el ritmo y el acierto: en una liga rápida pero con peor tiro, lo uno compensa lo otro.
        {(seasonA.id === CAREER || seasonB.id === CAREER) && " En una carrera se ajusta cada temporada con su liga."} No corrige los minutos jugados ni el nivel de los rivales.
        {estimated && " ≈ Ritmo estimado: la NBA no contaba las pérdidas hasta 1977-78 ni los rebotes de ataque hasta 1973-74 (no entra en el cálculo)."}
      </p>
    </Section>
  );
}

function RowHeader({ children }: { children: string }) {
  return (
    <th scope="row" className="py-2 pr-2 text-left align-baseline font-display text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-300">
      {children}
    </th>
  );
}
