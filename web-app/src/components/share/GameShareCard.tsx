"use client";

/* eslint-disable @next/next/no-img-element -- html-to-image necesita <img> planas del mismo origen */
import { CARD_SIZE, SocialCardExporter, WATERMARK_HEIGHT, type CardFormat } from "@/components/share/SocialCardExporter";
import { formatDayMonth, formatGameTime, formatWeekday, madridDayIfDifferent, periodLabel, type GameMatchup, type GameResult } from "@/lib/game-day";
import type { MatchupTeam } from "@/lib/game-format";
import { playerHeadshotUrl, sameOrigin, teamLogoUrl } from "@/lib/nba-cdn";
import { avg } from "@/lib/player-profile";
import type { KeyPlayer } from "@/lib/queries";
import { EXCITEMENT_TONE_CLASSES, formatExcitementScore, getExcitementTone } from "@/lib/spoilers";
import { cn } from "@/lib/utils";

/** Figura destacada del resultado (Nivel 3). */
export type ShareStar = { id: number; name: string; teamId: number; stats: string; line: string };

/**
 * Qué lleva la tarjeta según el nivel: en Nivel 1 solo la hora, en Nivel 2 solo la nota.
 * Los datos del resultado solo existen en la variante del Nivel 3.
 */
export type GameShareView =
  | { level: 1 }
  | { level: 2; score: number | null }
  | { level: 3; result: GameResult; star: ShareStar | null };

type ShareProps = {
  game: GameMatchup;
  day: string;
  away: MatchupTeam;
  home: MatchupTeam;
  view: GameShareView;
  /** Máximo anotador de la temporada de cada equipo (promedios: sin spoilers). */
  featured: KeyPlayer[];
};

function caption(view: GameShareView): string {
  if (view.level === 1) return "Previa · Hora de España";
  if (view.level === 2) return "Nota sin spoilers";
  return view.result.status === "Live" ? "En directo" : "Resultado final";
}

/** Botón de exportación de la tarjeta del partido. */
export function GameCardExport({ className, ...props }: ShareProps & { className?: string }) {
  const { away, home, day, view } = props;
  return (
    <SocialCardExporter
      className={className}
      fileName={`${away.abbreviation}-${home.abbreviation}-${day}`.toLowerCase()}
      caption={caption(view)}
      renderCard={(format) => <GameShareCard format={format} {...props} />}
    />
  );
}

function GameShareCard({ format, game, day, away, home, view, featured }: ShareProps & { format: CardFormat }) {
  const vertical = format === "9:16";
  const contentHeight = CARD_SIZE[format].height - WATERMARK_HEIGHT[format];
  const final = view.level === 3 && view.result.status === "Final";
  const awayLost = final && (view.result.away.score ?? 0) < (view.result.home.score ?? 0);
  const homeLost = final && (view.result.home.score ?? 0) < (view.result.away.score ?? 0);

  const center = (
    <div className="flex flex-col items-center text-center">
      {view.level === 1 && <CardTime game={game} day={day} />}
      {view.level === 2 && <CardScore score={view.score} game={game} day={day} />}
      {view.level === 3 && <CardResult result={view.result} away={away} home={home} vertical={vertical} />}
    </div>
  );
  const bottom =
    view.level === 3 ? (
      view.star && <CardStar star={view.star} team={view.star.teamId === home.id ? home : away} vertical={vertical} />
    ) : (
      <CardFeatured featured={featured} away={away} home={home} vertical={vertical} />
    );

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{
        background: vertical
          ? `linear-gradient(180deg, ${away.primary} 0%, ${away.primary}99 18%, #020617 50%, ${home.primary}99 82%, ${home.primary} 100%)`
          : `linear-gradient(105deg, ${away.primary} 0%, ${away.primary}a6 22%, #020617 50%, ${home.primary}a6 78%, ${home.primary} 100%)`,
      }}
    >
      <div className="absolute inset-0 bg-slate-950/45" />
      <img
        src={sameOrigin(teamLogoUrl(away.id))}
        alt=""
        className="absolute opacity-[0.12]"
        style={vertical ? { width: 900, height: 900, left: -330, top: -260 } : { width: 1000, height: 1000, left: -380, top: -20 }}
      />
      <img
        src={sameOrigin(teamLogoUrl(home.id))}
        alt=""
        className="absolute opacity-[0.12]"
        style={vertical ? { width: 900, height: 900, right: -330, bottom: -150 } : { width: 1000, height: 1000, right: -380, top: -20 }}
      />

      <div className="relative flex flex-col" style={{ height: contentHeight }}>
        <p className={cn("text-center font-display font-semibold uppercase tracking-[0.3em] text-white/80", vertical ? "pt-24 text-3xl" : "pt-16 text-3xl")}>
          Jornada NBA · {formatWeekday(day, "long")} {formatDayMonth(day)}
        </p>

        {vertical ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-12 px-16">
            <CardTeam team={away} role="Visitante" logo={220} dimmed={awayLost} />
            {center}
            <CardTeam team={home} role="Local" logo={220} dimmed={homeLost} />
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-between gap-8 px-24">
            <CardTeam team={away} role="Visitante" logo={300} dimmed={awayLost} />
            {center}
            <CardTeam team={home} role="Local" logo={300} dimmed={homeLost} />
          </div>
        )}

        {bottom}
      </div>
    </div>
  );
}

