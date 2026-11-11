"use client";

import { useState } from "react";
import Image from "next/image";
import { Check, Clock, X } from "lucide-react";
import { SalaryCapBar } from "@/components/gm/SalaryCapBar";
import { pickKey, type GmPlayer, type GmTeam } from "@/lib/gm";
import { playerHeadshotUrl, teamLogoUrl } from "@/lib/nba-cdn";
import { tierOf } from "@/lib/player-profile";
import {
  APRON_LABEL,
  formatMoney,
  formatTradeDate,
  isValidEstimate,
  MAX_SALARY,
  MIN_SALARY,
  PICK_YEARS,
  salaryZone,
  tradableFrom,
  ZONE_LABEL,
  type DraftPick,
  type TeamReport,
} from "@/lib/trade-rules";
import { cn } from "@/lib/utils";

const OPTION_LABEL = { "Player Option": "opción de jugador", "Team Option": "opción de equipo" };

function contractLength(player: GmPlayer): string {
  if (player.salaryStatus === "pending") {
    const years = player.reported?.years;
    return years ? `contrato nuevo de ${years === 1 ? "1 año" : `${years} años`}` : "contrato nuevo";
  }
  const years = player.contract.filter((salary) => salary !== null).length;
  const length = years === 4 ? "4+ años" : years === 1 ? "1 año" : `${years} años`;
  return player.futurePending ? `${length} + renovación` : length;
}

