"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { ExplorerTeam } from "@/components/players/PlayerExplorer";
import { useFloatingHead } from "@/lib/floating-head";
import { playerHeadshotUrl } from "@/lib/nba-cdn";
import {
  formatStat,
  qualifiesFor,
  qualifyRule,
  STATS,
  statTitle,
  statValue,
  type ExplorerMode,
  type ExplorerRow,
  type ExplorerSort,
  type StatKey,
} from "@/lib/player-explorer";
import { tierOf } from "@/lib/player-profile";
import { SEASON } from "@/lib/trade-rules";
import { cn } from "@/lib/utils";

// Sin relleno: el botón ocupa toda la celda (44 px de alto en móvil, como la plantilla de la Tarea 6.20)
const TH = "p-0 font-display text-xs font-semibold uppercase tracking-wider text-slate-300";
const TD = "px-1.5 text-right tabular-nums sm:px-2";

/**
 * Tabla del explorador: nombre fijo a la izquierda al desplazar a lo ancho en el móvil; cada cabecera
 * ordena (y al volver a pulsar, invierte). La columna del orden se destaca en naranja.
 */
export function ExplorerTable({
  rows,
  columns,
  sort,
  mode,
  maxGames,
  teamById,
  onSort,
}: {
  rows: ExplorerRow[];
  columns: StatKey[];
  sort: ExplorerSort;
  mode: ExplorerMode;
  maxGames: number;
  teamById: Map<number, ExplorerTeam>;
  onSort: (key: StatKey) => void;
}) {
  const rule = qualifyRule(sort.key, maxGames);
  const { anchorRef, boxRef, copyRef, scrollerRef, tableRef, floating, syncScroll } = useFloatingHead();

  /** Celdas de la cabecera: las de la tabla y las de su copia fija (`copy`, fuera del orden de tabulación). */
  const headerCells = (copy: boolean) => (
    <>
      <th scope="col" className={cn(TH, "sticky left-0 z-10 bg-slate-950 py-3 pl-4 pr-2 text-left md:pl-8", !copy && "w-full")}>
        Jugador
      </th>
      {columns.map((key, i) => {
        const active = sort.key === key;
        const stat = STATS[key];
        return (
          <th
            key={key}
            scope="col"
            aria-sort={copy ? undefined : active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
            className={cn(TH, "text-right")}
          >
            <button
              type="button"
              title={key === "salary" ? `Salario ${SEASON}` : statTitle(key, mode) + (stat.hint ? `: ${stat.hint}` : "")}
              tabIndex={copy ? -1 : undefined}
              onClick={() => onSort(key)}
              className={cn(
                "flex min-h-[3.125rem] w-full flex-row-reverse items-center gap-0.5 px-1.5 uppercase outline-none hover:text-white focus-visible:text-orange-300 sm:min-h-11 sm:px-2",
                i === columns.length - 1 && "pr-4 sm:pr-4 md:pr-8",
                active && "bg-orange-500/10 text-orange-400 hover:text-orange-300"
              )}
            >
              {stat.label}
              {/* Hueco fijo: la cabecera no salta al cambiar de columna */}
              <span className="size-3" aria-hidden>
                {active && (sort.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
              </span>
            </button>
          </th>
        );
      })}
    </>
  );

  return (
    <div className="relative border-b border-slate-800">
      {/* Copia de la cabecera fija bajo el buscador al bajar (como el boxscore, Tarea 6.20) */}
      <div ref={anchorRef} aria-hidden className="sticky top-[calc(8rem+1px+env(safe-area-inset-top))] z-20 h-0 md:top-[calc(4.5rem+1px)]">
        <div ref={boxRef} className={cn("overflow-hidden bg-slate-950 shadow-[0_8px_12px_-8px_rgba(0,0,0,0.9)]", !floating && "invisible")}>
          <table ref={copyRef} className="table-fixed whitespace-nowrap text-sm">
            <thead className="border-b border-slate-800">
              <tr>{headerCells(true)}</tr>
            </thead>
          </table>
        </div>
      </div>

      <div ref={scrollerRef} onScroll={syncScroll} className="overflow-x-auto">
        <table ref={tableRef} className="w-full whitespace-nowrap text-sm">
          <thead className="border-b border-slate-800">
            <tr>{headerCells(false)}</tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const team = row.teamId ? teamById.get(row.teamId) : undefined;
              const outOfRanking = rule !== null && !qualifiesFor(sort.key, row.totals, maxGames);
              return (
                <tr key={row.id} className="group border-b border-slate-800/80 transition-colors last:border-b-0 hover:bg-slate-900">
                  {/* Fija al desplazar la tabla a lo ancho en móvil; franja con el color de su equipo */}
                  <td className="sticky left-0 z-10 max-w-44 bg-slate-950 py-1 pr-2 transition-colors group-hover:bg-slate-900 sm:max-w-none">
                    <Link
                      href={`/players/${row.id}`}
                      className="flex min-w-0 items-center gap-2 border-l-[3px] py-1 pl-[calc(1rem-3px)] md:pl-[calc(2rem-3px)]"
                      style={{ borderColor: team?.accent ?? "#334155" }}
                    >
                      <span
                        className={cn(
                          "w-6 shrink-0 text-right font-display text-sm font-bold tabular-nums",
                          outOfRanking ? "text-slate-600" : "text-slate-400"
                        )}
                      >
                        {index + 1}
                      </span>
                      <span
                        className="hidden h-10 w-[54px] shrink-0 items-end overflow-hidden sm:flex"
                        style={{ background: `${team?.accent ?? "#334155"}26` }}
                      >
                        <Image src={playerHeadshotUrl(row.id)} alt="" width={54} height={40} className="h-10 w-[54px] object-cover object-top" />
                      </span>
                      <span className="min-w-0 leading-tight">
                        <span className="block truncate font-semibold text-white group-hover:text-orange-400">{row.name}</span>
                        <span className="block truncate font-display text-xs font-semibold uppercase text-slate-400">
                          {[team?.abbreviation ?? "Libre", row.position, row.age ? `${row.age} años` : null].filter(Boolean).join(" · ")}
                          {row.rookie && <span className="ml-1.5 text-orange-400">Rookie</span>}
                        </span>
                      </span>
                    </Link>
                  </td>
                  {columns.map((key, i) => (
                    <Cell
                      key={key}
                      row={row}
                      stat={key}
                      mode={mode}
                      active={sort.key === key}
                      dim={sort.key === key && outOfRanking}
                      dimTitle={rule ? `Fuera de la clasificación: le faltan los ${rule} que pide la NBA a estas alturas` : undefined}
                      last={i === columns.length - 1}
                    />
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Cell({
  row,
  stat,
  mode,
  active,
  dim,
  dimTitle,
  last,
}: {
  row: ExplorerRow;
  stat: StatKey;
  mode: ExplorerMode;
  active: boolean;
  dim: boolean;
  dimTitle?: string;
  last: boolean;
}) {
  const className = cn(
    TD,
    last && "pr-4 sm:pr-4 md:pr-8",
    active ? "bg-orange-500/[0.07] font-semibold text-white" : "text-slate-200",
    dim && "text-slate-500"
  );
  const value = statValue(row, stat, mode);

  if (stat === "salary") return <td className={className}>{salary(row)}</td>;
  if (stat === "overall") {
    return (
      <td className={className}>
        {value === null ? (
          <span className="text-slate-500">–</span>
        ) : (
          <span className={cn("font-display text-base font-extrabold", tierOf(value).textClass)}>{value}</span>
        )}
      </td>
    );
  }
  return (
    <td className={className} title={dim ? dimTitle : undefined}>
      {formatStat(value, stat, mode)}
    </td>
  );
}

/** Cifra del contrato: nunca inventada. "≈" en las aproximadas; "Sin cifra" si está firmado sin cifra pública. */
function salary(row: ExplorerRow) {
  if (row.salaryStatus === "pending") {
    return (
      <span className="text-xs text-amber-400" title="Contrato firmado sin cifra pública todavía">
        Sin cifra
      </span>
    );
  }
  if (row.salary === null) return <span className="text-slate-500">–</span>;
  const approx = row.salaryStatus === "approx";
  return (
    <span title={approx ? "Cifra aproximada (redondeada por la prensa)" : `Salario ${SEASON}`}>
      {approx && "≈"}
      {formatStat(row.salary, "salary", "game")}
    </span>
  );
}
