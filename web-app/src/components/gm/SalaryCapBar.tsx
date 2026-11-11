import Image from "next/image";
import type { GmTeam } from "@/lib/gm";
import { teamLogoUrl } from "@/lib/nba-cdn";
import { FIRST_APRON, formatMoney, LUXURY_TAX, salaryZone, SALARY_CAP, SECOND_APRON, ZONE_LABEL } from "@/lib/trade-rules";
import { cn } from "@/lib/utils";

// Escala de puntos, no de barras: las barras exigirían empezar en cero y juntarían las cuatro líneas
const SCALE_MIN = 150_000_000;
const SCALE_MAX = 230_000_000;

const percent = (payroll: number) => Math.min(100, Math.max(0, ((payroll - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100));

const LINES = [
  { value: SALARY_CAP, label: "Tope", row: 0 },
  { value: LUXURY_TAX, label: "Impuesto", row: 1 },
  { value: FIRST_APRON, label: "1er apron", row: 0 },
  { value: SECOND_APRON, label: "2º apron", row: 1 },
];

// Un solo tono que sube con la gravedad de cada zona
const ZONES = [
  { from: SALARY_CAP, to: LUXURY_TAX, opacity: 0.06 },
  { from: LUXURY_TAX, to: FIRST_APRON, opacity: 0.13 },
  { from: FIRST_APRON, to: SECOND_APRON, opacity: 0.21 },
  { from: SECOND_APRON, to: SCALE_MAX, opacity: 0.32 },
];

function ZoneBands() {
  return (
    <div className="absolute inset-0" aria-hidden>
      {ZONES.map(({ from, to, opacity }) => (
        <span
          key={from}
          className="absolute inset-y-0"
          style={{ left: `${percent(from)}%`, width: `${percent(to) - percent(from)}%`, background: `rgba(249, 115, 22, ${opacity})` }}
        />
      ))}
      {LINES.map(({ value }) => (
        <span key={value} className="absolute inset-y-0 w-px bg-slate-500/70" style={{ left: `${percent(value)}%` }} />
      ))}
    </div>
  );
}

/** Dónde está un equipo respecto a las cuatro líneas salariales y dónde acabaría con el traspaso. */
export function SalaryCapBar({ team, after }: { team: GmTeam; after: number }) {
  const moved = after !== team.payroll;
  const [from, to] = [percent(team.payroll), percent(after)].sort((a, b) => a - b);

  return (
    <div>
      <div className="relative h-4 bg-slate-950/70" role="img" aria-label={`Nómina de ${formatMoney(team.payroll)}${moved ? `, ${formatMoney(after)} tras el traspaso` : ""}`}>
        <ZoneBands />
        {moved && (
          <>
            <span className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-white/70" style={{ left: `${from}%`, width: `${to - from}%` }} />
            <span className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 border border-white bg-slate-950" style={{ left: `${percent(team.payroll)}%` }} />
          </>
        )}
        <span className="absolute top-1/2 h-4 w-1.5 -translate-x-1/2 -translate-y-1/2 bg-white shadow-[0_0_0_2px_rgba(2,6,23,0.8)]" style={{ left: `${percent(after)}%` }} />
      </div>
      <ScaleLabels className="mt-1" />
    </div>
  );
}

function ScaleLabels({ className }: { className?: string }) {
  return (
    <div className={cn("relative h-7 font-display text-[11px] font-semibold uppercase leading-[14px] tracking-wide text-slate-200", className)} aria-hidden>
      {LINES.map(({ value, label, row }) => (
        <span key={value} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${percent(value)}%`, top: row * 14 }}>
          {label}
        </span>
      ))}
    </div>
  );
}

const GLOSSARY = [
  { term: "Tope salarial", amount: SALARY_CAP, text: "Por debajo, el equipo tiene espacio y puede absorber contratos sin enviar salario." },
  { term: "Impuesto de lujo", amount: LUXURY_TAX, text: "Por encima, paga una multa a la liga por cada dólar de más." },
  { term: "Primer apron", amount: FIRST_APRON, text: "Por encima, no puede recibir más salario del que envía." },
  { term: "Segundo apron", amount: SECOND_APRON, text: "Por encima, además, no puede sumar varios salarios para cuadrar un traspaso." },
];

/** Las 30 nóminas frente a las cuatro líneas. Los equipos del traspaso muestran adónde irían. */
export function LeagueSalaries({
  teams,
  selected,
  payrollAfter,
  canAdd,
  onToggle,
}: {
  teams: GmTeam[];
  selected: number[];
  /** Nómina tras el traspaso de los equipos que participan. */
  payrollAfter: Map<number, number>;
  canAdd: boolean;
  onToggle: (teamId: number) => void;
}) {
  const ranked = [...teams].sort((a, b) => b.payroll - a.payroll);

  return (
    <section className="border-t border-slate-800 py-8" aria-labelledby="estado-salarial">
      <div className="px-4 md:px-8">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.25em] text-orange-400">Las 30 franquicias</p>
        <h2 id="estado-salarial" className="font-display text-4xl font-extrabold uppercase leading-none text-white">
          Estado salarial
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-300">
          Cuanto más a la derecha está un equipo, menos margen tiene para traspasar. Toca uno para añadirlo al traspaso.
        </p>
      </div>

      <div className="mt-6">
        <div className="flex px-4 md:px-8">
          <span className="w-14 shrink-0" />
          <ScaleLabels className="flex-1" />
          <span className="w-20 shrink-0 text-right font-display text-[11px] font-semibold uppercase tracking-wider text-slate-300">Nómina</span>
          <span className="hidden w-24 shrink-0 text-right font-display text-[11px] font-semibold uppercase tracking-wider text-slate-300 md:block">Dinero muerto</span>
        </div>

        <div className="relative mt-1">
          {/* Mismas columnas que las filas: las bandas atraviesan toda la lista */}
          <div className="pointer-events-none absolute inset-y-0 left-[4.5rem] right-24 md:left-[5.5rem] md:right-52">
            <ZoneBands />
          </div>
          <ol className="relative">
            {ranked.map((team) => (
              <LeagueRow
                key={team.id}
                team={team}
                active={selected.includes(team.id)}
                after={payrollAfter.get(team.id) ?? team.payroll}
                disabled={!canAdd && !selected.includes(team.id)}
                onToggle={() => onToggle(team.id)}
              />
            ))}
          </ol>
        </div>
      </div>

      <dl className="mt-6 grid gap-x-8 gap-y-4 px-4 sm:grid-cols-2 md:px-8 xl:grid-cols-4">
        {GLOSSARY.map(({ term, amount, text }) => (
          <div key={term}>
            <dt className="font-display text-lg font-bold uppercase leading-tight text-white">
              {term} <span className="text-slate-300">{formatMoney(amount)}</span>
            </dt>
            <dd className="text-sm text-slate-300">{text}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function LeagueRow({ team, active, after, disabled, onToggle }: { team: GmTeam; active: boolean; after: number; disabled: boolean; onToggle: () => void }) {
  const moved = after !== team.payroll;
  const [from, to] = [percent(team.payroll), percent(after)].sort((a, b) => a - b);
  const zone = ZONE_LABEL[salaryZone(team.payroll)];

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-pressed={active}
        aria-label={`${team.name}: ${formatMoney(team.payroll)}, ${zone}${team.deadMoney > 0 ? `, ${formatMoney(team.deadMoney)} de dinero muerto` : ""}`}
        className={cn("flex h-8 w-full items-center px-4 text-left transition-colors md:px-8", active ? "bg-white/10" : "hover:bg-white/5", disabled && "cursor-not-allowed")}
      >
        <span className={cn("w-14 shrink-0 font-display text-base font-bold uppercase", active ? "text-white" : "text-slate-300")}>{team.abbreviation}</span>
        <span className="relative h-full flex-1">
          {moved && <span className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-white/80" style={{ left: `${from}%`, width: `${to - from}%` }} />}
          {moved && <span className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 border border-white bg-slate-950" style={{ left: `${percent(team.payroll)}%` }} />}
          {/* Disco claro: muchos logos son oscuros y desaparecerían sobre el fondo */}
          <span className="absolute top-1/2 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-slate-100 shadow-[0_0_0_2px_rgba(2,6,23,0.7)]" style={{ left: `${percent(after)}%` }}>
            <Image src={teamLogoUrl(team.id)} alt="" width={22} height={22} unoptimized className="size-[22px]" />
          </span>
        </span>
        <span className="w-20 shrink-0 text-right font-display text-lg font-bold tabular-nums text-white">{formatMoney(moved ? after : team.payroll)}</span>
        <span className="hidden w-24 shrink-0 text-right font-display text-base font-semibold tabular-nums text-slate-300 md:block">
          {team.deadMoney > 0 ? formatMoney(team.deadMoney) : "–"}
        </span>
      </button>
    </li>
  );
}
