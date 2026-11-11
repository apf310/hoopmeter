import Image from "next/image";
import { CheckCircle2, Clock, Info, TriangleAlert, XCircle, type LucideIcon } from "lucide-react";
import { pickLabel, type GmTeam } from "@/lib/gm";
import { teamLogoUrl } from "@/lib/nba-cdn";
import { formatMoney, RULE_LABEL, verdictTitle, type TeamReport, type Trade, type TradeVerdict } from "@/lib/trade-rules";
import { cn } from "@/lib/utils";

const TONE: Record<TradeVerdict["status"], { Icon: LucideIcon; bar: string; title: string }> = {
  empty: { Icon: Info, bar: "border-slate-700 bg-slate-900/95", title: "text-white" },
  valid: { Icon: CheckCircle2, bar: "border-emerald-500/70 bg-emerald-950/95", title: "text-emerald-300" },
  valid_from: { Icon: Clock, bar: "border-amber-500/70 bg-amber-950/95", title: "text-amber-300" },
  invalid: { Icon: XCircle, bar: "border-red-500/70 bg-red-950/95", title: "text-red-300" },
};

function verdictDetail(verdict: TradeVerdict): string {
  if (verdict.status === "invalid") return verdict.errors[0].message;
  if (verdict.status === "valid_from") return verdict.delays[0].message;
  if (verdict.status === "valid") return "Cumple las reglas del convenio según los datos disponibles.";
  return "Toca un jugador o una ronda para incluirlos en el traspaso.";
}

/** Veredicto siempre a la vista mientras se monta el traspaso. */
export function VerdictBar({ verdict }: { verdict: TradeVerdict }) {
  const { Icon, bar, title } = TONE[verdict.status];

  return (
    <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 md:bottom-0" role="status">
      <div className={cn("flex items-center gap-3 border-y px-4 py-2.5 backdrop-blur md:px-8", bar)}>
        <Icon className={cn("size-7 shrink-0", title)} />
        <div className="min-w-0 flex-1">
          <p className={cn("font-display text-2xl font-extrabold uppercase leading-none", title)}>{verdictTitle(verdict)}</p>
          <p className="truncate text-xs text-slate-200">{verdictDetail(verdict)}</p>
        </div>
        {verdict.status !== "empty" && (
          <a href="#veredicto" className="shrink-0 font-display text-sm font-bold uppercase tracking-wider text-white underline-offset-4 hover:underline">
            Ver detalle
          </a>
        )}
      </div>
    </div>
  );
}

/** Balance de cada equipo y, en lenguaje llano, todo lo que hay que saber del traspaso. */
export function VerdictDetail({ teams, trade, verdict }: { teams: GmTeam[]; trade: Trade; verdict: TradeVerdict }) {
  return (
    <>
      <div className={cn("grid divide-y divide-slate-800 lg:divide-x lg:divide-y-0", teams.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2")}>
        {teams.map((team) => (
          <TeamLedger key={team.id} team={team} teams={teams} trade={trade} report={verdict.teams.find((report) => report.teamId === team.id)!} />
        ))}
      </div>
      <IssueList verdict={verdict} />
    </>
  );
}

function TeamLedger({ team, teams, trade, report }: { team: GmTeam; teams: GmTeam[]; trade: Trade; report: TeamReport }) {
  const players = trade.players.filter((move) => move.to === team.id).map((move) => move.player);
  const picks = trade.picks.filter((move) => move.to === team.id).map((move) => move.pick);
  const abbreviation = (teamId: number) => teams.find((t) => t.id === teamId)?.abbreviation;

  return (
    <section className="px-4 py-5 md:px-8">
      <h3 className="flex items-center gap-2 font-display text-2xl font-extrabold uppercase leading-none text-white">
        <Image src={teamLogoUrl(team.id)} alt="" width={32} height={32} unoptimized className="size-8" />
        {team.name}
      </h3>

      <p className="mt-3 font-display text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-300">Recibe</p>
      {players.length + picks.length === 0 ? (
        <p className="text-sm text-slate-400">Nada</p>
      ) : (
        <ul className="mt-1 divide-y divide-slate-800/80">
          {players.map((player) => (
            <li key={player.id} className="flex items-baseline justify-between gap-3 py-1">
              <span className="min-w-0 truncate font-semibold text-white">{player.name}</span>
              <span className="shrink-0 font-display text-lg font-bold text-white tabular-nums">{formatMoney(player.salary)}</span>
            </li>
          ))}
          {picks.map((pick) => (
            <li key={`${pick.teamId}-${pick.year}-${pick.round}`} className="flex items-baseline justify-between gap-3 py-1">
              <span className="font-semibold text-white">{pickLabel(pick)}</span>
              <span className="shrink-0 font-display text-base font-semibold uppercase text-slate-300">de {abbreviation(pick.teamId)}</span>
            </li>
          ))}
        </ul>
      )}

      <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-800 pt-3">
        <Figure label="Envía">{formatMoney(report.outgoing)}</Figure>
        <Figure label="Recibe">{formatMoney(report.incoming)}</Figure>
        <Figure label="Nómina final">{formatMoney(report.payrollAfter)}</Figure>
      </dl>
      <p className={cn("mt-2 flex items-center gap-1.5 text-sm font-medium", report.ok ? "text-emerald-300" : "text-red-300")}>
        {report.ok ? <CheckCircle2 className="size-4 shrink-0" /> : <XCircle className="size-4 shrink-0" />}
        {report.ok && report.rule ? RULE_LABEL[report.rule] : "No cuadra"}
      </p>
    </section>
  );
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-display text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-300">{label}</dt>
      <dd className="font-display text-xl font-bold leading-tight text-white tabular-nums">{children}</dd>
    </div>
  );
}

function IssueList({ verdict }: { verdict: TradeVerdict }) {
  const items = [
    ...verdict.errors.map((issue) => ({ ...issue, Icon: XCircle, tone: "text-red-400" })),
    ...verdict.delays.map((issue) => ({ ...issue, Icon: Clock, tone: "text-amber-300" })),
    ...verdict.warnings.map((issue) => ({ ...issue, Icon: TriangleAlert, tone: "text-slate-300" })),
  ];
  if (items.length === 0) return null;

  return (
    <ul className="space-y-2 border-t border-slate-800 px-4 py-4 md:px-8">
      {items.map(({ message, Icon, tone }) => (
        <li key={message} className="flex gap-2 text-sm text-slate-200">
          <Icon className={cn("mt-0.5 size-4 shrink-0", tone)} />
          {message}
        </li>
      ))}
    </ul>
  );
}
