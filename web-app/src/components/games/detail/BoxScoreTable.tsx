"use client";

import { Fragment, useState } from "react";
import Image from "next/image";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Eyebrow, Segmented, TeamToggle } from "@/components/games/detail/ui";
import type { GameDetail, PlayerLine, TeamBox } from "@/lib/game-detail";
import { decimal, doubleDouble, minutes, pct, shooting, signed, teamOf, type MatchupTeam } from "@/lib/game-format";
import { playerHeadshotUrl } from "@/lib/nba-cdn";
import { cn } from "@/lib/utils";

type Mode = "basic" | "advanced";

type Column = {
  key: string;
  label: string;
  title: string;
  value: (p: PlayerLine) => number;
  text: (p: PlayerLine) => string;
  total: (team: TeamBox) => string;
  /** Se resalta el máximo del equipo (no en pérdidas ni faltas, donde más no es mejor). */
  best?: boolean;
};

const count = (key: "pts" | "reb" | "oreb" | "dreb" | "ast" | "stl" | "blk" | "tov" | "pf" | "paintPts" | "fastBreakPts" | "secondChancePts", label: string, title: string, best = false): Column => ({
  key,
  label,
  title,
  value: (p) => p[key],
  text: (p) => String(p[key]),
  total: (team) => String(team.totals[key]),
  best,
});

const MINUTES: Column = { key: "min", label: "MIN", title: "Minutos jugados", value: (p) => p.seconds, text: (p) => minutes(p.seconds), total: () => "" };
const PLUS_MINUS: Column = {
  key: "pm",
  label: "+/-",
  title: "Diferencia de puntos mientras estaba en pista",
  value: (p) => p.plusMinus,
  text: (p) => signed(p.plusMinus),
  total: () => "",
  best: true,
};

const BASIC: Column[] = [
  MINUTES,
  count("pts", "PTS", "Puntos", true),
  count("reb", "REB", "Rebotes", true),
  count("ast", "AST", "Asistencias", true),
  { key: "fg", label: "TC", title: "Tiros de campo (anotados/intentados)", value: (p) => p.fgm, text: (p) => shooting(p.fgm, p.fga), total: ({ totals: t }) => shooting(t.fgm, t.fga) },
  { key: "fg3", label: "T3", title: "Triples (anotados/intentados)", value: (p) => p.fg3m, text: (p) => shooting(p.fg3m, p.fg3a), total: ({ totals: t }) => shooting(t.fg3m, t.fg3a) },
  { key: "ft", label: "TL", title: "Tiros libres (anotados/intentados)", value: (p) => p.ftm, text: (p) => shooting(p.ftm, p.fta), total: ({ totals: t }) => shooting(t.ftm, t.fta) },
  count("oreb", "RO", "Rebotes ofensivos"),
  count("dreb", "RD", "Rebotes defensivos"),
  count("stl", "ROB", "Robos", true),
  count("blk", "TAP", "Tapones", true),
  count("tov", "PÉR", "Pérdidas"),
  count("pf", "FP", "Faltas personales"),
  PLUS_MINUS,
];

const ADVANCED: Column[] = [
  MINUTES,
  { key: "ts", label: "TS%", title: "Acierto real: cuenta triples y tiros libres", value: (p) => p.tsPct ?? -1, text: (p) => pct(p.tsPct), total: ({ totals: t }) => pct(t.tsPct), best: true },
  { key: "efg", label: "eFG%", title: "Acierto efectivo: un triple vale como 1,5 tiros de dos", value: (p) => p.efgPct ?? -1, text: (p) => pct(p.efgPct), total: ({ totals: t }) => pct(t.efgPct), best: true },
  { key: "usg", label: "USG%", title: "Uso: % de jugadas del equipo que termina él mientras está en pista", value: (p) => p.usgPct ?? -1, text: (p) => pct(p.usgPct), total: () => "", best: true },
  { key: "gmsc", label: "VAL", title: "Valoración Game Score (Hollinger): su aportación en un solo número", value: (p) => p.gameScore, text: (p) => decimal(p.gameScore), total: () => "", best: true },
  { key: "astto", label: "AST/PÉR", title: "Asistencias por cada pérdida", value: (p) => (p.tov ? p.ast / p.tov : p.ast), text: (p) => (p.tov ? decimal(p.ast / p.tov) : "–"), total: ({ totals: t }) => (t.tov ? decimal(t.ast / t.tov) : "–") },
  count("paintPts", "PINT", "Puntos en la pintura", true),
  count("fastBreakPts", "CONTR", "Puntos al contraataque", true),
  count("secondChancePts", "2ª OP", "Puntos de segunda oportunidad", true),
  { key: "fd", label: "F REC", title: "Faltas recibidas", value: (p) => p.foulsDrawn, text: (p) => String(p.foulsDrawn), total: (team) => String(team.players.reduce((sum, p) => sum + p.foulsDrawn, 0)), best: true },
  PLUS_MINUS,
];

