"use client";

/* eslint-disable @next/next/no-img-element -- html-to-image necesita <img> planas del mismo origen */
import { gradeClass } from "@/components/gm/TradeEvaluationCard";
import { CARD_SIZE, SocialCardExporter, WATERMARK_HEIGHT, type CardFormat } from "@/components/share/SocialCardExporter";
import { pickLabel, type GmTeam, type TradeEvaluation } from "@/lib/gm";
import { playerHeadshotUrl, sameOrigin, teamLogoUrl } from "@/lib/nba-cdn";
import { formatMoney, SEASON, verdictTitle, type Trade, type TradeVerdict } from "@/lib/trade-rules";
import { cn } from "@/lib/utils";

type ShareProps = {
  teams: GmTeam[];
  trade: Trade;
  verdict: TradeVerdict;
  evaluation: TradeEvaluation | null;
};

// Lo que cabe sin que la letra quede pequeña; el resto se resume en "+N más"
const MAX_ASSETS = { "16:9": 4, "9:16": 3 };

const HEADER_HEIGHT = { "16:9": 152, "9:16": 176 };
const MAX_PHOTO_HEIGHT = 330;
const MIN_PHOTO_HEIGHT = 88;
const PHOTO_RATIO = 1040 / 760;
// Alturas fijas de cada bloque de una columna, para repartir el resto entre las fotos
const COLUMN_PADDING = 64;
const TEAM_HEADER_HEIGHT = 130;
const GRADE_HEIGHT = 90;
const PICK_ROW_HEIGHT = 66;
const PLAYER_ROW_GAP = 30;

/** Altura de las fotos: cuantos menos activos, más grande. Así un 1 por 1 llena la tarjeta igual que un traspaso masivo. */
function photoHeight(format: CardFormat, teamCount: number, players: number, rows: number, graded: boolean): number {
  const body = CARD_SIZE[format].height - WATERMARK_HEIGHT[format] - HEADER_HEIGHT[format];
  const column = format === "9:16" ? body / teamCount : body;
  const free = column - COLUMN_PADDING - TEAM_HEADER_HEIGHT - (graded ? GRADE_HEIGHT : 0) - (rows - players) * PICK_ROW_HEIGHT;
  return Math.round(Math.min(MAX_PHOTO_HEIGHT, Math.max(MIN_PHOTO_HEIGHT, free / Math.max(players, 1) - PLAYER_ROW_GAP)));
}

const VERDICT_CLASS: Record<TradeVerdict["status"], string> = {
  empty: "bg-slate-700 text-white",
  valid: "bg-emerald-400 text-slate-950",
  valid_from: "bg-amber-400 text-slate-950",
  invalid: "bg-red-500 text-white",
};

/** Botón de exportación de la tarjeta del traspaso. */
export function TradeCardExport(props: ShareProps) {
  return (
    <SocialCardExporter
      fileName={`traspaso-${props.teams.map((team) => team.abbreviation).join("-")}`.toLowerCase()}
      caption={`Traspaso simulado · ${SEASON}`}
      renderCard={(format) => <TradeShareCard format={format} {...props} />}
    />
  );
}

function TradeShareCard({ format, teams, trade, verdict, evaluation }: ShareProps & { format: CardFormat }) {
  const vertical = format === "9:16";
  const contentHeight = CARD_SIZE[format].height - WATERMARK_HEIGHT[format];

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden bg-slate-950" style={{ height: contentHeight }}>
      <header style={{ height: HEADER_HEIGHT[format] }} className={cn("flex shrink-0 items-center justify-between gap-8 border-b-4 border-orange-500", vertical ? "px-14" : "px-16")}>
        <div className="min-w-0">
          <p className="font-display text-2xl font-semibold uppercase tracking-[0.3em] text-orange-400">GM Virtual</p>
          <p className="font-display text-6xl font-extrabold uppercase leading-none text-white">Traspaso simulado</p>
        </div>
        <span className={cn("shrink-0 px-6 py-3 font-display font-extrabold uppercase leading-none", vertical ? "text-4xl" : "text-5xl", VERDICT_CLASS[verdict.status])}>
          {verdictTitle(verdict)}
        </span>
      </header>

      <div className={cn("flex min-h-0 flex-1", vertical && "flex-col")}>
        {teams.map((team) => (
          <TeamColumn key={team.id} team={team} teams={teams} trade={trade} evaluation={evaluation} format={format} />
        ))}
      </div>
    </div>
  );
}

