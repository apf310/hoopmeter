import { Fragment } from "react";
import Image from "next/image";
import { Shared, SharedLink } from "@/components/layout/SharedLink";
import { teamPath } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { teamLogoUrl } from "@/lib/nba-cdn";
import { conferenceLabel } from "@/lib/places";
import { teamAccent } from "@/lib/team-colors";
import { sortLeague, type StandingsRow } from "@/lib/standings";
import type { Team } from "@/lib/supabase";
import { FormStrip, PointDiff, Streak } from "./TeamForm";

/** Lo fijo del equipo + su clasificación en el nivel actual (Tarea 6.6). */
export type TeamIdentity = Pick<Team, "id" | "name" | "abbreviation" | "conference" | "primary_color" | "secondary_color">;
export type StandingsTeam = TeamIdentity & StandingsRow;

type Zone = "playoffs" | "playin" | "lottery";

/** Zona de la clasificación y su primera posición (fila donde se pinta el corte). */
const ZONES: { zone: Zone; from: number; label: string; text: string }[] = [
  { zone: "playoffs", from: 1, label: "Playoffs", text: "text-emerald-400" },
  { zone: "playin", from: 7, label: "Play-In", text: "text-amber-400" },
  { zone: "lottery", from: 11, label: "Lotería del Draft", text: "text-slate-400" },
];

function getZone(rank: number) {
  return [...ZONES].reverse().find((z) => rank >= z.from)!;
}

function winPct(team: StandingsTeam): number {
  const games = team.wins + team.losses;
  return games === 0 ? 0 : team.wins / games;
}

/** Ordena por `conf_rank` oficial; si falta, por porcentaje de victorias. */
export function sortStandings(teams: StandingsTeam[]): StandingsTeam[] {
  return [...teams].sort(
    (a, b) =>
      (a.conf_rank ?? Infinity) - (b.conf_rank ?? Infinity) || winPct(b) - winPct(a)
  );
}

function gamesBehind(team: StandingsTeam, leader: StandingsTeam): string {
  const gb = (leader.wins - team.wins + (team.losses - leader.losses)) / 2;
  return gb <= 0 ? "–" : gb.toFixed(1);
}

// Visibilidad por breakpoint: móvil = Pos, Equipo, V, D, PD, Últimos 10 (en texto, "8-2") y Racha (Tarea 6.20)
const SM = "hidden sm:table-cell";
const LG = "hidden lg:table-cell";
const COLUMN_COUNT = 11;

// En móvil, columnas más juntas: con PD y Racha caben las 7 a 360 px
const TH = "px-1.5 py-3 font-display text-xs font-semibold uppercase tracking-wider text-slate-300 sm:px-3";
const TD = "px-1.5 sm:px-3";

/**
 * Clasificación de una conferencia (con los cortes de Playoffs, Play-In y Lotería) o, con `league`, de los
 * 30 equipos (Tarea 6.21): por porcentaje de victorias, sin cortes y con la conferencia y el puesto en ella.
 */
