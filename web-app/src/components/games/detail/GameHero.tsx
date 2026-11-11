import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { EyeOff } from "lucide-react";
import { Placeholder } from "@/components/games/detail/ui";
import type { GameDetail } from "@/lib/game-detail";
import {
  formatDayMonth,
  formatGameTime,
  formatWeekday,
  madridDayIfDifferent,
  periodLabel,
  type GameMatchup,
  type GameResult,
} from "@/lib/game-day";
import type { MatchupTeam } from "@/lib/game-format";
import { teamLogoUrl } from "@/lib/nba-cdn";
import { EXCITEMENT_TONE_CLASSES, formatExcitementScore, getExcitementTone } from "@/lib/spoilers";
import { cn } from "@/lib/utils";

/**
 * Lo que puede verse en la cabecera según el nivel (`undefined` = cargando).
 * Nivel 2: `upcoming` = aún no ha empezado según la hora, así que no lleva hueco de nota.
 */
export type HeroView =
  | { level: 1 }
  | { level: 2; score: number | null | undefined; upcoming: boolean }
  | { level: 3; result: GameResult | undefined; detail: GameDetail | null | undefined };

type GameHeroProps = {
  game: GameMatchup;
  day: string;
  away: MatchupTeam;
  home: MatchupTeam;
  view: HeroView;
  /** Botón de exportar la tarjeta para redes. */
  children?: ReactNode;
};