function TeamColumn({ team, teams, trade, evaluation, format }: { team: GmTeam; teams: GmTeam[]; trade: Trade; evaluation: TradeEvaluation | null; format: CardFormat }) {
  const vertical = format === "9:16";
  const players = trade.players.filter((move) => move.to === team.id).map((move) => move.player).sort((a, b) => b.salary - a.salary);
  const picks = trade.picks.filter((move) => move.to === team.id).map((move) => move.pick);
  const shown = players.slice(0, MAX_ASSETS[format]);
  const shownPicks = picks.slice(0, Math.max(0, MAX_ASSETS[format] - shown.length));
  const hidden = players.length + picks.length - shown.length - shownPicks.length;
  const grade = evaluation?.teams.find((entry) => entry.teamId === team.id);
  const abbreviation = (teamId: number) => teams.find((t) => t.id === teamId)?.abbreviation;

  const rows = shown.length + shownPicks.length + (hidden > 0 ? 1 : 0);
  const photo = photoHeight(format, teams.length, shown.length, rows, !!grade);
  const nameSize = Math.round(Math.min(72, Math.max(36, photo * 0.3)));

  return (
    <section
      className={cn("relative min-h-0 min-w-0 flex-1 overflow-hidden", vertical ? "border-b-2 border-slate-800 px-14 py-8" : "border-r-2 border-slate-800 px-10 py-8 last:border-r-0")}
      style={{ background: `linear-gradient(160deg, ${team.primary} 0%, ${team.primary}99 30%, #020617 80%)` }}
    >
      <div className="absolute inset-0 bg-slate-950/45" />
      <img src={sameOrigin(teamLogoUrl(team.id))} alt="" className="absolute -right-24 -top-16 size-[460px] opacity-[0.12]" />

      <div className="relative flex h-full flex-col">
        <div className="flex items-center gap-6">
          <img src={sameOrigin(teamLogoUrl(team.id))} alt="" className="size-28 shrink-0 drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)]" />
          <div className="min-w-0 flex-1">
            <p className="font-display text-2xl font-semibold uppercase tracking-[0.3em] text-white/75">Recibe</p>
            <p className="font-display text-5xl font-extrabold uppercase leading-[0.95] text-white">{team.name}</p>
          </div>
          {grade && <span className={cn("flex size-28 shrink-0 items-center justify-center font-display text-7xl font-extrabold", gradeClass(grade.grade))}>{grade.grade}</span>}
        </div>

        <ul className="mt-4 flex min-h-0 flex-1 flex-col justify-center gap-2">
          {shown.map((player) => (
            <li key={player.id} className="flex items-center gap-6 border-t-2 border-white/15 pt-2">
              <img
                src={sameOrigin(playerHeadshotUrl(player.id))}
                alt=""
                className="shrink-0 object-cover object-top"
                style={{ height: photo, width: Math.round(photo * PHOTO_RATIO) }}
              />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 font-display font-extrabold uppercase leading-[0.95] text-white" style={{ fontSize: nameSize }}>
                  {player.name}
                </span>
                <span className="mt-2 block font-display font-semibold leading-none text-white/85 tabular-nums" style={{ fontSize: Math.round(nameSize * 0.75) }}>
                  {player.salaryStatus === "approx" && "≈"}
                  {formatMoney(player.salary)}
                  {/* Una estimación del usuario nunca sale en la imagen como si fuera el salario real */}
                  {player.salaryStatus === "estimated" && <span className="ml-3 align-middle text-[0.55em] font-bold uppercase tracking-[0.2em] text-amber-300">Estimación</span>}
                </span>
              </span>
            </li>
          ))}
          {shownPicks.map((pick) => (
            <li key={`${pick.teamId}-${pick.year}-${pick.round}`} className="flex items-baseline justify-between gap-5 border-t-2 border-white/15 py-2">
              <span className="font-display text-4xl font-bold uppercase leading-none text-white">{pickLabel(pick)}</span>
              <span className="font-display text-3xl font-semibold uppercase text-white/80">de {abbreviation(pick.teamId)}</span>
            </li>
          ))}
          {hidden > 0 && <li className="border-t-2 border-white/15 pt-2 font-display text-3xl font-semibold uppercase text-white/80">+{hidden} más</li>}
          {players.length + picks.length === 0 && <li className="border-t-2 border-white/15 pt-3 font-display text-3xl font-semibold uppercase text-white/70">Sin activos</li>}
        </ul>

        {grade && <p className={cn("line-clamp-2 shrink-0 pt-3 font-display font-bold uppercase leading-tight text-white", vertical ? "text-3xl" : "text-[28px]")}>{grade.headline}</p>}
      </div>
    </section>
  );
}
