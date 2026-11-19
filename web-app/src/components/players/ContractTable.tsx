import Link from "next/link";
import { Briefcase, ExternalLink } from "lucide-react";
import { OPTION_LABEL, SIGNED_KIND_LABEL, type ContractView, type ContractYear } from "@/lib/player-contract";
import { formatMoney, formatTradeDate } from "@/lib/trade-rules";
import { cn } from "@/lib/utils";

const exactMoney = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });

/** Cifra de un año: exacta en dólares, "≈ 12,5 M$" si es aproximada y "Sin cifra" si no es pública. */
function SalaryCell({ year }: { year: ContractYear }) {
  if (year.status === "pending") return <span className="text-slate-400">Sin cifra</span>;
  if (year.status === "renewal") return <span className="text-slate-400">Renovación sin cifra</span>;
  if (year.status === "approx") return <span title="Cifra aproximada publicada por la prensa">≈ {formatMoney(year.salary!)}</span>;
  return <>{exactMoney.format(year.salary!)} $</>;
}

/**
 * Contrato año a año de la ficha del jugador (Tarea 6.8). Nunca inventa cifras: lo que no es público se dice.
 * `tradeHref`: enlace al GM con el jugador ya elegido (null si no puede traspasarse, p. ej. agente libre).
 */
export function ContractTable({ view, tradeHref }: { view: ContractView | null; tradeHref: string | null }) {
  if (!view) return <p className="py-4 text-sm text-slate-400">Sin contrato registrado en la NBA.</p>;

  const details = [
    view.signedOn && `${view.signedKind ? SIGNED_KIND_LABEL[view.signedKind] : "Firmado"} el ${formatTradeDate(view.signedOn)}`,
    view.acquiredOn && `Traspasado el ${formatTradeDate(view.acquiredOn)}`,
  ].filter(Boolean);

  return (
    <div className="pt-2">
      <table className="w-full max-w-xl">
        <thead>
          <tr className="border-b border-slate-800 font-display text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
            <th scope="col" className="py-2 text-left font-semibold">Temporada</th>
            <th scope="col" className="py-2 text-right font-semibold">Salario</th>
          </tr>
        </thead>
        <tbody>
          {view.years.map((year, i) => (
            <tr key={year.season} className="border-b border-slate-800/80">
              <th scope="row" className={cn("py-2.5 text-left font-display text-lg font-bold tabular-nums", i === 0 ? "text-white" : "text-slate-300")}>
                {year.season}
              </th>
              <td className="py-2.5 text-right font-display text-xl font-extrabold text-white tabular-nums">
                <SalaryCell year={year} />
              </td>
            </tr>
          ))}
        </tbody>
        {view.total !== null && view.years.length > 1 && (
          <tfoot>
            <tr className="font-display uppercase">
              <th scope="row" className="py-2.5 text-left text-sm font-semibold tracking-[0.2em] text-slate-400">
                Total {view.maybeLonger && "(4 temporadas)"}
              </th>
              <td className="py-2.5 text-right text-xl font-extrabold text-orange-400 tabular-nums">
                {view.status === "approx" ? `≈ ${formatMoney(view.total)}` : `${exactMoney.format(view.total)} $`}
              </td>
            </tr>
          </tfoot>
        )}
      </table>

      <ul className="mt-3 max-w-xl space-y-1 text-sm text-slate-300">
        {view.option && (
          <li>
            <span className="font-semibold text-white">{OPTION_LABEL[view.option]}</span> pendiente en su contrato.
          </li>
        )}
        {view.status === "pending" && (
          <li>
            Firmado según el registro oficial de la NBA, aún sin cifra pública.
            {view.reported && <Reported reported={view.reported} />}
          </li>
        )}
        {view.status === "approx" && <li>≈ Cifras redondeadas publicadas por la prensa.</li>}
        {view.maybeLonger && <li className="text-slate-400">Solo se guardan 4 temporadas: el contrato puede seguir después.</li>}
        {details.length > 0 && <li className="text-slate-400">{details.join(" · ")}</li>}
      </ul>

      {tradeHref && (
        <Link
          href={tradeHref}
          className="mt-5 inline-flex items-center gap-2 bg-orange-500 px-4 py-2.5 font-display text-base font-extrabold uppercase tracking-wide text-slate-950 transition-colors hover:bg-orange-400"
        >
          <Briefcase className="size-5" />
          Simular traspaso
        </Link>
      )}
    </div>
  );
}

function Reported({ reported }: { reported: NonNullable<ContractView["reported"]> }) {
  const parts = [
    reported.minimum ? "contrato mínimo" : null,
    reported.years ? (reported.years === 1 ? "1 año" : `${reported.years} años`) : null,
    reported.total ? `≈ ${formatMoney(reported.total)} en total` : null,
  ].filter(Boolean);
  if (parts.length === 0) return null;

  return (
    <>
      {" "}
      Según {reported.url ? (
        <a href={reported.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-orange-400 hover:text-orange-300">
          {reported.outlet ?? "la prensa"}
          <ExternalLink className="size-3" aria-hidden />
        </a>
      ) : (
        (reported.outlet ?? "la prensa")
      )}
      : {parts.join(", ")}.
    </>
  );
}
