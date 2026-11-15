"use client";

/* eslint-disable @next/next/no-img-element -- html-to-image necesita <img> planas del mismo origen */
import type { CardView } from "@/components/games/LiveGameCard";
import { CARD_SIZE, SocialCardExporter, WATERMARK_HEIGHT, type CardFormat } from "@/components/share/SocialCardExporter";
import { formatDayMonth, formatGameTime, formatWeekday, madridDayIfDifferent, type GameMatchup, type TeamLite } from "@/lib/game-day";
import { sameOrigin, teamLogoUrl } from "@/lib/nba-cdn";
import { EXCITEMENT_TONE_CLASSES, formatExcitementScore, getExcitementTone, type SpoilerLevel } from "@/lib/spoilers";
import { cn } from "@/lib/utils";

/** Un partido de la jornada con lo que puede verse en el nivel actual (ya filtrado por `GameDay`). */
export type DayCardGame = { game: GameMatchup; away: TeamLite | undefined; home: TeamLite | undefined; view: CardView };

type Props = { day: string; level: SpoilerLevel; games: DayCardGame[] };

const SUBTITLE: Record<SpoilerLevel, string> = {
  1: "Horarios · Hora de España",
  2: "Notas de espectáculo · Sin spoilers",
  3: "Resultados",
};

const INCLUDES: Record<SpoilerLevel, string[]> = {
  1: ["Todos los partidos de la jornada", "Hora de España", "Sin notas ni resultados"],
  2: ["Todos los partidos de la jornada", "Nota de espectáculo de cada uno", "Sin marcadores ni ganadores"],
  3: ["Todos los partidos de la jornada", "Marcadores", "Nota de espectáculo"],
};

/** Botón de exportación de la jornada (lo que se ve en pantalla con el nivel de spoilers actual). */
export function DayCardExport({ className, ...props }: Props & { className?: string }) {
  const { day, level } = props;
  return (
    <SocialCardExporter
      className={className}
      fileName={`jornada-${day}`}
      caption={SUBTITLE[level]}
      title={`Jornada del ${formatWeekday(day, "long")} ${formatDayMonth(day)}`}
      includes={INCLUDES[level]}
      spoiler={level === 3}
      renderCard={(format) => <DayShareCard format={format} {...props} />}
    />
  );
}

function DayShareCard({ format, day, level, games }: Props & { format: CardFormat }) {
  const vertical = format === "9:16";
  const contentHeight = CARD_SIZE[format].height - WATERMARK_HEIGHT[format];
  const header = vertical ? 300 : 210;
  // En horizontal, a partir de 6 partidos, dos columnas
  const columns = !vertical && games.length > 6 ? 2 : 1;
  const perColumn = Math.ceil(games.length / columns);
  const rowHeight = Math.min(vertical ? 150 : 170, Math.floor((contentHeight - header - 60) / Math.max(perColumn, 1)));
  const lists = Array.from({ length: columns }, (_, i) => games.slice(i * perColumn, (i + 1) * perColumn));

  return (
    <div className="absolute inset-0 overflow-hidden bg-[radial-gradient(ellipse_at_top,#1e293b_0%,#020617_65%)]">
      <div className="flex flex-col" style={{ height: contentHeight }}>
        <header className={cn("shrink-0 border-b-4 border-orange-500", vertical ? "px-16 pt-24" : "px-20 pt-16")} style={{ height: header }}>
          <p className="font-display text-3xl font-semibold uppercase tracking-[0.3em] text-orange-400">Jornada NBA · {SUBTITLE[level]}</p>
          <p className={cn("mt-3 font-display font-extrabold uppercase leading-none text-white", vertical ? "text-8xl" : "text-7xl")}>
            {formatWeekday(day, "long")} {formatDayMonth(day)}
          </p>
        </header>
        <div className={cn("flex flex-1 gap-12", vertical ? "px-16 pt-8" : "px-20 pt-6")}>
          {lists.map((list, i) => (
            <ul key={i} className="flex-1">
              {list.map((item) => (
                <DayRow key={item.game.id} item={item} day={day} height={rowHeight} />
              ))}
            </ul>
          ))}
        </div>
      </div>
    </div>
  );
}

function DayRow({ item, day, height }: { item: DayCardGame; day: string; height: number }) {
  const { game, away, home, view } = item;
  const result = view.level === 3 ? view.result : undefined;
  const final = result?.status === "Final";
  const awayWins = final && (result.away.score ?? 0) > (result.home.score ?? 0);
  const homeWins = final && (result.home.score ?? 0) > (result.away.score ?? 0);
  const madrugada = madridDayIfDifferent(game.game_datetime_utc, day);
  const logo = Math.round(height * 0.38);
  const text = Math.round(height * 0.31);

  return (
    <li className="flex items-center gap-8 border-b-2 border-white/10" style={{ height }}>
      <div className="w-40 shrink-0 font-display uppercase leading-none">
        {result && result.status !== "Scheduled" ? (
          <span className={cn("font-bold", result.status === "Live" ? "text-red-400" : "text-slate-300")} style={{ fontSize: text * 0.8 }}>
            {result.status === "Live" ? "En juego" : "Final"}
          </span>
        ) : (
          <>
            <span className="block font-bold text-white" style={{ fontSize: text }}>
              {formatGameTime(game.game_datetime_utc)}
            </span>
            {madrugada && (
              <span className="mt-1 block font-semibold text-slate-400" style={{ fontSize: text * 0.55 }}>
                {madrugada}
              </span>
            )}
          </>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
        {[
          { team: away, score: result?.away.score, dimmed: homeWins },
          { team: home, score: result?.home.score, dimmed: awayWins },
        ].map(({ team, score, dimmed }, i) => (
          <div key={i} className="flex items-center gap-4">
            <span className="w-2 shrink-0 self-stretch" style={{ background: team?.accent ?? "#475569" }} />
            {team && <img src={sameOrigin(teamLogoUrl(team.id))} alt="" style={{ width: logo, height: logo }} />}
            <span className={cn("font-display font-extrabold uppercase leading-none", dimmed ? "text-white/55" : "text-white")} style={{ fontSize: text }}>
              {team?.abbreviation ?? "—"}
            </span>
            {result && result.status !== "Scheduled" && (
              <span className={cn("ml-auto font-display font-extrabold tabular-nums leading-none", dimmed ? "text-white/55" : "text-white")} style={{ fontSize: text }}>
                {score ?? "–"}
              </span>
            )}
          </div>
        ))}
      </div>
      <Badge view={view} size={text} />
    </li>
  );
}

/** Nota de espectáculo (Niveles 2 y 3); nada en Nivel 1 ni si aún no existe. */
function Badge({ view, size }: { view: CardView; size: number }) {
  const score = view.level === 2 ? view.score : view.level === 3 && view.result?.status === "Final" ? view.result.excitementScore : undefined;
  if (score === undefined || score === null) return null;
  return (
    <span
      className={cn("flex shrink-0 items-center justify-center px-4 py-2 font-display font-extrabold leading-none ring-4", EXCITEMENT_TONE_CLASSES[getExcitementTone(score)])}
      style={{ fontSize: size * 1.05, minWidth: size * 2.6 }}
    >
      {formatExcitementScore(score)}
    </span>
  );
}
