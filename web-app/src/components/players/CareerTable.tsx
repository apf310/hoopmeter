"use client";

import { Fragment, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { avg, pct } from "@/lib/player-profile";
import { teamLogoUrl } from "@/lib/nba-cdn";
import type { PlayerSeasonStats, SeasonType } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type ChartStat = "pts" | "reb" | "ast";
type BestKey = "pts" | "reb" | "ast" | "stl" | "blk";

const SEASON_TYPES: { value: SeasonType; label: string }[] = [
  { value: "Regular Season", label: "Temporada regular" },
  { value: "Playoffs", label: "Playoffs" },
];

const CHART_STATS: { value: ChartStat; label: string }[] = [
  { value: "pts", label: "Puntos" },
  { value: "reb", label: "Rebotes" },
  { value: "ast", label: "Asistencias" },
];

const TH = "px-2 py-3 text-right font-display text-xs font-semibold uppercase tracking-wider text-slate-300";
const TD = "px-2 py-2.5 text-right tabular-nums";

function statValue(row: PlayerSeasonStats, key: BestKey): number | null {
  return key === "pts" || key === "reb" || key === "ast" ? row[key] : (row.advanced_stats[key] ?? null);
}

/** "2015-16" → "15-16" para el eje de la gráfica. */
const shortSeason = (season: string) => season.slice(2);

/**
 * Trayectoria temporada a temporada: gráfica de evolución + tabla con su mejor
 * temporada resaltada en cada estadística y el desglose de las temporadas con traspaso.
 */
export function CareerTable({ rows, teamIds, accent }: { rows: PlayerSeasonStats[]; teamIds: number[]; accent: string }) {
  const availableTypes = SEASON_TYPES.filter((t) => rows.some((r) => r.season_type === t.value && r.season_id !== "Career"));
  const [seasonType, setSeasonType] = useState<SeasonType>(availableTypes[0]?.value ?? "Regular Season");
  const [chartStat, setChartStat] = useState<ChartStat>("pts");

  if (availableTypes.length === 0) {
    return <p className="py-4 text-sm text-slate-400">Sin estadísticas de trayectoria todavía.</p>;
  }

  const knownTeams = new Set(teamIds);
  const seasons = rows
    .filter((r) => r.season_type === seasonType && r.season_id !== "Career")
    .sort((a, b) => a.season_id.localeCompare(b.season_id));
  const career = rows.find((r) => r.season_type === seasonType && r.season_id === "Career");

  // Máximo de cada estadística para resaltar su mejor temporada (solo si hay más de una)
  const best = Object.fromEntries(
    (["pts", "reb", "ast", "stl", "blk"] as BestKey[]).map((key) => [
      key,
      seasons.length > 1 ? Math.max(...seasons.map((s) => statValue(s, key) ?? -1)) : null,
    ])
  ) as Record<BestKey, number | null>;
  const isBest = (row: PlayerSeasonStats, key: BestKey) => best[key] != null && best[key] > 0 && statValue(row, key) === best[key];

  const chartData = seasons.map((s) => ({ season: s.season_id, value: s[chartStat] }));
  const chartLabel = CHART_STATS.find((s) => s.value === chartStat)!.label;
  const gradientId = `career-fill-${chartStat}`;

  return (
    <div>
      {/* Selector temporada regular / playoffs con indicador deslizante */}
      {availableTypes.length > 1 && (
        <div role="tablist" aria-label="Tipo de temporada" className="relative mb-6 grid grid-cols-2 border-b border-slate-800">
          {availableTypes.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={seasonType === value}
              onClick={() => setSeasonType(value)}
              className={cn(
                "py-3 font-display text-xl font-extrabold uppercase transition-colors md:text-2xl",
                seasonType === value ? "text-white" : "text-slate-500 hover:text-slate-300"
              )}
            >
              {label}
            </button>
          ))}
          <span
            aria-hidden
            className={cn(
              "absolute -bottom-px left-0 h-[3px] w-1/2 bg-orange-500 transition-transform duration-300 ease-out",
              seasonType === "Playoffs" && "translate-x-full"
            )}
          />
        </div>
      )}

      {/* Evolución de la estadística elegida, con su media de carrera como referencia */}
      {seasons.length > 1 && (
        <div className="mb-8">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="font-display text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-300">
              Evolución · {chartLabel} por partido
            </p>
            <div className="flex gap-1" role="group" aria-label="Estadística de la gráfica">
              {CHART_STATS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={chartStat === value}
                  onClick={() => setChartStat(value)}
                  className={cn(
                    "px-3 py-1.5 font-display text-sm font-bold uppercase tracking-wide transition-colors",
                    chartStat === value ? "bg-orange-500 text-slate-950" : "bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={accent} stopOpacity={0.45} />
                    <stop offset="100%" stopColor={accent} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1e293b" vertical={false} />
                <XAxis
                  dataKey="season"
                  tickFormatter={shortSeason}
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  axisLine={{ stroke: "#334155" }}
                  tickLine={false}
                  minTickGap={12}
                />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                {career?.[chartStat] != null && (
                  <ReferenceLine
                    y={career[chartStat]!}
                    stroke="#f97316"
                    strokeDasharray="4 4"
                    label={{ value: `Carrera ${avg(career[chartStat])}`, position: "insideTopLeft", fill: "#fdba74", fontSize: 11 }}
                  />
                )}
                <Tooltip
                  cursor={{ stroke: "#475569" }}
                  contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 0 }}
                  labelStyle={{ color: "#cbd5e1", fontWeight: 600 }}
                  itemStyle={{ color: "#fff" }}
                  formatter={(value) => [avg(Number(value)), chartLabel]}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={accent}
                  strokeWidth={2.5}
                  fill={`url(#${gradientId})`}
                  dot={{ r: 3, fill: accent, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: "#fff" }}
                  connectNulls
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="border-b border-slate-800">
            <tr>
              <th className={cn(TH, "pl-0 text-left")}>Temporada</th>
              <th className={cn(TH, "text-left")}>Equipo</th>
              <th className={cn(TH, "hidden md:table-cell")}>Edad</th>
              <th className={TH} title="Partidos jugados">PJ</th>
              <th className={cn(TH, "hidden sm:table-cell")} title="Minutos por partido">MIN</th>
              <th className={TH}>PTS</th>
              <th className={TH}>REB</th>
              <th className={TH}>AST</th>
              <th className={cn(TH, "hidden md:table-cell")} title="Robos">ROB</th>
              <th className={cn(TH, "hidden md:table-cell")} title="Tapones">TAP</th>
              <th className={cn(TH, "hidden sm:table-cell")} title="Porcentaje de tiros de campo">%TC</th>
              <th className={cn(TH, "hidden sm:table-cell")} title="Porcentaje de triples">%T3</th>
              <th className={cn(TH, "hidden pr-0 lg:table-cell")} title="True Shooting: eficiencia de tiro incluyendo triples y tiros libres">
                TS%
              </th>
            </tr>
          </thead>
          <tbody>
            {[...seasons].reverse().map((row) => {
              const adv = row.advanced_stats;
              const split = adv.teams ?? [];
              return (
                <Fragment key={row.id}>
                  <tr className="border-b border-slate-800/80 transition-colors hover:bg-slate-900">
                    <td className="py-2.5 pr-2 font-display text-base font-bold text-white">{row.season_id}</td>
                    <td className="px-2">
                      {split.length > 0 ? (
                        <span className="flex items-center gap-1.5">
                          {split.map((t, i) => (
                            <TeamMark key={i} teamId={t.team_id} abbreviation={t.team_abbreviation} known={knownTeams} />
                          ))}
                        </span>
                      ) : (
                        <TeamMark teamId={row.team_id} abbreviation={adv.team_abbreviation ?? null} known={knownTeams} showLabel />
                      )}
                    </td>
                    <td className={cn(TD, "hidden text-slate-300 md:table-cell")}>{adv.age ?? "–"}</td>
                    <td className={cn(TD, "text-slate-300")}>{row.games_played ?? "–"}</td>
                    <td className={cn(TD, "hidden text-slate-300 sm:table-cell")}>{avg(adv.min)}</td>
                    <StatCell value={row.pts} best={isBest(row, "pts")} strong />
                    <StatCell value={row.reb} best={isBest(row, "reb")} />
                    <StatCell value={row.ast} best={isBest(row, "ast")} />
                    <StatCell value={adv.stl} best={isBest(row, "stl")} className="hidden md:table-cell" />
                    <StatCell value={adv.blk} best={isBest(row, "blk")} className="hidden md:table-cell" />
                    <td className={cn(TD, "hidden text-slate-300 sm:table-cell")}>{pct(row.fg_pct)}</td>
                    <td className={cn(TD, "hidden text-slate-300 sm:table-cell")}>{pct(row.fg3_pct)}</td>
                    <td className={cn(TD, "hidden pr-0 text-slate-300 lg:table-cell")}>{pct(adv.ts_pct)}</td>
                  </tr>
                  {/* Temporada con traspaso: una sub-fila por equipo */}
                  {split.map((t, i) => (
                    <tr key={`${row.id}-${i}`} className="border-b border-slate-800/50 text-xs text-slate-400">
                      <td className="py-1.5 pl-3 pr-2">↳</td>
                      <td className="px-2">
                        <TeamMark teamId={t.team_id} abbreviation={t.team_abbreviation} known={knownTeams} showLabel small />
                      </td>
                      <td className="hidden md:table-cell" />
                      <td className={cn(TD, "py-1.5")}>{t.gp ?? "–"}</td>
                      <td className="hidden sm:table-cell" />
                      <td className={cn(TD, "py-1.5")}>{avg(t.pts)}</td>
                      <td className={cn(TD, "py-1.5")}>{avg(t.reb)}</td>
                      <td className={cn(TD, "py-1.5")}>{avg(t.ast)}</td>
                      <td colSpan={5} className="hidden md:table-cell" />
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
          {career && (
            <tfoot className="border-t-2 border-slate-700 bg-slate-900/60">
              <tr className="font-display text-base font-bold">
                <td className="py-3 pr-2 uppercase tracking-wide text-orange-400" colSpan={2}>
                  Carrera
                </td>
                <td className="hidden md:table-cell" />
                <td className={cn(TD, "text-white")}>{career.games_played ?? "–"}</td>
                <td className={cn(TD, "hidden text-white sm:table-cell")}>{avg(career.advanced_stats.min)}</td>
                <td className={cn(TD, "text-lg text-white")}>{avg(career.pts)}</td>
                <td className={cn(TD, "text-white")}>{avg(career.reb)}</td>
                <td className={cn(TD, "text-white")}>{avg(career.ast)}</td>
                <td className={cn(TD, "hidden text-white md:table-cell")}>{avg(career.advanced_stats.stl)}</td>
                <td className={cn(TD, "hidden text-white md:table-cell")}>{avg(career.advanced_stats.blk)}</td>
                <td className={cn(TD, "hidden text-white sm:table-cell")}>{pct(career.fg_pct)}</td>
                <td className={cn(TD, "hidden text-white sm:table-cell")}>{pct(career.fg3_pct)}</td>
                <td className={cn(TD, "hidden pr-0 text-white lg:table-cell")}>{pct(career.advanced_stats.ts_pct)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {seasons.length > 1 && (
        <p className="mt-3 flex items-center gap-2 text-xs text-slate-400">
          <span className="size-2.5 bg-orange-500" aria-hidden />
          Mejor temporada de su carrera en esa estadística
        </p>
      )}
    </div>
  );
}

function StatCell({ value, best, strong, className }: { value: number | null | undefined; best: boolean; strong?: boolean; className?: string }) {
  return (
    <td
      className={cn(
        TD,
        strong ? "font-semibold text-white" : "text-slate-200",
        best && "bg-orange-500/15 font-bold text-orange-300",
        className
      )}
    >
      {avg(value)}
    </td>
  );
}

function TeamMark({
  teamId,
  abbreviation,
  known,
  showLabel,
  small,
}: {
  teamId: number | null;
  abbreviation: string | null;
  known: Set<number>;
  showLabel?: boolean;
  small?: boolean;
}) {
  const hasLogo = teamId != null && known.has(teamId);
  const content = (
    <>
      {hasLogo && (
        <Image src={teamLogoUrl(teamId)} alt={showLabel ? "" : (abbreviation ?? "")} width={24} height={24} unoptimized className={small ? "size-4" : "size-6"} />
      )}
      {(showLabel || !hasLogo) && <span className="font-display font-bold uppercase">{abbreviation ?? "–"}</span>}
    </>
  );

  return hasLogo ? (
    <Link href={`/teams/${teamId}`} title={abbreviation ?? undefined} className="flex items-center gap-1.5 text-slate-200 hover:text-orange-400">
      {content}
    </Link>
  ) : (
    <span className="flex items-center gap-1.5 text-slate-300">{content}</span>
  );
}