const LEGEND: Record<Mode, string> = {
  basic:
    "TC: tiros de campo · T3: triples · TL: tiros libres · RO / RD: rebotes ofensivos / defensivos · ROB: robos · TAP: tapones · PÉR: pérdidas · FP: faltas personales · +/-: diferencia de puntos con él en pista.",
  advanced:
    "TS%: acierto real, cuenta triples y tiros libres · eFG%: acierto efectivo · USG%: % de jugadas del equipo que termina él · VAL: valoración Game Score · PINT: puntos en la pintura · CONTR: al contraataque · 2ª OP: segunda oportunidad · F REC: faltas recibidas.",
};

const TH = "px-2 py-2.5 font-display text-xs font-semibold uppercase tracking-wider text-slate-300";

type Sort = { key: string; dir: 1 | -1 } | null;

export function BoxScoreTable({
  detail,
  away,
  home,
  onOpenPlayer,
}: {
  detail: GameDetail;
  away: MatchupTeam;
  home: MatchupTeam;
  onOpenPlayer: (playerId: number) => void;
}) {
  const [teamId, setTeamId] = useState(away.id);
  const [mode, setMode] = useState<Mode>("basic");
  const [sort, setSort] = useState<Sort>(null);

  const team = teamId === home.id ? home : away;
  const box = teamOf(detail, teamId);
  const columns = mode === "basic" ? BASIC : ADVANCED;
  const sortColumn = sort ? columns.find((c) => c.key === sort.key) : undefined;

  const played = box.players.filter((p) => p.played);
  const absent = box.players.filter((p) => !p.played);
  const order = (list: PlayerLine[]) =>
    sortColumn && sort ? [...list].sort((a, b) => (sortColumn.value(a) - sortColumn.value(b)) * sort.dir) : list;
  const groups = [
    { label: "Titulares", players: order(played.filter((p) => p.starter)) },
    { label: "Banquillo", players: order(played.filter((p) => !p.starter)) },
  ].filter((g) => g.players.length > 0);

  // Máximo del equipo en cada columna destacada
  const bestByColumn = new Map(
    columns.filter((c) => c.best).map((c) => [c.key, Math.max(...played.map((p) => c.value(p)))])
  );

  // Primer toque: de mayor a menor; segundo: de menor a mayor; tercero: orden original
  function toggleSort(key: string) {
    setSort((current) => (current?.key !== key ? { key, dir: -1 } : current.dir === -1 ? { key, dir: 1 } : null));
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 px-4 py-3 md:gap-3 md:px-8">
        <TeamToggle away={away} home={home} value={teamId} onChange={setTeamId} />
        <Segmented
          label="Tipo de estadísticas"
          value={mode}
          onChange={(next) => {
            setMode(next);
            setSort(null);
          }}
          options={[
            { value: "basic", label: "Tradicional" },
            { value: "advanced", label: "Avanzado" },
          ]}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full whitespace-nowrap text-sm tabular-nums">
          <thead className="border-b border-slate-800">
            <tr>
              <th scope="col" className={cn(TH, "sticky left-0 z-[2] bg-slate-950 pl-4 text-left md:pl-8")}>
                Jugador
              </th>
              {columns.map((column) => {
                const active = sort?.key === column.key;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={active ? (sort.dir === -1 ? "descending" : "ascending") : undefined}
                    className={cn(TH, "text-right last:pr-4 md:last:pr-8")}
                  >
                    <button
                      type="button"
                      title={column.title}
                      onClick={() => toggleSort(column.key)}
                      className={cn("inline-flex items-center gap-0.5 uppercase hover:text-white", active && "text-orange-400")}
                    >
                      {column.label}
                      {active && (sort.dir === -1 ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <Fragment key={group.label}>
                <tr className="border-b border-slate-800 bg-slate-900/50">
                  <th
                    scope="colgroup"
                    colSpan={columns.length + 1}
                    className="sticky left-0 py-1.5 pl-4 text-left font-display text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400 md:pl-8"
                  >
                    {group.label}
                  </th>
                </tr>
                {group.players.map((player) => (
                  <PlayerRow
                    key={player.id}
                    player={player}
                    columns={columns}
                    best={bestByColumn}
                    accent={team.accent}
                    onOpen={() => onOpenPlayer(player.id)}
                  />
                ))}
              </Fragment>
            ))}
            <tr className="border-b border-slate-800 font-display text-base font-bold text-white">
              <th scope="row" className="sticky left-0 bg-slate-950 py-2.5 pl-4 text-left uppercase tracking-wide md:pl-8">
                Totales
              </th>
              {columns.map((column) => (
                <td key={column.key} className="px-2 py-2.5 text-right last:pr-4 md:last:pr-8">
                  {column.total(box)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {absent.length > 0 && (
        <div className="border-b border-slate-800 px-4 py-4 md:px-8">
          <Eyebrow>{detail.status === "Live" ? "Aún sin minutos" : "No han jugado"}</Eyebrow>
          <ul className="mt-2 grid grid-cols-1 gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
            {absent.map((p) => (
              <li key={p.id} className="text-white">
                {p.name}
                <span className="text-slate-400">
                  {" "}
                  · {p.absence}
                  {p.absenceDetail && `: ${p.absenceDetail}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="px-4 py-4 text-xs leading-relaxed text-slate-400 md:px-8">
        {LEGEND[mode]} Toca una cabecera para ordenar y un jugador para ver su partido.
      </p>
    </div>
  );
}

function PlayerRow({
  player,
  columns,
  best,
  accent,
  onOpen,
}: {
  player: PlayerLine;
  columns: Column[];
  best: Map<string, number>;
  accent: string;
  onOpen: () => void;
}) {
  const badge = doubleDouble(player);
  return (
    <tr className="group/row border-b border-slate-800/80 transition-colors hover:bg-slate-900">
      <th scope="row" className="sticky left-0 z-[1] bg-slate-950 py-1.5 pl-4 pr-3 text-left font-normal transition-colors group-hover/row:bg-slate-900 md:pl-8">
        <button type="button" onClick={onOpen} className="flex items-center gap-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-orange-400">
          <span className="flex h-8 w-11 shrink-0 items-end overflow-hidden" style={{ background: `${accent}26` }}>
            <Image src={playerHeadshotUrl(player.id)} alt="" width={44} height={32} className="h-8 w-11 object-cover object-top" />
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 font-semibold text-white group-hover/row:text-orange-400">
              {player.onCourt && <span title="En pista" className="size-1.5 shrink-0 rounded-full bg-emerald-400" />}
              <span className="md:hidden">{player.short}</span>
              <span className="hidden md:inline">{player.name}</span>
            </span>
            <span className="block text-[11px] uppercase tracking-wide text-slate-400">
              {[player.position, player.jersey && `#${player.jersey}`].filter(Boolean).join(" · ")}
              {badge && <span className="ml-1.5 font-semibold normal-case text-orange-400">{badge}</span>}
            </span>
          </span>
        </button>
      </th>
      {columns.map((column) => {
        const top = column.best && column.value(player) > 0 && column.value(player) === best.get(column.key);
        return (
          <td key={column.key} className={cn("px-2 py-1.5 text-right last:pr-4 md:last:pr-8", top ? "font-bold text-white" : "text-slate-300")}>
            {column.text(player)}
          </td>
        );
      })}
    </tr>
  );
}
