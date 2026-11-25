"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Shared, SharedLink } from "@/components/layout/SharedLink";
import { ArrowDown, ArrowUp } from "lucide-react";
import { PlayerPhoto } from "@/components/players/PlayerPhoto";
import { avg, pct } from "@/lib/player-profile";
import { playerPath } from "@/lib/routes";
import { DEFAULT_ROSTER_SORT, nextSort, sortRoster, type RosterRow, type RosterSort, type RosterSortKey } from "@/lib/team-roster";
import { formatMoney } from "@/lib/trade-rules";
import { cn } from "@/lib/utils";

// Sin relleno: el botón ocupa toda la celda (44 px de alto en móvil, Tarea 6.20) y se acierta con el dedo
const TH = "p-0 font-display text-xs font-semibold uppercase tracking-wider text-slate-300";
const TD = "px-1.5 text-right tabular-nums sm:px-2";
const SM = "hidden sm:table-cell";

type Column = { key: RosterSortKey; label: ReactNode; title: string; className?: string };

const COLUMNS: Column[] = [
  { key: "gp", label: "PJ", title: "Partidos jugados", className: SM },
  { key: "min", label: "MIN", title: "Minutos por partido" },
  { key: "pts", label: "PTS", title: "Puntos por partido" },
  { key: "reb", label: "REB", title: "Rebotes por partido" },
  { key: "ast", label: "AST", title: "Asistencias por partido" },
  { key: "fg3Pct", label: "%T3", title: "Porcentaje de triples", className: SM },
];

/**
 * Plantilla estilo BeSoccer (Tarea 6.7): ordenada por minutos, con promedios de la temporada y salario.
 * Cada cabecera ordena al pulsarla (y al volver a pulsar, invierte). Los promedios no dependen del nivel de
 * spoilers: cambian una vez al día, nunca justo al acabar un partido.
 */
export function RosterTable({ rows, accent, salarySeason }: { rows: RosterRow[]; accent: string; salarySeason: string }) {
  const [sort, setSort] = useState<RosterSort>(DEFAULT_ROSTER_SORT);
  const sorted = useMemo(() => sortRoster(rows, sort), [rows, sort]);

  if (rows.length === 0) return <p className="py-4 text-sm text-slate-400">Sin jugadores registrados.</p>;

  // `edge`: primera o última columna, pegadas al borde de la sección (sin relleno por ese lado, como sus celdas)
  const header = (column: Pick<Column, "key" | "label" | "title">, className?: string, align: "left" | "right" = "right", edge?: "start" | "end") => {
    const active = sort.key === column.key;
    return (
      <th
        key={column.key}
        scope="col"
        aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
        className={cn(TH, className, align === "left" ? "text-left" : "text-right")}
      >
        <button
          type="button"
          title={column.title}
          onClick={() => setSort((current) => nextSort(current, column.key))}
          className={cn(
            "flex min-h-[3.125rem] w-full items-center gap-0.5 px-1.5 uppercase outline-none hover:text-white focus-visible:text-orange-300 sm:min-h-11 sm:px-2",
            align === "right" && "flex-row-reverse",
            edge === "start" && "pl-0 sm:pl-0",
            edge === "end" && "pr-0 sm:pr-0",
            active && "text-orange-400 hover:text-orange-300"
          )}
        >
          {column.label}
          {/* Hueco fijo: la cabecera no salta al cambiar de columna */}
          <span className="size-3" aria-hidden>
            {active && (sort.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
          </span>
        </button>
      </th>
    );
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full whitespace-nowrap text-sm">
        <thead className="border-b border-slate-800">
          <tr>
            {header({ key: "name", label: "Jugador", title: "Nombre" }, "sticky left-0 z-10 w-full bg-slate-950", "left", "start")}
            {COLUMNS.map((column) => header(column, column.className))}
            {header(
              {
                key: "salary",
                // En móvil, en millones y sin unidad en cada fila: así cabe la tabla entera
                label: (
                  <>
                    <span className="sm:hidden">M$</span>
                    <span className="hidden sm:inline">Salario</span>
                  </>
                ),
                title: `Salario ${salarySeason}`,
              },
              undefined,
              "right",
              "end"
            )}
          </tr>
        </thead>
        <tbody>
          {sorted.map((player) => (
            <tr key={player.id} className="group border-b border-slate-800/80 transition-colors hover:bg-slate-900">
              {/* Fija al desplazar la tabla a lo ancho en móvil */}
              <td className="sticky left-0 z-10 max-w-36 bg-slate-950 py-1.5 pr-2 transition-colors group-hover:bg-slate-900 sm:max-w-none">
                <SharedLink href={playerPath(player.id, player.name)} className="flex min-w-0 items-center gap-3 py-1 sm:py-0">
                  {/* Fondo teñido con el color del equipo detrás de la foto */}
                  <span className="hidden h-11 w-[60px] shrink-0 items-end overflow-hidden sm:flex" style={{ background: `${accent}26` }}>
                    <Shared>
                      <PlayerPhoto id={player.id} width={60} height={44} className="h-11 w-[60px] object-cover object-top" />
                    </Shared>
                  </span>
                  <span className="min-w-0 leading-tight">
                    <span className="block truncate font-semibold text-white hover:text-orange-400">{player.name}</span>
                    <span className="block font-display text-xs font-semibold uppercase text-slate-400">{player.position ?? "–"}</span>
                  </span>
                </SharedLink>
              </td>
              <td className={cn(TD, SM, "text-slate-300")}>{player.gp ?? "–"}</td>
              <td className={cn(TD, "font-semibold text-white")}>{avg(player.min)}</td>
              <td className={cn(TD, "text-slate-200")}>{avg(player.pts)}</td>
              <td className={cn(TD, "text-slate-200")}>{avg(player.reb)}</td>
              <td className={cn(TD, "text-slate-200")}>{avg(player.ast)}</td>
              <td className={cn(TD, SM, "text-slate-300")}>{pct(player.fg3Pct)}</td>
              <td className={cn(TD, "pr-0")}>
                <Salary row={player} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Cifra del contrato: nunca inventada. "≈" en las aproximadas; "Sin cifra" si está firmado sin cifra pública. */
function Salary({ row }: { row: RosterRow }) {
  if (row.salaryStatus === "pending") {
    return (
      <span className="text-xs text-amber-400" title="Contrato firmado sin cifra pública todavía">
        Sin cifra
      </span>
    );
  }
  if (row.salary === null) return <span className="text-slate-500">–</span>;
  const approx = row.salaryStatus === "approx";
  const millions = (row.salary / 1_000_000).toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return (
    <span className="text-slate-200" title={approx ? "Cifra aproximada (redondeada por la prensa)" : undefined}>
      {approx && "≈"}
      <span className="sm:hidden">{millions}</span>
      <span className="hidden sm:inline">{formatMoney(row.salary)}</span>
    </span>
  );
}