function CardTeam({ team, role, logo, dimmed }: { team: MatchupTeam; role: string; logo: number; dimmed: boolean }) {
  return (
    <div className="flex w-[440px] shrink-0 flex-col items-center text-center">
      <img
        src={sameOrigin(teamLogoUrl(team.id))}
        alt=""
        className={cn("drop-shadow-[0_16px_32px_rgba(0,0,0,0.5)]", dimmed && "opacity-60")}
        style={{ width: logo, height: logo }}
      />
      <p className="mt-6 font-display text-2xl font-semibold uppercase tracking-[0.3em] text-white/70">{role}</p>
      <p className={cn("text-balance font-display text-6xl font-extrabold uppercase leading-[0.95]", dimmed ? "text-white/55" : "text-white")}>
        {team.name}
      </p>
    </div>
  );
}

function CardTime({ game, day }: { game: GameMatchup; day: string }) {
  const madrugada = madridDayIfDifferent(game.game_datetime_utc, day);
  return (
    <>
      <span className="font-display font-extrabold leading-none text-white" style={{ fontSize: 220 }}>
        {formatGameTime(game.game_datetime_utc)}
      </span>
      <span className="mt-4 font-display text-3xl font-semibold uppercase tracking-[0.3em] text-white/80">
        {madrugada ? `Hora de España · ${madrugada}` : "Hora de España"}
      </span>
    </>
  );
}

function CardScore({ score, game, day }: { score: number | null; game: GameMatchup; day: string }) {
  const tone = getExcitementTone(score);
  return (
    <>
      <span className="font-display text-3xl font-semibold uppercase tracking-[0.3em] text-white/80">Nota del partido</span>
      <span
        className={cn("mt-6 flex min-w-[380px] items-center justify-center px-12 py-4 font-display font-extrabold leading-none ring-[6px]", EXCITEMENT_TONE_CLASSES[tone])}
        style={{ fontSize: 230 }}
      >
        {formatExcitementScore(score)}
      </span>
      <span className="mt-8 whitespace-nowrap font-display text-2xl font-semibold uppercase tracking-[0.25em] text-white/75">
        Sin spoilers: ni marcador ni ganador
      </span>
      <span className="mt-2 whitespace-nowrap font-display text-2xl font-semibold uppercase tracking-[0.25em] text-white/60">
        {formatGameTime(game.game_datetime_utc)} · Hora de España
        {madridDayIfDifferent(game.game_datetime_utc, day) ? ` · ${madridDayIfDifferent(game.game_datetime_utc, day)}` : ""}
      </span>
    </>
  );
}