/** Una plantilla: su situación salarial, sus jugadores con contrato y sus rondas. */
export function TeamPanel({
  team,
  players,
  report,
  partners,
  today,
  playerMoves,
  pickMoves,
  estimates,
  onPlayer,
  onPick,
  onEstimate,
  onRemove,
}: {
  team: GmTeam;
  players: GmPlayer[];
  report: TeamReport;
  /** Los otros equipos del traspaso: posibles destinos de sus activos. */
  partners: GmTeam[];
  today: string;
  playerMoves: Record<number, number>;
  pickMoves: Record<string, number>;
  estimates: Record<number, number>;
  onPlayer: (playerId: number, to: number | null) => void;
  onPick: (pick: DraftPick, to: number | null) => void;
  onEstimate: (playerId: number, salary: number | null) => void;
  onRemove: () => void;
}) {
  const { payrollAfter, hardCap, rosterAfter } = report;
  const moved = payrollAfter !== team.payroll;

  return (
    <div>
      <header className="relative overflow-hidden" style={{ background: `linear-gradient(115deg, ${team.primary} 0%, ${team.primary}b3 40%, #020617 95%)` }}>
        {/* Oscurece colores de franquicia claros para que el texto blanco siempre se lea */}
        <div className="absolute inset-0 bg-slate-950/45" aria-hidden />
        <Image src={teamLogoUrl(team.id)} alt="" width={220} height={220} unoptimized loading="eager" className="pointer-events-none absolute -right-12 top-1/2 size-[220px] -translate-y-1/2 opacity-15" />

        <div className="relative p-4">
          <div className="flex items-center gap-3">
            <Image src={teamLogoUrl(team.id)} alt="" width={56} height={56} unoptimized className="size-14 shrink-0 drop-shadow-lg" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-[11px] font-semibold uppercase tracking-[0.25em] text-white/75">{ZONE_LABEL[salaryZone(payrollAfter)]}</p>
              <h2 className="font-display text-3xl font-extrabold uppercase leading-[0.95] text-white">{team.name}</h2>
            </div>
            <button type="button" onClick={onRemove} aria-label={`Quitar a ${team.name} del traspaso`} className="self-start p-1 text-white/70 hover:text-white">
              <X className="size-5" />
            </button>
          </div>

          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
            <Stat label="Nómina">{formatMoney(team.payroll)}</Stat>
            {moved && <Stat label="Tras el traspaso">{formatMoney(payrollAfter)}</Stat>}
            <Stat label="Contratos">{rosterAfter}</Stat>
          </dl>

          <div className="mt-3">
            <SalaryCapBar team={team} after={payrollAfter} />
          </div>
          <p className="mt-1 text-xs text-white/80">
            {hardCap ? `Hard cap en el ${APRON_LABEL[hardCap]}` : "Sin hard cap"}
            {team.deadMoney > 0 && ` · ${formatMoney(team.deadMoney)} de dinero muerto${team.pendingDeadMoney ? " (por confirmar)" : ""}`}
            {!!team.pendingContracts && ` · ${team.pendingContracts === 1 ? "1 contrato" : `${team.pendingContracts} contratos`} sin cifra pública`}
          </p>
        </div>
        <div className="relative h-1" style={{ background: team.accent }} aria-hidden />
      </header>

      <h3 className="border-b border-slate-800 px-4 pb-2 pt-4 font-display text-lg font-bold uppercase tracking-wide text-white">
        Plantilla <span className="text-slate-500">{players.length}</span>
      </h3>
      <ul>
        {players.map((player) => (
          <PlayerRow
            key={player.id}
            player={player}
            team={team}
            partners={partners}
            today={today}
            to={playerMoves[player.id] ?? null}
            estimate={estimates[player.id] ?? null}
            onChange={(to) => onPlayer(player.id, to)}
            onEstimate={(salary) => onEstimate(player.id, salary)}
          />
        ))}
      </ul>

      <h3 className="border-b border-slate-800 px-4 pb-2 pt-5 font-display text-lg font-bold uppercase tracking-wide text-white">Rondas del draft</h3>
      <div className="space-y-3 px-4 py-3">
        {([1, 2] as const).map((round) => (
          <div key={round}>
            <p className="font-display text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-300">{round === 1 ? "Primera ronda" : "Segunda ronda"}</p>
            <div className="mt-1 grid grid-cols-7 gap-px">
              {PICK_YEARS.map((year) => {
                const pick = { teamId: team.id, year, round };
                const to = pickMoves[pickKey(pick)] ?? null;
                return (
                  <button
                    key={year}
                    type="button"
                    onClick={() => onPick(pick, to === null ? partners[0].id : null)}
                    aria-pressed={to !== null}
                    aria-label={`${round === 1 ? "Primera" : "Segunda"} ronda de ${year} de ${team.name}`}
                    className={cn(
                      "py-1.5 font-display text-sm font-bold tabular-nums transition-colors",
                      to !== null ? "bg-orange-500 text-slate-950" : "bg-slate-900 text-slate-200 hover:bg-slate-800"
                    )}
                  >
                    {String(year).slice(2)}
                  </button>
                );
              })}
            </div>
            {partners.length > 1 && <PickDestinations round={round} team={team} partners={partners} pickMoves={pickMoves} onPick={onPick} />}
          </div>
        ))}
        <p className="text-xs text-slate-400">Rondas propias de cada equipo: no sabemos cuáles ha cedido ya.</p>
      </div>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-display text-[10px] font-semibold uppercase tracking-[0.25em] text-white/70">{label}</dt>
      <dd className="font-display text-2xl font-bold leading-tight text-white tabular-nums">{children}</dd>
    </div>
  );
}