/** Cabecera del partido: visitante a la izquierda y local a la derecha, cada uno sobre su color. */
export function GameHero({ game, day, away, home, view, children }: GameHeroProps) {
  const result = view.level === 3 ? view.result : undefined;
  const detail = view.level === 3 ? view.detail : undefined;
  const final = result?.status === "Final";
  const awayWins = final && (result.away.score ?? 0) > (result.home.score ?? 0);
  const homeWins = final && (result.home.score ?? 0) > (result.away.score ?? 0);
  const live = result?.status === "Live" && detail ? detail : null;

  return (
    <header className="relative overflow-hidden border-b border-slate-800">
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `linear-gradient(105deg, ${away.primary} 0%, ${away.primary}a6 20%, #020617 50%, ${home.primary}a6 80%, ${home.primary} 100%)`,
        }}
      />
      {/* Oscurece colores de franquicia claros para que el texto blanco siempre se lea */}
      <div aria-hidden className="absolute inset-0 bg-slate-950/50" />
      <Image
        src={teamLogoUrl(away.id)}
        alt=""
        width={420}
        height={420}
        unoptimized
        className="pointer-events-none absolute -left-24 top-1/2 size-[280px] -translate-y-1/2 opacity-[0.12] md:size-[420px]"
      />
      <Image
        src={teamLogoUrl(home.id)}
        alt=""
        width={420}
        height={420}
        unoptimized
        className="pointer-events-none absolute -right-24 top-1/2 size-[280px] -translate-y-1/2 opacity-[0.12] md:size-[420px]"
      />

      <div className="relative px-4 pb-6 pt-6 md:px-8 md:pb-8 md:pt-10">
        <p className="text-center font-display text-xs font-semibold uppercase tracking-[0.3em] text-white/75">
          Jornada NBA · {formatWeekday(day, "long")} {formatDayMonth(day)}
        </p>

        <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 md:gap-6">
          <TeamSide team={away} role="Visitante" dimmed={homeWins} live={live?.away} />
          <div className="flex min-w-[7.5rem] flex-col items-center px-1 text-center md:min-w-56">
            {view.level === 1 && <KickOff game={game} day={day} />}
            {view.level === 2 && <ScoreOnly game={game} day={day} score={view.score} upcoming={view.upcoming} />}
            {view.level === 3 && <ResultCenter game={game} day={day} result={result} awayWins={awayWins} homeWins={homeWins} />}
          </div>
          <TeamSide team={home} role="Local" align="right" dimmed={awayWins} live={live?.home} />
        </div>

        {result && result.status !== "Scheduled" && <QuarterTable result={result} away={away} home={home} />}

        {detail && (detail.arena || detail.attendance) && (
          <p className="mt-4 text-center text-xs text-white/70">
            {[
              detail.arena && [detail.arena, detail.city].filter(Boolean).join(", "),
              detail.attendance && `${detail.attendance.toLocaleString("es-ES")} espectadores${detail.sellout ? " (lleno)" : ""}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}

        {children && <div className="mt-6 flex justify-center">{children}</div>}
      </div>
      {/* Franja inferior: color de cada equipo en su lado */}
      <div aria-hidden className="relative flex h-1">
        <span className="flex-1" style={{ background: away.accent }} />
        <span className="flex-1" style={{ background: home.accent }} />
      </div>
    </header>
  );
}

function TeamSide({
  team,
  role,
  align = "left",
  dimmed,
  live,
}: {
  team: MatchupTeam;
  role: string;
  align?: "left" | "right";
  dimmed: boolean;
  live?: GameDetail["away"];
}) {
  const right = align === "right";
  return (
    <div className={cn("flex min-w-0 flex-col items-center gap-2 md:flex-row md:gap-5", right && "md:flex-row-reverse")}>
      <Link href={`/teams/${team.id}`} className="shrink-0" aria-label={team.name}>
        <Image
          src={teamLogoUrl(team.id)}
          alt=""
          width={112}
          height={112}
          unoptimized
          priority
          className={cn("size-14 drop-shadow-lg transition-opacity md:size-24 xl:size-28", dimmed && "opacity-60")}
        />
      </Link>
      <div className={cn("min-w-0 text-center", right ? "md:text-right" : "md:text-left")}>
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.25em] text-white/70">{role}</p>
        <Link
          href={`/teams/${team.id}`}
          className={cn(
            "block text-balance font-display text-2xl font-extrabold uppercase leading-none transition-colors hover:text-orange-300 md:text-3xl xl:text-4xl",
            dimmed ? "text-white/55" : "text-white"
          )}
        >
          <span className="lg:hidden">{team.abbreviation}</span>
          <span className="hidden lg:inline">{team.name}</span>
        </Link>
        {/* En directo: tiempos muertos que le quedan y si está en bonus */}
        {live && (
          <p className="mt-1.5 font-display text-xs font-semibold uppercase tracking-wider text-white/75">
            {live.timeoutsRemaining !== null && `${live.timeoutsRemaining} T. muertos`}
            {live.inBonus && <span className="ml-2 text-amber-300">Bonus</span>}
          </p>
        )}
      </div>
    </div>
  );
}

function KickOffTime({ game, day, className }: { game: GameMatchup; day: string; className?: string }) {
  const madrugada = madridDayIfDifferent(game.game_datetime_utc, day);
  return (
    <time dateTime={game.game_datetime_utc} className={cn("flex flex-col items-center font-display uppercase", className)}>
      <span className="text-5xl font-extrabold leading-none text-white md:text-7xl">{formatGameTime(game.game_datetime_utc)}</span>
      <span className="mt-1.5 text-[11px] font-semibold tracking-[0.25em] text-white/75">
        {madrugada ? `Hora de España · ${madrugada}` : "Hora de España"}
      </span>
    </time>
  );
}

/** Nivel 1: solo la hora. Ni nota, ni marcador, ni estado. */
function KickOff({ game, day }: { game: GameMatchup; day: string }) {
  return (
    <>
      <KickOffTime game={game} day={day} />
      <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 font-display text-xs font-bold uppercase tracking-wider text-emerald-400 ring-1 ring-emerald-500/40">
        <EyeOff className="size-3.5" />
        Sin spoilers
      </span>
    </>
  );
}

/** Nivel 2: la nota y su color. Nada más (ni si se está jugando, ni cómo va). */
function ScoreOnly({ game, day, score, upcoming }: { game: GameMatchup; day: string; score: number | null | undefined; upcoming: boolean }) {
  if (score === undefined) return <Placeholder className="h-24 w-28" />;
  if (score === null && upcoming) return <KickOffTime game={game} day={day} />;
  return (
    <>
      <BigScoreBadge score={score} />
      <span className="mt-2 font-display text-[11px] font-semibold uppercase tracking-[0.25em] text-white/75">Nota del partido</span>
    </>
  );
}

export function BigScoreBadge({ score }: { score: number | null }) {
  const tone = getExcitementTone(score);
  const formatted = formatExcitementScore(score);
  return (
    <span
      aria-label={tone === "pending" ? "Nota pendiente" : `Nota del partido: ${formatted} sobre 10`}
      className={cn(
        "inline-flex min-w-28 items-center justify-center px-4 py-2 font-display text-6xl font-extrabold leading-none ring-2 backdrop-blur-sm md:min-w-36 md:text-7xl",
        EXCITEMENT_TONE_CLASSES[tone]
      )}
    >
      {formatted}
    </span>
  );
}

function ResultCenter({
  game,
  day,
  result,
  awayWins,
  homeWins,
}: {
  game: GameMatchup;
  day: string;
  result: GameResult | undefined;
  awayWins: boolean;
  homeWins: boolean;
}) {
  if (!result) return <Placeholder className="h-24 w-44" />;
  if (result.status === "Scheduled") {
    return (
      <>
        <KickOffTime game={game} day={day} />
        <span className="mt-3 font-display text-xs font-bold uppercase tracking-wider text-white/75">Aún no ha empezado</span>
      </>
    );
  }

  const overtime = Math.max(result.home.periods.length, result.away.periods.length) - 4;
  return (
    <>
      <p className="flex items-baseline gap-2 font-display text-5xl font-extrabold leading-none md:gap-4 md:text-8xl">
        <span className={cn(homeWins ? "text-white/55" : "text-white")}>{result.away.score ?? 0}</span>
        <span aria-hidden className="text-3xl text-white/40 md:text-6xl">
          –
        </span>
        <span className={cn(awayWins ? "text-white/55" : "text-white")}>{result.home.score ?? 0}</span>
      </p>
      {result.status === "Live" ? (
        <p aria-live="polite" className="mt-3 flex items-center gap-2 font-display text-base font-bold uppercase tracking-wider text-red-400">
          <span className="size-2 animate-pulse rounded-full bg-red-500 motion-reduce:animate-none" />
          Directo{result.periodText && <span className="text-white tabular-nums">{result.periodText}</span>}
        </p>
      ) : (
        <div className="mt-3 flex items-center gap-3">
          <span className="font-display text-base font-bold uppercase tracking-wider text-white/85">
            Final{overtime > 0 && <span className="text-white/60">{overtime > 1 ? ` · ${overtime} prórrogas` : " · Prórroga"}</span>}
          </span>
          {result.excitementScore !== null && (
            <span
              title="Nota del partido"
              className={cn(
                "inline-flex min-w-11 items-center justify-center px-1.5 py-0.5 font-display text-lg font-extrabold leading-none ring-1",
                EXCITEMENT_TONE_CLASSES[getExcitementTone(result.excitementScore)]
              )}
            >
              {formatExcitementScore(result.excitementScore)}
            </span>
          )}
        </div>
      )}
    </>
  );
}

/** Cuarto a cuarto: cada parcial ganado en blanco, el perdido atenuado. */
function QuarterTable({ result, away, home }: { result: GameResult; away: MatchupTeam; home: MatchupTeam }) {
  const periods = Math.max(result.away.periods.length, result.home.periods.length);
  if (periods === 0) return null;
  const rows = [
    { team: away, side: result.away, rival: result.home },
    { team: home, side: result.home, rival: result.away },
  ];

  return (
    <table className="mx-auto mt-6 font-display tabular-nums">
      <thead>
        <tr className="text-[11px] font-semibold uppercase tracking-wider text-white/60">
          <th scope="col" className="sr-only">
            Equipo
          </th>
          {Array.from({ length: periods }, (_, i) => (
            <th key={i} scope="col" className="w-9 pb-1 font-semibold md:w-11">
              {periodLabel(i)}
            </th>
          ))}
          <th scope="col" className="w-12 pb-1 pl-2 font-semibold text-white/80">
            Total
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ team, side, rival }) => (
          <tr key={team.id} className="border-t border-white/10">
            <th scope="row" className="py-1 pr-3 text-left">
              <span className="flex items-center gap-2 text-sm font-bold uppercase text-white">
                <span aria-hidden className="h-4 w-1" style={{ background: team.accent }} />
                {team.abbreviation}
              </span>
            </th>
            {Array.from({ length: periods }, (_, i) => {
              const won = (side.periods[i] ?? 0) > (rival.periods[i] ?? 0);
              return (
                <td key={i} className={cn("py-1 text-center text-base font-semibold", won ? "text-white" : "text-white/55")}>
                  {side.periods[i] ?? ""}
                </td>
              );
            })}
            <td className="py-1 pl-2 text-center text-lg font-extrabold text-white">{side.score ?? "–"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