function CardResult({ result, away, home, vertical }: { result: GameResult; away: MatchupTeam; home: MatchupTeam; vertical: boolean }) {
  const periods = Math.max(result.away.periods.length, result.home.periods.length);
  const overtime = periods - 4;
  const final = result.status === "Final";
  const winner = final ? ((result.away.score ?? 0) > (result.home.score ?? 0) ? "away" : "home") : null;

  return (
    <>
      <span className="flex items-baseline gap-8 font-display font-extrabold leading-none" style={{ fontSize: vertical ? 200 : 180 }}>
        <span className={winner === "home" ? "text-white/55" : "text-white"}>{result.away.score ?? 0}</span>
        <span className="text-white/40" style={{ fontSize: vertical ? 120 : 110 }}>
          –
        </span>
        <span className={winner === "away" ? "text-white/55" : "text-white"}>{result.home.score ?? 0}</span>
      </span>
      <span className="mt-4 flex items-center gap-6">
        <span className={cn("font-display text-4xl font-bold uppercase tracking-[0.2em]", final ? "text-white/85" : "text-red-400")}>
          {final ? `Final${overtime > 0 ? (overtime > 1 ? ` · ${overtime} prórrogas` : " · Prórroga") : ""}` : `En directo${result.periodText ? ` · ${result.periodText}` : ""}`}
        </span>
        {final && result.excitementScore !== null && (
          <span
            className={cn(
              "inline-flex items-center px-4 py-1 font-display text-4xl font-extrabold leading-none ring-[3px]",
              EXCITEMENT_TONE_CLASSES[getExcitementTone(result.excitementScore)]
            )}
          >
            Nota {formatExcitementScore(result.excitementScore)}
          </span>
        )}
      </span>
      {periods > 0 && (
        <table className="mt-8 font-display tabular-nums">
          <thead>
            <tr className="text-2xl font-semibold uppercase text-white/60">
              <th />
              {Array.from({ length: periods }, (_, i) => (
                <th key={i} className="w-20 pb-2 font-semibold">
                  {periodLabel(i)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { team: away, side: result.away, rival: result.home },
              { team: home, side: result.home, rival: result.away },
            ].map(({ team, side, rival }) => (
              <tr key={team.id} className="border-t-2 border-white/10">
                <th className="py-2 pr-6 text-left text-3xl font-bold uppercase text-white">
                  <span className="mr-3 inline-block h-7 w-2 align-middle" style={{ background: team.accent }} />
                  {team.abbreviation}
                </th>
                {Array.from({ length: periods }, (_, i) => (
                  <td key={i} className={cn("py-2 text-center text-3xl font-semibold", (side.periods[i] ?? 0) > (rival.periods[i] ?? 0) ? "text-white" : "text-white/55")}>
                    {side.periods[i] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

/** Jugador del partido (Nivel 3). */
function CardStar({ star, team, vertical }: { star: ShareStar; team: MatchupTeam; vertical: boolean }) {
  return (
    <div className={cn("relative flex items-end gap-10 border-t-4 bg-slate-950/70", vertical ? "px-16" : "px-24")} style={{ borderColor: team.accent }}>
      <img src={sameOrigin(playerHeadshotUrl(star.id))} alt="" className="-mt-16 w-auto shrink-0" style={{ height: vertical ? 300 : 250 }} />
      <div className="min-w-0 pb-10">
        <p className="flex items-center gap-4 font-display text-2xl font-semibold uppercase tracking-[0.3em] text-white/75">
          <img src={sameOrigin(teamLogoUrl(team.id))} alt="" className="size-10" />
          Jugador del partido
        </p>
        <p className="mt-2 font-display text-7xl font-extrabold uppercase leading-none text-white">{star.name}</p>
        <p className="mt-4 font-display text-4xl font-bold uppercase text-white">{star.stats}</p>
        <p className="mt-2 text-2xl text-slate-300">{star.line}</p>
      </div>
    </div>
  );
}

/** Máximo anotador de la temporada de cada equipo (Niveles 1 y 2): datos de temporada, nunca de este partido. */
function CardFeatured({ featured, away, home, vertical }: { featured: KeyPlayer[]; away: MatchupTeam; home: MatchupTeam; vertical: boolean }) {
  const duel = [away, home]
    .map((team) => ({ team, player: featured.find((p) => p.team_id === team.id) }))
    .filter((d): d is { team: MatchupTeam; player: KeyPlayer } => !!d.player);
  if (duel.length === 0) return null;

  return (
    <div className={cn("grid grid-cols-2 border-t-4 border-orange-500 bg-slate-950/70", vertical ? "gap-8 px-12" : "px-24")}>
      {duel.map(({ team, player }, i) => (
        // En vertical, foto encima del nombre: en media tarjeta no cabe al lado
        <div key={team.id} className={cn("flex", vertical ? "flex-col items-center text-center" : "items-end gap-6", !vertical && i === 1 && "flex-row-reverse text-right")}>
          <img src={sameOrigin(playerHeadshotUrl(player.id))} alt="" className="-mt-10 w-auto shrink-0" style={{ height: vertical ? 200 : 210 }} />
          <div className={cn("min-w-0", vertical ? "pb-10 pt-2" : "pb-8")}>
            <p className="font-display text-xl font-semibold uppercase tracking-[0.3em] text-white/70">A seguir · {team.abbreviation}</p>
            <p className={cn("font-display font-extrabold uppercase leading-none text-white", vertical ? "text-4xl" : "text-5xl")}>{player.full_name}</p>
            <p className={cn("mt-2 font-display font-bold uppercase text-white/85", vertical ? "text-2xl" : "text-3xl")}>
              {avg(player.pts)} pts · {avg(player.reb)} reb · {avg(player.ast)} ast
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