function PlayerRow({
  player,
  team,
  partners,
  today,
  to,
  estimate,
  onChange,
  onEstimate,
}: {
  player: GmPlayer;
  team: GmTeam;
  partners: GmTeam[];
  today: string;
  to: number | null;
  /** Estimación del usuario si el contrato aún no tiene cifra pública. */
  estimate: number | null;
  onChange: (to: number | null) => void;
  onEstimate: (salary: number | null) => void;
}) {
  const selected = to !== null;
  const pending = player.salaryStatus === "pending";
  const from = tradableFrom(player);
  const locked = from !== null && today < from;
  const details = [player.position, player.age && `${player.age} años`, contractLength(player), player.option && OPTION_LABEL[player.option]].filter(Boolean).join(" · ");

  return (
    <li className={cn("relative border-b border-slate-800/80", selected && "bg-orange-500/10")}>
      {selected && <span className="absolute inset-y-0 left-0 w-1 bg-orange-500" aria-hidden />}
      <button
        type="button"
        onClick={() => onChange(selected ? null : partners[0].id)}
        aria-pressed={selected}
        className="flex w-full items-center gap-3 px-4 py-1.5 text-left transition-colors hover:bg-slate-900"
      >
        <span className="relative flex h-10 w-[54px] shrink-0 items-end overflow-hidden" style={{ background: `${team.accent}26` }}>
          <Image src={playerHeadshotUrl(player.id)} alt="" width={54} height={40} className="h-10 w-[54px] object-cover object-top" />
          {selected && (
            <span className="absolute inset-0 flex items-center justify-center bg-orange-500/70">
              <Check className="size-6 text-white" strokeWidth={3} />
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-white">{player.name}</span>
          <span className="block truncate text-xs text-slate-300">{details}</span>
          {locked && (
            <span className="mt-0.5 flex items-center gap-1 text-xs font-medium text-amber-300">
              <Clock className="size-3 shrink-0" />
              Traspasable desde el {formatTradeDate(from)}
            </span>
          )}
        </span>
        <span className="flex shrink-0 flex-col items-end">
          {!pending ? (
            <span
              className="font-display text-xl font-bold leading-none text-white tabular-nums"
              title={player.salaryStatus === "approx" ? "Cifra redondeada publicada por la prensa" : undefined}
            >
              {player.salaryStatus === "approx" && "≈"}
              {formatMoney(player.salary)}
            </span>
          ) : estimate !== null ? (
            <span className="font-display text-xl font-bold leading-none text-amber-200 tabular-nums" title="Tu estimación: el contrato aún no es público">
              ≈{formatMoney(estimate)}
            </span>
          ) : (
            <span className="font-display text-sm font-bold uppercase leading-none tracking-wider text-amber-300" title="Firmado según el registro oficial de la NBA; la cifra aún no es pública">
              Sin cifra
            </span>
          )}
          {player.overall !== null && (
            <span className={cn("font-display text-xs font-bold uppercase tracking-wider", tierOf(player.overall).textClass)}>Media {player.overall}</span>
          )}
        </span>
      </button>
      {selected && partners.length > 1 && <Destinations partners={partners} to={to} onChange={onChange} label={player.name} />}
      {selected && pending && <EstimateInput player={player} estimate={estimate} onChange={onEstimate} />}
    </li>
  );
}

const toMillions = (salary: number) => (salary / 1_000_000).toLocaleString("es-ES", { maximumFractionDigits: 2 });

/** Contrato firmado sin cifra pública: para simular, el usuario escribe cuánto cree que cobra esta temporada. */
function EstimateInput({ player, estimate, onChange }: { player: GmPlayer; estimate: number | null; onChange: (salary: number | null) => void }) {
  const [text, setText] = useState(estimate === null ? "" : toMillions(estimate));
  const typed = text.trim();
  const salary = Math.round(Number(typed.replace(",", ".")) * 1_000_000);
  const invalid = typed !== "" && !isValidEstimate(salary);

  return (
    <div className="px-4 pb-3 pl-[82px]">
      <label htmlFor={`estimate-${player.id}`} className="block text-xs leading-snug text-amber-100">
        Su contrato es oficial, pero la cifra aún no es pública. ¿Cuánto crees que cobra esta temporada?
      </label>
      <div className="mt-1.5 flex items-center gap-2">
        <input
          id={`estimate-${player.id}`}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="Ej. 12,5"
          value={text}
          onChange={(event) => {
            const next = event.target.value;
            setText(next);
            const value = Math.round(Number(next.trim().replace(",", ".")) * 1_000_000);
            onChange(next.trim() !== "" && isValidEstimate(value) ? value : null);
          }}
          aria-invalid={invalid}
          className="w-24 bg-slate-900 px-2 py-1 font-display text-lg font-bold text-white ring-1 ring-inset ring-amber-400/60 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-300"
        />
        <span className="font-display text-sm font-bold uppercase tracking-wider text-slate-300">millones</span>
      </div>
      <p className={cn("mt-1 text-xs", invalid ? "text-red-300" : "text-slate-400")}>
        {invalid
          ? `Entre ${formatMoney(MIN_SALARY)} y ${formatMoney(MAX_SALARY)}: lo mínimo y lo máximo que permite el convenio.`
          : "Se marcará como estimación tuya en el veredicto y en la imagen."}
      </p>
      <ReportedHint player={player} />
    </div>
  );
}

/** Lo que ha publicado la prensa, como ayuda para estimar: nunca se usa como cifra por sí solo. */
function ReportedHint({ player }: { player: GmPlayer }) {
  const reported = player.reported;
  if (!reported) return null;
  const { years, total, minimumOptions, outlet, url } = reported;

  // Dos decimales: entre estas dos cifras la diferencia está justo en el segundo
  const precise = (salary: number) => `${(salary / 1_000_000).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} M$`;
  let text: string | null = null;
  if (minimumOptions?.length === 2) {
    text = `Mínimo de 1 año al renovar: cuenta ${precise(minimumOptions[0])} o ${precise(minimumOptions[1])} según cómo se firmara (no se publica).`;
  } else if (years && total) {
    const average = years > 1 ? ` (media de ${formatMoney(Math.round(total / years))} por año; el reparto real puede variar)` : "";
    text = `${years === 1 ? "1 año" : `${years} años`} y ${formatMoney(total)} en total${average}.`;
  } else if (reported.minimum) {
    text = "Contrato mínimo: depende de sus años en la liga.";
  }
  if (!text) return null;

  return (
    <p className="mt-1.5 border-l-2 border-amber-400/60 pl-2 text-xs leading-snug text-slate-300">
      <span className="font-semibold text-amber-100">Según {outlet ?? "la prensa"}:</span> {text}{" "}
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="whitespace-nowrap text-orange-300 underline-offset-2 hover:underline">
          Ver noticia
        </a>
      )}
    </p>
  );
}

