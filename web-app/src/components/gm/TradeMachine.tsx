"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { RotateCcw, Plus, X } from "lucide-react";
import { LeagueSalaries } from "@/components/gm/SalaryCapBar";
import { TeamPanel } from "@/components/gm/TeamPanel";
import { TradeEvaluationCard } from "@/components/gm/TradeEvaluationCard";
import { VerdictBar, VerdictDetail } from "@/components/gm/TradeVerdict";
import { TradeCardExport } from "@/components/share/TradeShareCard";
import { buildTrade, canonicalTrade, MAX_TEAMS, pickKey, type GmData, type GmPlayer, type GmTeam, type TradeEvaluation, type TradeRequest } from "@/lib/gm";
import { teamLogoUrl } from "@/lib/nba-cdn";
import { checkTrade, type DraftPick } from "@/lib/trade-rules";
import { cn } from "@/lib/utils";

const withoutKey = <T,>(record: Record<string, T>, key: string | number) =>
  Object.fromEntries(Object.entries(record).filter(([entry]) => entry !== String(key)));

function groupByTeam(players: GmPlayer[]): Map<number, GmPlayer[]> {
  const groups = new Map<number, GmPlayer[]>();
  for (const player of players) groups.set(player.teamId, [...(groups.get(player.teamId) ?? []), player]);
  return groups;
}

