"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, X } from "lucide-react";
import { ShotCourt } from "@/components/games/detail/ShotChart";
import type { GameDetail } from "@/lib/game-detail";
import { decimal, doubleDouble, findPlayer, minutes, pct, periodChip, shooting, signed, type MatchupTeam } from "@/lib/game-format";
import { playerHeadshotUrl, teamLogoUrl } from "@/lib/nba-cdn";
import { cn } from "@/lib/utils";

/**
 * El partido de un jugador: su línea completa, su mapa de tiro y todas las jugadas en las que
 * participa (también sus asistencias, robos y tapones). Panel lateral en escritorio, hoja inferior en móvil.
 */
export function PlayerGameSheet({
  detail,
  playerId,
  away,
  home,
  onClose,
  onShowShots,
}: {
  detail: GameDetail;
  playerId: number;
  away: MatchupTeam;
  home: MatchupTeam;
  onClose: () => void;
  onShowShots: (teamId: number, playerId: number) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    // Sin scroll de la página de detrás mientras el panel está abierto
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, []);

  const found = findPlayer(detail, playerId);
  if (!found) return null;
  const { player, team: box } = found;
  const team = box.id === home.id ? home : away;
  const shots = detail.shots.filter((s) => s.playerId === player.id);
  const plays = detail.plays.filter((p) => p.involved.includes(player.id) || p.playerId === player.id);
  const badge = doubleDouble(player);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="player-sheet-title"
      onClose={onClose}
      // Tocar fuera del panel (el fondo) lo cierra
      onClick={(event) => event.target === event.currentTarget && event.currentTarget.close()}
      className="fixed inset-0 m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto overscroll-contain border-0 border-t border-slate-700 bg-slate-950 p-0 text-slate-100 backdrop:bg-slate-950/75 backdrop:backdrop-blur-sm md:my-0 md:ml-auto md:mr-0 md:h-dvh md:max-h-none md:w-[32rem] md:border-l md:border-t-0"
    >
      <div>
        <header
          className="relative overflow-hidden"
          style={{ background: `linear-gradient(115deg, ${team.primary} 0%, ${team.primary}99 45%, #020617 100%)` }}
        >
          <div aria-hidden className="absolute inset-0 bg-slate-950/40" />
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="Cerrar"
            className="absolute right-2 top-2 z-10 p-2 text-white/80 outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-orange-400"
          >
            <X className="size-6" />
          </button>
          <div className="relative flex items-end gap-3 px-5 pt-8">
            <Image
              src={playerHeadshotUrl(player.id)}
              alt=""
              width={200}
              height={146}
              className="h-28 w-auto shrink-0 drop-shadow-[0_8px_20px_rgba(0,0,0,0.5)] sm:h-32"
            />
            <div className="min-w-0 pb-4">
              <p className="flex items-center gap-2 font-display text-[11px] font-semibold uppercase tracking-[0.25em] text-white/75">
                <Image src={teamLogoUrl(team.id)} alt="" width={16} height={16} unoptimized className="size-4" />
                {[team.abbreviation, player.position, player.jersey && `#${player.jersey}`].filter(Boolean).join(" · ")}
              </p>
              <h2 id="player-sheet-title" className="mt-1 font-display text-3xl font-extrabold uppercase leading-none text-white">
                {player.name}
              </h2>
              <Link
                href={`/players/${player.id}`}
                className="mt-2 inline-flex items-center gap-1 font-display text-xs font-bold uppercase tracking-wider text-orange-300 hover:text-orange-200"
              >
                Ficha del jugador <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </div>
          <div aria-hidden className="relative h-1" style={{ background: team.accent }} />
        </header>

        {!player.played ? (
          <p className="px-5 py-6 text-slate-300">
            {detail.status === "Live" ? "Aún no ha jugado" : "No ha jugado"}: {player.absence?.toLowerCase()}
            {player.absenceDetail && ` (${player.absenceDetail})`}.
          </p>
        ) : (
          <>
            <dl className="grid grid-cols-4 border-b border-slate-800">
              <Big label="Puntos">{player.pts}</Big>
              <Big label="Rebotes">{player.reb}</Big>
              <Big label="Asist.">{player.ast}</Big>
              <Big label="+/-">{signed(player.plusMinus)}</Big>
            </dl>
            <dl className="grid grid-cols-4 gap-y-3 px-5 py-4">
              <Small label="Minutos">{minutes(player.seconds)}</Small>
              <Small label="Tiros">{shooting(player.fgm, player.fga)}</Small>
              <Small label="Triples">{shooting(player.fg3m, player.fg3a)}</Small>
              <Small label="Libres">{shooting(player.ftm, player.fta)}</Small>
              <Small label="Reb. of./def.">{`${player.oreb}/${player.dreb}`}</Small>
              <Small label="Robos">{player.stl}</Small>
              <Small label="Tapones">{player.blk}</Small>
              <Small label="Pérdidas">{player.tov}</Small>
              <Small label="TS%">{pct(player.tsPct)}</Small>
              <Small label="USG%">{pct(player.usgPct)}</Small>
              <Small label="Valoración">{decimal(player.gameScore)}</Small>
              <Small label="Faltas">{player.pf}</Small>
            </dl>
            {badge && <p className="-mt-1 px-5 pb-4 font-display text-sm font-bold uppercase tracking-wide text-orange-400">{badge}</p>}

            <section className="border-t border-slate-800 px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display text-lg font-bold uppercase tracking-wide text-white">Mapa de tiro</h3>
                {shots.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onShowShots(team.id, player.id)}
                    className="inline-flex items-center gap-1 font-display text-xs font-bold uppercase tracking-wider text-orange-300 hover:text-orange-200"
                  >
                    Ampliar con filtros <ArrowRight className="size-3.5" />
                  </button>
                )}
              </div>
              {shots.length > 0 ? (
                <ShotCourt shots={shots} accent={team.accent} regulation={detail.regulationPeriods} className="mt-3" />
              ) : (
                <p className="mt-2 text-sm text-slate-400">No ha lanzado a canasta.</p>
              )}
            </section>
          </>
        )}

        {plays.length > 0 && (
          <section className="border-t border-slate-800 px-5 py-4">
            <h3 className="font-display text-lg font-bold uppercase tracking-wide text-white">Su partido, jugada a jugada</h3>
            <ol className="mt-2">
              {plays.map((play) => {
                const own = play.playerId === player.id;
                return (
                  <li key={play.id} className="grid grid-cols-[4rem_minmax(0,1fr)] gap-2 border-b border-slate-800/80 py-1.5 text-sm">
                    <span className="font-display font-semibold text-slate-400 tabular-nums">
                      {periodChip(play.period, detail.regulationPeriods)}
                      {play.period <= detail.regulationPeriods && "º"} {play.clock}
                    </span>
                    <span className={cn(own && play.kind === "score" ? "font-semibold text-white" : own ? "text-slate-200" : "text-slate-400")}>
                      {play.text}
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>
        )}
      </div>
    </dialog>
  );
}

function Big({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-r border-slate-800 px-3 py-3 text-center last:border-r-0">
      <dt className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300">{label}</dt>
      <dd className="font-display text-4xl font-extrabold text-white">{children}</dd>
    </div>
  );
}

function Small({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="font-display text-xl font-bold text-white tabular-nums">{children}</dd>
    </div>
  );
}