export function StandingsTable({ teams, league = false }: { teams: StandingsTeam[]; league?: boolean }) {
  const sorted = league ? sortLeague(teams) : sortStandings(teams);
  const leader = sorted[0];

  return (
    <div className="overflow-x-auto">
      <table className="w-full whitespace-nowrap text-sm tabular-nums">
        <thead className="border-b border-slate-800">
          <tr>
            <th className={cn(TH, "w-10 pl-4 text-left sm:w-12 sm:pl-4")}>Pos</th>
            {/* w-full: el equipo absorbe el espacio sobrante y el resto de columnas quedan compactas */}
            <th className={cn(TH, "w-full text-left")}>Equipo</th>
            <th className={cn(TH, "w-8 text-center sm:w-10")} title="Victorias">V</th>
            <th className={cn(TH, "w-8 text-center sm:w-10")} title="Derrotas">D</th>
            <th className={cn(TH, SM, "w-14 text-right")} title="Porcentaje de victorias">%</th>
            <th className={cn(TH, "w-10 text-right sm:w-12")} title="Partidos por detrás del líder">PD</th>
            <th className={cn(TH, "text-center sm:pl-4 sm:text-left")} title="Últimos 10 partidos (o los jugados si aún no hay 10)">
              <span className="sm:hidden">Ú10</span>
              <span className="hidden sm:inline">Últimos 10</span>
            </th>
            <th className={cn(TH, "w-12 pr-4 text-center sm:w-14 sm:pr-3")}>Racha</th>
            <th className={cn(TH, LG, "w-14 text-center")}>Casa</th>
            <th className={cn(TH, LG, "w-14 text-center")}>Fuera</th>
            <th className={cn(TH, LG, "w-16 pr-4 text-right")} title="Diferencia de puntos por partido">Dif.</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((team, i) => {
            const rank = i + 1;
            const zone = getZone(rank);
            // En la liga, el color del puesto en su conferencia (el que decide Playoffs o Play-In)
            const confZone = team.conf_rank ? getZone(team.conf_rank) : null;
            const extra = team.standings_extra ?? {};
            return (
              <Fragment key={team.id}>
                {!league && zone.from === rank && (
                  <tr className="bg-slate-900/70">
                    <td
                      colSpan={COLUMN_COUNT}
                      className={cn("px-4 py-1.5 font-display text-[11px] font-bold uppercase tracking-[0.25em]", zone.text)}
                    >
                      {zone.label}
                    </td>
                  </tr>
                )}
                <tr className="group border-b border-slate-800/80 transition-colors hover:bg-slate-900">
                  <td className={cn("py-0 pl-4 pr-2 font-display text-lg font-bold", league ? "text-white" : zone.text)}>{rank}</td>
                  <td className={cn(TD, "py-0")}>
                    <SharedLink href={teamPath(team.id, team.name)} className="flex h-11 items-center gap-2.5 md:h-14 md:gap-3">
                      <span className="h-6 w-1 shrink-0 md:h-8" style={{ background: teamAccent(team) }} aria-hidden />
                      <Shared>
                        <Image src={teamLogoUrl(team.id)} alt="" width={32} height={32} unoptimized className="size-6 shrink-0 md:size-8" />
                      </Shared>
                      <span className="truncate font-semibold text-white group-hover:text-orange-400">
                        <span className="hidden sm:inline">{team.name}</span>
                        <span className="font-display text-base uppercase tracking-wide sm:hidden">{team.abbreviation}</span>
                      </span>
                      {league && (
                        <span className={cn("shrink-0 font-display text-xs font-semibold uppercase tracking-wider", confZone?.text ?? "text-slate-400")}>
                          {conferenceLabel(team.conference)}
                          {team.conf_rank && ` ${team.conf_rank}º`}
                        </span>
                      )}
                    </SharedLink>
                  </td>
                  <td className={cn(TD, "text-center font-display text-lg font-bold text-white")}>{team.wins}</td>
                  <td className={cn(TD, "text-center font-display text-lg font-semibold text-slate-300")}>{team.losses}</td>
                  <td className={cn(SM, "px-3 text-right text-slate-300")}>{winPct(team).toFixed(3).replace(/^0/, "")}</td>
                  <td className={cn(TD, "text-right text-slate-300")}>{gamesBehind(team, leader)}</td>
                  <td className="px-1.5 py-0 text-center sm:pl-4 sm:pr-2 sm:text-left">
                    {/* Móvil: "8-2" en texto (las barritas no caben junto a PD y Racha) */}
                    <span className="text-slate-300 sm:hidden">{extra.l10 ?? "–"}</span>
                    <span className="hidden items-center gap-3 sm:flex">
                      <FormStrip form={extra.form ?? []} />
                      <span className="hidden text-xs text-slate-400 md:inline">{extra.l10 ?? ""}</span>
                    </span>
                  </td>
                  <td className="px-1.5 pr-4 text-center sm:px-3">
                    <Streak streak={extra.streak} className="text-base" />
                  </td>
                  <td className={cn(LG, "px-3 text-center text-slate-300")}>{extra.home ?? "–"}</td>
                  <td className={cn(LG, "px-3 text-center text-slate-300")}>{extra.road ?? "–"}</td>
                  <td className={cn(LG, "pl-2 pr-4 text-right")}>
                    <PointDiff value={extra.diff_ppg} />
                  </td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