/** Simulador de traspasos: el veredicto se recalcula en el cliente con cada toque, sin esperas. */
export function TradeMachine({ data }: { data: GmData }) {
  const [teamIds, setTeamIds] = useState<number[]>([]);
  const [playerMoves, setPlayerMoves] = useState<Record<number, number>>({});
  const [pickMoves, setPickMoves] = useState<Record<string, number>>({});
  /** Estimaciones del usuario para contratos aún sin cifra pública, por jugador. */
  const [estimates, setEstimates] = useState<Record<number, number>>({});
  const [choosingTeams, setChoosingTeams] = useState(true);
  const [activeTeam, setActiveTeam] = useState<number | null>(null);
  const [evaluation, setEvaluation] = useState<{ key: string; result: TradeEvaluation } | null>(null);

  const playersOf = useMemo(() => groupByTeam(data.players), [data.players]);

  const request: TradeRequest = useMemo(
    () => ({
      teamIds,
      players: Object.entries(playerMoves).map(([id, to]) => ({ id: Number(id), to })),
      picks: Object.entries(pickMoves).map(([key, to]) => {
        const [teamId, year, round] = key.split("-").map(Number);
        return { teamId, year, round: round as DraftPick["round"], to };
      }),
      // Solo de los jugadores que están en el traspaso: el resto no cambia nada
      estimates: Object.entries(estimates)
        .filter(([id]) => playerMoves[Number(id)] !== undefined)
        .map(([id, salary]) => ({ id: Number(id), salary })),
    }),
    [teamIds, playerMoves, pickMoves, estimates]
  );
  const trade = useMemo(() => buildTrade(data, request), [data, request]);
  const verdict = useMemo(() => (trade ? checkTrade(trade, data.today) : null), [trade, data.today]);

  const teams = teamIds.map((id) => data.teams.find((team) => team.id === id)!);
  // Un equipo elegido sin ningún movimiento no forma parte del traspaso: ni nota ni columna en la tarjeta
  const participants = teams.filter(
    ({ id }) => trade?.players.some(({ player, to }) => to === id || player.teamId === id) || trade?.picks.some(({ pick, to }) => to === id || pick.teamId === id)
  );
  const dealRequest = { ...request, teamIds: participants.map((team) => team.id) };
  const tradeKey = canonicalTrade(dealRequest);
  const currentEvaluation = evaluation?.key === tradeKey ? evaluation.result : null;
  const payrollAfter = useMemo(() => new Map(verdict?.teams.map((report) => [report.teamId, report.payrollAfter])), [verdict]);

  function toggleTeam(teamId: number) {
    if (teamIds.includes(teamId)) {
      removeTeam(teamId);
    } else if (teamIds.length < MAX_TEAMS) {
      setTeamIds([...teamIds, teamId]);
      setActiveTeam(teamId);
      if (teamIds.length + 1 >= 2) setChoosingTeams(false);
    }
  }

  /** Sus activos y los que iban hacia él salen del traspaso. */
  function removeTeam(teamId: number) {
    const remaining = teamIds.filter((id) => id !== teamId);
    setTeamIds(remaining);
    setActiveTeam(remaining[0] ?? null);
    if (remaining.length < 2) setChoosingTeams(true);
    const leaving = new Set(playersOf.get(teamId)?.map((player) => player.id));
    setPlayerMoves(Object.fromEntries(Object.entries(playerMoves).filter(([id, to]) => to !== teamId && !leaving.has(Number(id)))));
    setPickMoves(Object.fromEntries(Object.entries(pickMoves).filter(([key, to]) => to !== teamId && !key.startsWith(`${teamId}-`))));
  }

  function reset() {
    setTeamIds([]);
    setPlayerMoves({});
    setPickMoves({});
    setEstimates({});
    setActiveTeam(null);
    setChoosingTeams(true);
    setEvaluation(null);
  }

  function movePlayer(playerId: number, to: number | null) {
    setPlayerMoves(to === null ? withoutKey(playerMoves, playerId) : { ...playerMoves, [playerId]: to });
  }

  function movePick(pick: DraftPick, to: number | null) {
    const key = pickKey(pick);
    setPickMoves(to === null ? withoutKey(pickMoves, key) : { ...pickMoves, [key]: to });
  }

  function estimate(playerId: number, salary: number | null) {
    setEstimates(salary === null ? withoutKey(estimates, playerId) : { ...estimates, [playerId]: salary });
  }

  const shownTeam = teamIds.includes(activeTeam ?? -1) ? activeTeam : teamIds[0];
  const ready = trade !== null && verdict !== null;
  const hasAssets = ready && verdict.status !== "empty";

  return (
    <>
      {choosingTeams ? (
        <TeamPicker teams={data.teams} selected={teamIds} onToggle={toggleTeam} />
      ) : (
        <TradeTeamsBar teams={teams} onAdd={() => setChoosingTeams(true)} onRemove={removeTeam} onReset={reset} />
      )}

      {ready && (
        <>
          <div role="tablist" aria-label="Equipos del traspaso" className={cn("grid border-b border-slate-800 lg:hidden", teams.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
            {teams.map((team) => {
              const assets = countAssets(team.id, request, playersOf.get(team.id)?.map((player) => player.id) ?? []);
              return (
                <button
                  key={team.id}
                  type="button"
                  role="tab"
                  aria-selected={team.id === shownTeam}
                  onClick={() => setActiveTeam(team.id)}
                  className={cn("flex items-center justify-center gap-2 border-b-[3px] py-2 font-display text-xl font-extrabold uppercase", team.id === shownTeam ? "text-white" : "border-transparent text-slate-400")}
                  style={team.id === shownTeam ? { borderColor: team.accent } : undefined}
                >
                  <Image src={teamLogoUrl(team.id)} alt="" width={24} height={24} unoptimized className="size-6" />
                  {team.abbreviation}
                  {assets > 0 && <span className="bg-orange-500 px-1.5 text-sm text-slate-950">{assets}</span>}
                </button>
              );
            })}
          </div>

          <div className={cn("lg:grid lg:divide-x lg:divide-slate-800", teams.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2")}>
            {teams.map((team) => (
              <div key={team.id} className={cn(team.id !== shownTeam && "hidden lg:block")}>
                <TeamPanel
                  team={team}
                  players={playersOf.get(team.id) ?? []}
                  report={verdict.teams.find((report) => report.teamId === team.id)!}
                  partners={teams.filter((partner) => partner.id !== team.id)}
                  today={data.today}
                  playerMoves={playerMoves}
                  pickMoves={pickMoves}
                  estimates={estimates}
                  onPlayer={movePlayer}
                  onPick={movePick}
                  onEstimate={estimate}
                  onRemove={() => removeTeam(team.id)}
                />
              </div>
            ))}
          </div>

          <VerdictBar verdict={verdict} />

          {hasAssets && (
            <div id="veredicto" className="scroll-mt-16">
              <VerdictDetail teams={participants} trade={trade} verdict={verdict} />
              <TradeEvaluationCard
                key={tradeKey}
                teams={participants}
                request={dealRequest}
                evaluation={currentEvaluation}
                disabled={verdict.status === "invalid"}
                onEvaluated={(result) => setEvaluation({ key: tradeKey, result })}
              />
              <div className="border-t border-slate-800 px-4 py-6 md:px-8">
                <TradeCardExport teams={participants} trade={trade} verdict={verdict} evaluation={currentEvaluation} />
              </div>
            </div>
          )}
        </>
      )}

      <LeagueSalaries teams={data.teams} selected={teamIds} payrollAfter={payrollAfter} canAdd={teamIds.length < MAX_TEAMS} onToggle={toggleTeam} />
    </>
  );
}

function countAssets(teamId: number, request: TradeRequest, ownPlayers: number[]): number {
  return request.players.filter(({ id }) => ownPlayers.includes(id)).length + request.picks.filter((pick) => pick.teamId === teamId).length;
}

function TeamPicker({ teams, selected, onToggle }: { teams: GmTeam[]; selected: number[]; onToggle: (teamId: number) => void }) {
  const full = selected.length >= MAX_TEAMS;
  const prompt = selected.length === 0 ? "Elige el primer equipo" : selected.length === 1 ? "Elige con quién negocia" : "Elige un tercer equipo";

  return (
    <section className="border-b border-slate-800 px-4 py-5 md:px-8" aria-label="Elegir equipos">
      <h2 className="font-display text-3xl font-extrabold uppercase leading-none text-white">{prompt}</h2>
      <p className="mt-1 text-sm text-slate-300">Traspasos de 2 o 3 equipos, con los contratos reales de esta temporada.</p>
      <ul className="mt-4 grid grid-cols-5 gap-px bg-slate-800 sm:grid-cols-6 lg:grid-cols-10">
        {teams.map((team) => {
          const active = selected.includes(team.id);
          return (
            <li key={team.id} className="bg-slate-950">
              <button
                type="button"
                onClick={() => onToggle(team.id)}
                disabled={full && !active}
                aria-pressed={active}
                aria-label={team.name}
                className={cn("flex w-full flex-col items-center gap-1 border-b-[3px] border-transparent py-2 transition-colors hover:bg-slate-900 disabled:opacity-30", active && "bg-slate-900")}
                style={active ? { borderColor: team.accent } : undefined}
              >
                {/* Halo claro: muchos logos son oscuros y desaparecerían sobre el fondo */}
                <Image src={teamLogoUrl(team.id)} alt="" width={44} height={44} unoptimized loading="eager" className="size-11 drop-shadow-[0_0_2px_rgba(255,255,255,0.75)]" />
                <span className={cn("font-display text-sm font-bold uppercase", active ? "text-white" : "text-slate-300")}>{team.abbreviation}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function TradeTeamsBar({ teams, onAdd, onRemove, onReset }: { teams: GmTeam[]; onAdd: () => void; onRemove: (teamId: number) => void; onReset: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-800 px-4 py-2.5 md:px-8">
      <ul className="flex items-center gap-1">
        {teams.map((team) => (
          <li key={team.id}>
            <button
              type="button"
              onClick={() => onRemove(team.id)}
              aria-label={`Quitar a ${team.name} del traspaso`}
              className="flex items-center gap-1.5 bg-slate-900 py-1 pl-2 pr-1.5 font-display text-lg font-bold uppercase text-white hover:bg-slate-800"
            >
              <Image src={teamLogoUrl(team.id)} alt="" width={24} height={24} unoptimized className="size-6" />
              {team.abbreviation}
              <X className="size-4 text-slate-400" />
            </button>
          </li>
        ))}
      </ul>
      {teams.length < MAX_TEAMS && (
        <button type="button" onClick={onAdd} className="flex items-center gap-1 font-display text-sm font-bold uppercase tracking-wider text-orange-400 hover:text-orange-300">
          <Plus className="size-4" />
          Tercer equipo
        </button>
      )}
      <button type="button" onClick={onReset} className="ml-auto flex items-center gap-1 font-display text-sm font-bold uppercase tracking-wider text-slate-300 hover:text-white">
        <RotateCcw className="size-4" />
        Empezar de nuevo
      </button>
    </div>
  );
}
