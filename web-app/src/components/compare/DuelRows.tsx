import type { DuelRow } from "@/lib/compare";
import { cn } from "@/lib/utils";

/** Filas cara a cara: cifra de cada lado, etiqueta en el centro y reparto en una barra fina. */
export function DuelRows({ rows, colors }: { rows: DuelRow[]; colors: [string, string] }) {
  return (
    <ul className="border-t border-slate-800">
      {rows.map((row) => (
        <li key={row.key} className="border-b border-slate-800/80 py-2">
          <div className="flex items-baseline justify-between gap-3 font-display tabular-nums">
            <span className={cn("text-xl font-bold", row.winner === "b" ? "text-slate-400" : "text-white")}>{row.aText}</span>
            <span className="text-center text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-300">{row.label}</span>
            <span className={cn("text-right text-xl font-bold", row.winner === "a" ? "text-slate-400" : "text-white")}>{row.bText}</span>
          </div>
          {/* Reparto entre los dos, con un hueco del color del fondo en la unión */}
          <div className="mt-1 flex h-1.5 gap-0.5" aria-hidden>
            {row.a === null || row.b === null ? (
              <span className="flex-1 bg-slate-800" />
            ) : (
              <>
                <span style={{ width: `${row.share * 100}%`, background: colors[0] }} />
                <span className="flex-1" style={{ background: colors[1] }} />
              </>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
