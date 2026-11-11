import type { ReactNode } from "react";
import Image from "next/image";
import { GameFlowChart } from "@/components/games/detail/GameFlowChart";
import { Eyebrow, Section, Swatch } from "@/components/games/detail/ui";
import type { GameDetail, PlayerLine, ScoringRun, TeamBox, TeamTotals } from "@/lib/game-detail";
import {
  decimal,
  doubleDouble,
  duration,
  minutes,
  pct,
  periodName,
  playerOfTheGame,
  scoringOrigin,
  shooting,
  signed,
  teamLeader,
  type MatchupTeam,
} from "@/lib/game-format";
import { playerHeadshotUrl, teamLogoUrl } from "@/lib/nba-cdn";
import { cn } from "@/lib/utils";

type SummaryProps = {
  detail: GameDetail;
  away: MatchupTeam;
  home: MatchupTeam;
  onOpenPlayer: (playerId: number) => void;
};

/** Pestaña "Resumen": lo esencial del partido de un vistazo. */
export function GameSummary({ detail, away, home, onOpenPlayer }: SummaryProps) {
  return (
    <>
      {/* grid-cols-1 (minmax(0, 1fr)): los nombres largos se recortan en vez de ensanchar la columna */}
      <div className="grid grid-cols-1 divide-y divide-slate-800 border-b border-slate-800 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:divide-x lg:divide-y-0">
        <StarPlayer detail={detail} away={away} home={home} onOpenPlayer={onOpenPlayer} />
        <Leaders detail={detail} away={away} home={home} onOpenPlayer={onOpenPlayer} />
      </div>

      <Section title="Flujo del partido">
        <GameFlowChart detail={detail} away={away} home={home} />
        <FlowFacts detail={detail} away={away} home={home} />
      </Section>

      <div className="grid grid-cols-1 divide-y divide-slate-800 border-b border-slate-800 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        <TeamComparison detail={detail} away={away} home={home} />
        <div className="divide-y divide-slate-800">
          <ScoringOrigin detail={detail} away={away} home={home} />
          <Efficiency detail={detail} away={away} home={home} />
        </div>
      </div>

      <GameInfo detail={detail} />
    </>
  );
}

function teamColors(team: TeamBox, away: MatchupTeam, home: MatchupTeam): MatchupTeam {
  return team.id === home.id ? home : away;
}

