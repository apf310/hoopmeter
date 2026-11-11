import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PureScoreBadge } from "@/components/games/PureScoreBadge";
import {
  formatGameTime,
  madridDayIfDifferent,
  periodLabel,
  type GameMatchup,
  type GameResult,
  type TeamLite,
} from "@/lib/game-day";
import { loadGameDetail } from "@/lib/game-day-store";
import { teamLogoUrl } from "@/lib/nba-cdn";
import { cn } from "@/lib/utils";

/**
 * Lo que puede verse de un partido según el nivel. `undefined` = aún cargando.
 * Nivel 2: `score` null = sin nota todavía; `upcoming` = no ha empezado (no lleva hueco de nota).
 */
export type CardView =
  | { level: 1 }
  | { level: 2; score: number | null | undefined; upcoming: boolean }
  | { level: 3; result: GameResult | undefined };

type LiveGameCardProps = {
  game: GameMatchup;
  day: string;
  home: TeamLite | undefined;
  away: TeamLite | undefined;
  view: CardView;
};

/** Fila de la jornada: visitante arriba y local abajo (convención NBA), hora en España a la izquierda. */
export function LiveGameCard({ game, day, home, away, view }: LiveGameCardProps) {
  const result = view.level === 3 ? view.result : undefined;
  const final = result?.status === "Final";
  const homeWins = final && (result.home.score ?? 0) > (result.away.score ?? 0);
  const awayWins = final && (result.away.score ?? 0) > (result.home.score ?? 0);
  // En Nivel 3 la ficha completa se precarga al apuntar al partido: al entrar ya está
  const prefetchDetail = view.level === 3 ? () => void loadGameDetail(game.id) : undefined;

  return (
    <li className="border-b border-slate-800">
      <Link
        href={`/games/${game.id}`}
        onPointerEnter={prefetchDetail}
        onFocus={prefetchDetail}
        className="group grid grid-cols-[4.25rem_minmax(0,1fr)_auto_1rem] items-center gap-x-3 px-4 py-3 transition-colors hover:bg-slate-900/70 md:gap-x-5 md:px-8"
      >
        <StatusCell game={game} day={day} result={result} />

        <div className="space-y-1.5">
          <TeamLine team={away} dimmed={homeWins} />
          <TeamLine team={home} dimmed={awayWins} />
        </div>

        <div className="flex min-w-14 justify-end">
          {view.level === 2 && <ScoreCell score={view.score} upcoming={view.upcoming} />}
          {view.level === 3 && <ResultCell result={result} homeWins={homeWins} awayWins={awayWins} />}
        </div>

        <ChevronRight className="size-4 text-slate-600 transition-colors group-hover:text-orange-400" />
      </Link>
    </li>
  );
}

function StatusCell({ game, day, result }: { game: GameMatchup; day: string; result: GameResult | undefined }) {
  // Solo en Nivel 3 hay estado; en los demás, la hora (igual para un partido jugado que por jugar)
  if (result?.status === "Live") {
    return (
      <div className="font-display uppercase leading-tight">
        <span className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-red-400">
          <span className="size-1.5 animate-pulse rounded-full bg-red-500 motion-reduce:animate-none" />
          Directo
        </span>
        <span className="block text-base font-bold text-white tabular-nums">{result.periodText ?? ""}</span>
      </div>
    );
  }
  if (result?.status === "Final") {
    const overtime = Math.max(result.home.periods.length, result.away.periods.length) - 4;
    return (
      <div className="font-display uppercase leading-tight">
        <span className="block text-base font-bold text-slate-300">Final</span>
        {overtime > 0 && <span className="block text-xs font-semibold text-slate-400">{overtime > 1 ? `${overtime} prór.` : "Prórroga"}</span>}
      </div>
    );
  }

  const madrugada = madridDayIfDifferent(game.game_datetime_utc, day);
  return (
    <time dateTime={game.game_datetime_utc} className="font-display uppercase leading-tight">
      <span className="block text-xl font-bold text-white tabular-nums">{formatGameTime(game.game_datetime_utc)}</span>
      {madrugada && <span className="block text-xs font-semibold text-slate-400">{madrugada}</span>}
    </time>
  );
}

function TeamLine({ team, dimmed }: { team: TeamLite | undefined; dimmed: boolean }) {
  return (
    <div className="flex h-8 min-w-0 items-center gap-2.5">
      <span aria-hidden className="h-6 w-1 shrink-0" style={{ backgroundColor: team?.accent ?? "#475569" }} />
      {team && <Image src={teamLogoUrl(team.id)} alt="" width={28} height={28} unoptimized className="size-7 shrink-0" />}
      <span className={cn("truncate font-semibold", dimmed ? "text-slate-500" : "text-white")}>
        <span className="md:hidden">{team?.abbreviation ?? "—"}</span>
        <span className="hidden md:inline">{team?.name ?? "—"}</span>
      </span>
    </div>
  );
}

function ScoreCell({ score, upcoming }: { score: number | null | undefined; upcoming: boolean }) {
  if (score === undefined) return <Placeholder className="h-9 w-14" />;
  if (score === null && upcoming) return null;
  return <PureScoreBadge score={score} />;
}

function ResultCell({ result, homeWins, awayWins }: { result: GameResult | undefined; homeWins: boolean; awayWins: boolean }) {
  if (!result) return <Placeholder className="h-[4.375rem] w-10" />;
  if (result.status === "Scheduled") return null;

  const periods = Math.max(result.away.periods.length, result.home.periods.length);
  const live = result.status === "Live";
  const rows = [
    { side: result.away, wins: awayWins, lost: homeWins },
    { side: result.home, wins: homeWins, lost: awayWins },
  ];

  return (
    <div className="flex items-center gap-3 md:gap-4">
      {/* Cuarto a cuarto: solo en pantallas anchas */}
      {periods > 0 && (
        <table className="hidden font-display text-sm tabular-nums lg:table">
          <thead className="sr-only">
            <tr>
              {Array.from({ length: periods }, (_, i) => (
                <th key={i}>{periodLabel(i)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ side }, row) => (
              <tr key={row} className="h-8">
                {Array.from({ length: periods }, (_, i) => (
                  <td key={i} className="w-8 text-center font-semibold text-slate-400">
                    {side.periods[i] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="space-y-1.5 text-right">
        {rows.map(({ side, wins, lost }, row) => (
          <span
            key={row}
            className={cn(
              "flex h-8 items-center justify-end font-display text-2xl font-extrabold tabular-nums",
              wins ? "text-white" : lost ? "text-slate-500" : live ? "text-white" : "text-slate-300"
            )}
          >
            {side.score ?? "–"}
          </span>
        ))}
      </div>
      {/* La nota acompaña al resultado final (mientras se juega aún no existe) */}
      {result.status === "Final" && <PureScoreBadge score={result.excitementScore} />}
    </div>
  );
}

function Placeholder({ className }: { className: string }) {
  return <span aria-hidden className={cn("block animate-pulse rounded-md bg-slate-800/80", className)} />;
}
