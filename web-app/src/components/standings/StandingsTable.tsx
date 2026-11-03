import { Fragment } from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { teamLogoUrl } from "@/lib/nba-cdn";
import { teamAccent } from "@/lib/team-colors";
import type { Team } from "@/lib/supabase";
import { FormStrip, PointDiff, Streak } from "./TeamForm";

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

function winPct(team: Team): number {
  const games = team.wins + team.losses;
  return games === 0 ? 0 : team.wins / games;
}

/** Ordena por `conf_rank` oficial; si falta, por porcentaje de victorias. */
export function sortStandings(teams: Team[]): Team[] {
  return [...teams].sort(
    (a, b) =>
      (a.conf_rank ?? Infinity) - (b.conf_rank ?? Infinity) || winPct(b) - winPct(a)
  );
}

function gamesBehind(team: Team, leader: Team): string {
  const gb = (leader.wins - team.wins + (team.losses - leader.losses)) / 2;
  return gb <= 0 ? "–" : gb.toFixed(1);
}

// Visibilidad por breakpoint: móvil = Pos, Equipo, V, D, Últimos 10
const SM = "hidden sm:table-cell";
const LG = "hidden lg:table-cell";
const COLUMN_COUNT = 11;

const TH = "px-3 py-3 font-display text-xs font-semibold uppercase tracking-wider text-slate-300";

export function StandingsTable({ teams }: { teams: Team[] }) {
  const sorted = sortStandings(teams);
  const leader = sorted[0];

  return (
    <div className="overflow-x-auto">
      <table className="w-full whitespace-nowrap text-sm tabular-nums">
        <thead className="border-b border-slate-800">
          <tr>
            <th className={cn(TH, "w-12 pl-4 text-left")}>Pos</th>
            {/* w-full: el equipo absorbe el espacio sobrante y el resto de columnas quedan compactas */}
            <th className={cn(TH, "w-full text-left")}>Equipo</th>
            <th className={cn(TH, "w-10 text-center")} title="Victorias">V</th>
            <th className={cn(TH, "w-10 text-center")} title="Derrotas">D</th>
            <th className={cn(TH, SM, "w-14 text-right")} title="Porcentaje de victorias">%</th>
            <th className={cn(TH, SM, "w-12 text-right")} title="Partidos por detrás del líder">PD</th>
            <th className={cn(TH, "pl-4 text-left")} title="Últimos 10 partidos (o los jugados si aún no hay 10)">Últimos 10</th>
            <th className={cn(TH, SM, "w-14 text-center")}>Racha</th>
            <th className={cn(TH, LG, "w-14 text-center")}>Casa</th>
            <th className={cn(TH, LG, "w-14 text-center")}>Fuera</th>
            <th className={cn(TH, LG, "w-16 pr-4 text-right")} title="Diferencia de puntos por partido">Dif.</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((team, i) => {
            const rank = i + 1;
            const zone = getZone(rank);
            const extra = team.standings_extra ?? {};
            return (
              <Fragment key={team.id}>
                {zone.from === rank && (
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
                  <td className={cn("py-0 pl-4 pr-2 font-display text-lg font-bold", zone.text)}>{rank}</td>
                  <td className="px-3 py-0">
                    <Link href={`/teams/${team.id}`} className="flex h-14 items-center gap-3">
                      <span className="h-8 w-1 shrink-0" style={{ background: teamAccent(team) }} aria-hidden />
                      <Image src={teamLogoUrl(team.id)} alt="" width={32} height={32} unoptimized className="size-8 shrink-0" />
                      <span className="truncate font-semibold text-white group-hover:text-orange-400">
                        <span className="hidden sm:inline">{team.name}</span>
                        <span className="font-display text-base uppercase tracking-wide sm:hidden">{team.abbreviation}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 text-center font-display text-lg font-bold text-white">{team.wins}</td>
                  <td className="px-3 text-center font-display text-lg font-semibold text-slate-300">{team.losses}</td>
                  <td className={cn(SM, "px-3 text-right text-slate-300")}>{winPct(team).toFixed(3).replace(/^0/, "")}</td>
                  <td className={cn(SM, "px-3 text-right text-slate-300")}>{gamesBehind(team, leader)}</td>
                  <td className="py-0 pl-4 pr-2">
                    <span className="flex items-center gap-3">
                      <FormStrip form={extra.form ?? []} />
                      <span className="hidden text-xs text-slate-400 md:inline">{extra.l10 ?? ""}</span>
                    </span>
                  </td>
                  <td className={cn(SM, "px-3 text-center")}>
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