function StarPlayer({ detail, away, home, onOpenPlayer }: SummaryProps) {
  const star = playerOfTheGame(detail);
  if (!star) return null;
  const { player } = star;
  const team = teamColors(star.team, away, home);
  const badge = doubleDouble(player);

  return (
    <Section title={detail.status === "Final" ? "Jugador del partido" : "El mejor, por ahora"} accent={team.accent} className="border-b-0">
      <button
        type="button"
        onClick={() => onOpenPlayer(player.id)}
        className="group flex w-full items-end gap-2 overflow-hidden text-left outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
        style={{ background: `linear-gradient(110deg, ${team.primary}73 0%, ${team.primary}26 45%, transparent 80%)` }}
      >
        <Image
          src={playerHeadshotUrl(player.id)}
          alt=""
          width={260}
          height={190}
          className="h-32 w-auto shrink-0 drop-shadow-[0_8px_20px_rgba(0,0,0,0.5)] sm:h-44"
        />
        <div className="min-w-0 pb-4 pr-4">
          <p className="flex items-center gap-2 font-display text-[11px] font-semibold uppercase tracking-[0.25em] text-white/75">
            <Image src={teamLogoUrl(team.id)} alt="" width={16} height={16} unoptimized className="size-4" />
            {[team.abbreviation, player.position].filter(Boolean).join(" · ")}
          </p>
          <p className="mt-1 font-display text-2xl font-extrabold uppercase leading-none text-white transition-colors group-hover:text-orange-300 sm:text-4xl">
            {player.name}
          </p>
          <dl className="mt-3 flex gap-5">
            {(
              [
                ["Puntos", player.pts],
                ["Rebotes", player.reb],
                ["Asist.", player.ast],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70">{label}</dt>
                <dd className="font-display text-4xl font-extrabold leading-none text-white">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </button>
      <p className="mt-3 text-sm text-slate-300">
        TC {shooting(player.fgm, player.fga)} · T3 {shooting(player.fg3m, player.fg3a)} · TL {shooting(player.ftm, player.fta)} · +/-{" "}
        {signed(player.plusMinus)} · Valoración <span className="font-semibold text-white">{decimal(player.gameScore)}</span>
        {badge && <span className="ml-2 font-semibold text-orange-400">{badge}</span>}
      </p>
    </Section>
  );
}

const LEADER_STATS: { label: string; value: (p: PlayerLine) => number }[] = [
  { label: "Puntos", value: (p) => p.pts },
  { label: "Rebotes", value: (p) => p.reb },
  { label: "Asistencias", value: (p) => p.ast },
  { label: "Triples", value: (p) => p.fg3m },
  { label: "Robos + tapones", value: (p) => p.stl + p.blk },
];

function TeamsHeader({ away, home }: { away: MatchupTeam; home: MatchupTeam }) {
  return (
    <div className="flex items-center justify-between pb-2 font-display text-sm font-bold uppercase tracking-wide text-white">
      {[away, home].map((team, i) => (
        <span key={team.id} className={cn("flex items-center gap-2", i === 1 && "flex-row-reverse")}>
          <Image src={teamLogoUrl(team.id)} alt="" width={24} height={24} unoptimized className="size-6" />
          {team.abbreviation}
          <Swatch color={team.accent} />
        </span>
      ))}
    </div>
  );
}

function Leaders({ detail, away, home, onOpenPlayer }: SummaryProps) {
  return (
    <Section title="Líderes" className="border-b-0">
      <TeamsHeader away={away} home={home} />
      <ul className="divide-y divide-slate-800/80 border-t border-slate-800">
        {LEADER_STATS.map((stat) => {
          const awayLeader = teamLeader(detail.away, stat.value);
          const homeLeader = teamLeader(detail.home, stat.value);
          const awayValue = awayLeader ? stat.value(awayLeader) : 0;
          const homeValue = homeLeader ? stat.value(homeLeader) : 0;
          return (
            <li key={stat.label} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 py-2.5 sm:gap-3">
              <LeaderCell player={awayLeader} value={awayValue} leads={awayValue >= homeValue} accent={away.accent} onOpen={onOpenPlayer} />
              <span className="w-20 text-center font-display text-[11px] font-semibold uppercase leading-tight tracking-[0.15em] text-slate-300 sm:w-28">
                {stat.label}
              </span>
              <LeaderCell player={homeLeader} value={homeValue} leads={homeValue >= awayValue} accent={home.accent} onOpen={onOpenPlayer} right />
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function LeaderCell({
  player,
  value,
  leads,
  accent,
  onOpen,
  right,
}: {
  player: PlayerLine | null;
  value: number;
  leads: boolean;
  accent: string;
  onOpen: (playerId: number) => void;
  right?: boolean;
}) {
  if (!player) return <span className={cn("font-display text-2xl font-bold text-slate-600", right && "text-right")}>–</span>;
  return (
    <button
      type="button"
      onClick={() => onOpen(player.id)}
      className={cn("group flex min-w-0 items-center gap-2.5 outline-none focus-visible:ring-2 focus-visible:ring-orange-400", right && "flex-row-reverse text-right")}
    >
      <span className="flex h-10 w-14 shrink-0 items-end overflow-hidden" style={{ background: `${accent}26` }}>
        <Image src={playerHeadshotUrl(player.id)} alt="" width={56} height={40} className="h-10 w-14 object-cover object-top" />
      </span>
      <span className="min-w-0">
        <span className={cn("block font-display text-3xl font-extrabold leading-none", leads ? "text-white" : "text-slate-400")}>{value}</span>
        <span className="block truncate text-xs text-slate-300 transition-colors group-hover:text-orange-400">{player.short}</span>
      </span>
    </button>
  );
}

function runText(run: ScoringRun, regulation: number): string {
  const { from, to } = run;
  return from.period === to.period
    ? `${periodName(from.period, regulation)}, ${from.clock}–${to.clock}`
    : `${periodName(from.period, regulation)} ${from.clock} – ${periodName(to.period, regulation).toLowerCase()} ${to.clock}`;
}

function FlowFacts({ detail, away, home }: { detail: GameDetail; away: MatchupTeam; home: MatchupTeam }) {
  const sides = [
    { team: away, box: detail.away },
    { team: home, box: detail.home },
  ];
  return (
    <dl className="mt-6 grid grid-cols-2 border-l border-t border-slate-800 sm:grid-cols-3 lg:grid-cols-5">
      <Fact label="Cambios de líder">{detail.leadChanges}</Fact>
      <Fact label="Empates">{detail.timesTied}</Fact>
      <Fact label="Mayor ventaja">
        {sides.map(({ team, box }) => (
          <TeamValue key={team.id} team={team}>
            {box.totals.biggestLead > 0 ? `+${box.totals.biggestLead}` : "–"}
          </TeamValue>
        ))}
      </Fact>
      <Fact label="Mayor parcial">
        {sides.map(({ team, box }) => (
          <TeamValue key={team.id} team={team} note={box.run ? runText(box.run, detail.regulationPeriods) : undefined}>
            {box.run ? `${box.run.points}-0` : "–"}
          </TeamValue>
        ))}
      </Fact>
      <Fact label="Tiempo por delante">
        {sides.map(({ team, box }) => (
          <TeamValue key={team.id} team={team}>
            {minutes(box.totals.timeLeadingS)}
          </TeamValue>
        ))}
      </Fact>
    </dl>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-b border-r border-slate-800 px-4 py-3">
      <dt className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300">{label}</dt>
      <dd className="mt-1 font-display text-3xl font-extrabold leading-none text-white">{children}</dd>
    </div>
  );
}

function TeamValue({ team, note, children }: { team: MatchupTeam; note?: string; children: ReactNode }) {
  return (
    <span className="mt-1 flex items-baseline gap-2 first:mt-0" title={note}>
      <span className="flex w-12 shrink-0 items-center gap-1.5 font-display text-xs font-bold uppercase text-slate-300">
        <Swatch color={team.accent} className="size-2" />
        {team.abbreviation}
      </span>
      <span className="text-2xl">{children}</span>
    </span>
  );
}

type CompareRow = { label: string; away: number; home: number; awayText?: string; homeText?: string; lowerIsBetter?: boolean };

function shootingRow(label: string, made: [number, number], attempts: [number, number]): CompareRow {
  const [awayPct, homePct] = [0, 1].map((i) => (attempts[i] ? made[i] / attempts[i] : 0));
  return {
    label,
    away: awayPct,
    home: homePct,
    awayText: `${made[0]}/${attempts[0]} · ${pct(awayPct)}%`,
    homeText: `${pct(homePct)}% · ${made[1]}/${attempts[1]}`,
  };
}

function compareRows(a: TeamTotals, h: TeamTotals): CompareRow[] {
  const row = (label: string, key: keyof TeamTotals, lowerIsBetter = false): CompareRow => ({
    label,
    away: Number(a[key]) || 0,
    home: Number(h[key]) || 0,
    lowerIsBetter,
  });
  return [
    shootingRow("Tiros de campo", [a.fgm, h.fgm], [a.fga, h.fga]),
    shootingRow("Triples", [a.fg3m, h.fg3m], [a.fg3a, h.fg3a]),
    shootingRow("Tiros libres", [a.ftm, h.ftm], [a.fta, h.fta]),
    row("Rebotes", "reb"),
    row("Rebotes ofensivos", "oreb"),
    row("Asistencias", "ast"),
    row("Pérdidas", "tov", true),
    row("Robos", "stl"),
    row("Tapones", "blk"),
    row("Puntos en la pintura", "paintPts"),
    row("Puntos al contraataque", "fastBreakPts"),
    row("Segundas oportunidades", "secondChancePts"),
    row("Puntos tras pérdida rival", "pointsOffTurnovers"),
    row("Puntos del banquillo", "benchPts"),
    row("Faltas personales", "pf", true),
  ];
}

function TeamComparison({ detail, away, home }: { detail: GameDetail; away: MatchupTeam; home: MatchupTeam }) {
  return (
    <Section title="Cara a cara" className="border-b-0">
      <TeamsHeader away={away} home={home} />
      <ul className="border-t border-slate-800">
        {compareRows(detail.away.totals, detail.home.totals).map((row) => {
          const total = row.away + row.home;
          const awayShare = total > 0 ? (row.away / total) * 100 : 50;
          const awayBetter = row.lowerIsBetter ? row.away <= row.home : row.away >= row.home;
          const homeBetter = row.lowerIsBetter ? row.home <= row.away : row.home >= row.away;
          return (
            <li key={row.label} className="border-b border-slate-800/80 py-2.5">
              <div className="flex items-baseline justify-between gap-3 font-display tabular-nums">
                <span className={cn("text-lg font-bold", awayBetter ? "text-white" : "text-slate-400")}>{row.awayText ?? row.away}</span>
                <span className="text-center text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-300">{row.label}</span>
                <span className={cn("text-right text-lg font-bold", homeBetter ? "text-white" : "text-slate-400")}>{row.homeText ?? row.home}</span>
              </div>
              {/* Reparto entre los dos equipos, con un hueco del color del fondo en la unión */}
              <div className="mt-1.5 flex h-1.5 gap-0.5" aria-hidden>
                {total > 0 ? (
                  <>
                    <span className="rounded-l-full" style={{ width: `${awayShare}%`, background: away.accent }} />
                    <span className="flex-1 rounded-r-full" style={{ background: home.accent }} />
                  </>
                ) : (
                  <span className="flex-1 rounded-full bg-slate-800" />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function ScoringOrigin({ detail, away, home }: { detail: GameDetail; away: MatchupTeam; home: MatchupTeam }) {
  return (
    <Section title="Origen de los puntos" className="border-b-0">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {[
          { team: away, box: detail.away },
          { team: home, box: detail.home },
        ].map(({ team, box }) => {
          const parts = scoringOrigin(box.totals);
          const total = box.totals.pts || 1;
          return (
            <div key={team.id}>
              <p className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide text-white">
                <Image src={teamLogoUrl(team.id)} alt="" width={20} height={20} unoptimized className="size-5" />
                {team.abbreviation}
                <span className="ml-auto text-slate-400">{box.totals.pts} pts</span>
              </p>
              <ul className="mt-2 space-y-2.5">
                {parts.map((part) => (
                  <li key={part.label}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="text-slate-300">{part.label}</span>
                      <span className="font-display tabular-nums">
                        <span className="text-lg font-bold text-white">{part.points}</span>
                        <span className="ml-1.5 text-xs text-slate-400">{Math.round((part.points / total) * 100)}%</span>
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 bg-slate-800" aria-hidden>
                      <div className="h-full rounded-r-full" style={{ width: `${(part.points / total) * 100}%`, background: team.accent }} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

const METRICS: { label: string; hint: string; value: (t: TeamTotals) => number | null; text: (v: number | null) => string; lowerIsBetter?: boolean }[] = [
  { label: "Rating ofensivo", hint: "Puntos por cada 100 posesiones", value: (t) => t.offRtg, text: (v) => decimal(v) },
  {
    label: "Net rating",
    hint: "Diferencia de puntos por cada 100 posesiones",
    value: (t) => (t.offRtg !== null && t.defRtg !== null ? t.offRtg - t.defRtg : null),
    text: (v) => (v === null ? "–" : `${v > 0 ? "+" : ""}${v.toFixed(1)}`),
  },
  { label: "eFG%", hint: "Acierto de campo con el triple valiendo 1,5 tiros", value: (t) => t.efgPct, text: (v) => pct(v) },
  { label: "TS%", hint: "Acierto real: también cuenta los tiros libres", value: (t) => t.tsPct, text: (v) => pct(v) },
  { label: "% de pérdidas", hint: "Balones perdidos por cada 100 jugadas", value: (t) => t.tovPct, text: (v) => pct(v), lowerIsBetter: true },
  { label: "% de rebote ofensivo", hint: "Rebotes de ataque cogidos de los posibles", value: (t) => t.orbPct, text: (v) => pct(v) },
  { label: "Tiros libres por tiro", hint: "Libres anotados por cada tiro de campo", value: (t) => t.ftRate, text: (v) => decimal(v, 2) },
];

/** Ritmo y "cuatro factores" de Dean Oliver, explicados para cualquier aficionado. */
function Efficiency({ detail, away, home }: { detail: GameDetail; away: MatchupTeam; home: MatchupTeam }) {
  return (
    <Section title="Ritmo y eficiencia" className="border-b-0">
      <div className="flex flex-wrap gap-x-10 gap-y-3">
        <div>
          <Eyebrow>Ritmo</Eyebrow>
          <p className="font-display text-4xl font-extrabold text-white">{decimal(detail.pace)}</p>
          <p className="text-xs text-slate-400">posesiones por equipo cada 48 min</p>
        </div>
        <div>
          <Eyebrow>Posesiones</Eyebrow>
          <p className="font-display text-4xl font-extrabold text-white">{decimal(detail.away.totals.possessions, 0)}</p>
          <p className="text-xs text-slate-400">de cada equipo en el partido</p>
        </div>
      </div>

      <table className="mt-5 w-full text-sm tabular-nums">
        <thead className="border-b border-slate-800">
          <tr className="font-display text-xs font-semibold uppercase tracking-wider text-slate-300">
            <th scope="col" className="py-2 text-left font-semibold">
              Métrica
            </th>
            {[away, home].map((team) => (
              <th key={team.id} scope="col" className="w-16 py-2 text-right font-semibold">
                <span className="inline-flex items-center gap-1.5">
                  <Swatch color={team.accent} className="size-2" />
                  {team.abbreviation}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {METRICS.map((metric) => {
            const values = [metric.value(detail.away.totals), metric.value(detail.home.totals)];
            const valid = values.filter((v): v is number => v !== null);
            const best = valid.length === 2 ? (metric.lowerIsBetter ? Math.min(...valid) : Math.max(...valid)) : null;
            return (
              <tr key={metric.label} className="border-b border-slate-800/80">
                <th scope="row" className="py-2 pr-3 text-left font-normal">
                  <span className="block font-semibold text-white">{metric.label}</span>
                  <span className="block text-xs text-slate-400">{metric.hint}</span>
                </th>
                {values.map((value, i) => (
                  <td key={i} className={cn("py-2 text-right font-display text-lg", value === best ? "font-bold text-white" : "text-slate-400")}>
                    {metric.text(value)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </Section>
  );
}

function GameInfo({ detail }: { detail: GameDetail }) {
  const items = [
    { label: "Pabellón", value: detail.arena && [detail.arena, detail.city].filter(Boolean).join(", ") },
    {
      label: "Asistencia",
      value: detail.attendance && `${detail.attendance.toLocaleString("es-ES")} espectadores${detail.sellout ? " · lleno" : ""}`,
    },
    { label: "Duración", value: detail.durationMin && duration(detail.durationMin) },
    { label: "Árbitros", value: detail.officials.length > 0 && detail.officials.join(" · ") },
  ].filter((item): item is { label: string; value: string } => typeof item.value === "string");
  if (items.length === 0) return null;

  return (
    <Section title="Datos del partido">
      <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <div key={item.label}>
            <dt className="font-display text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">{item.label}</dt>
            <dd className="mt-0.5 text-sm text-white">{item.value}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}