/** Destino de un activo en un traspaso a tres bandas. */
function Destinations({ partners, to, onChange, label }: { partners: GmTeam[]; to: number; onChange: (to: number) => void; label: string }) {
  return (
    <div className="flex items-center gap-2 px-4 pb-2 pl-[82px]" role="group" aria-label={`Destino de ${label}`}>
      <span className="font-display text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-300">Va a</span>
      {partners.map((partner) => (
        <button
          key={partner.id}
          type="button"
          onClick={() => onChange(partner.id)}
          aria-pressed={to === partner.id}
          className={cn(
            "px-2 py-0.5 font-display text-sm font-bold uppercase transition-colors",
            to === partner.id ? "bg-white text-slate-950" : "bg-slate-800 text-slate-200 hover:bg-slate-700"
          )}
        >
          {partner.abbreviation}
        </button>
      ))}
    </div>
  );
}

function PickDestinations({
  round,
  team,
  partners,
  pickMoves,
  onPick,
}: {
  round: 1 | 2;
  team: GmTeam;
  partners: GmTeam[];
  pickMoves: Record<string, number>;
  onPick: (pick: DraftPick, to: number | null) => void;
}) {
  const chosen = PICK_YEARS.map((year) => ({ teamId: team.id, year, round })).filter((pick) => pickMoves[pickKey(pick)] !== undefined);
  if (chosen.length === 0) return null;

  return (
    <ul className="mt-1">
      {chosen.map((pick) => (
        <li key={pick.year} className="flex items-center gap-2 py-0.5">
          <span className="w-10 font-display text-sm font-bold tabular-nums text-white">{pick.year}</span>
          <span className="font-display text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-300">Va a</span>
          {partners.map((partner) => (
            <button
              key={partner.id}
              type="button"
              onClick={() => onPick(pick, partner.id)}
              aria-pressed={pickMoves[pickKey(pick)] === partner.id}
              className={cn(
                "px-2 py-0.5 font-display text-sm font-bold uppercase transition-colors",
                pickMoves[pickKey(pick)] === partner.id ? "bg-white text-slate-950" : "bg-slate-800 text-slate-200 hover:bg-slate-700"
              )}
            >
              {partner.abbreviation}
            </button>
          ))}
        </li>
      ))}
    </ul>
  );
}
