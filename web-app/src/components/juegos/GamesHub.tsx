"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronRight, Flame, Shield, ShieldCheck, Trophy } from "lucide-react";
import { eloOf, eloOfDay, FLOORS, SEASON_RESET_ABOVE, type EloState } from "@/lib/elo";
import {
  CHALLENGE_HOUR,
  CHALLENGES,
  challengeTitle,
  DIVISIONS,
  divisionOf,
  formatCountdown,
  MAX_SHIELDS,
  playedDays,
  resultsOfDay,
  SHIELD_EVERY,
  streakOf,
  type Challenge,
  type ChallengeId,
  type ChallengeResult,
  type Streak,
} from "@/lib/games";
import { fillPars, useChallengeClock, useGamesProgress } from "@/lib/games-store";
import { cn } from "@/lib/utils";
import { GamesAccountLine } from "@/components/account/AccountLinks";
import { DIVISION_COLORS, DivisionEmblem } from "./DivisionEmblem";
import { deltaTone, formatElo, signedElo } from "./EloChange";
import { ShareDayButton } from "./ShareDayButton";

/** Color y dibujo de cada reto: cada juego se reconoce de un vistazo. */
const LOOK: Record<ChallengeId, { color: string; tint: string; art: (props: { className?: string }) => ReactNode }> = {
  "mas-o-menos": { color: "#f97316", tint: "from-orange-500/20", art: MasOMenosArt },
  adivina: { color: "#38bdf8", tint: "from-sky-400/15", art: AdivinaArt },
  carrera: { color: "#a78bfa", tint: "from-violet-400/15", art: CarreraArt },
};

type Mine = {
  elo: EloState;
  division: ReturnType<typeof divisionOf>;
  streak: Streak;
  today: ChallengeResult[];
  /** Lo que han subido o bajado el ELO los retos de hoy. */
  todayDelta: number;
  /** Lo que ha dado o quitado cada reto de hoy. */
  deltas: Partial<Record<ChallengeId, number>>;
} | null;

/**
 * Juegos (Tarea 8.1, rehecha el 28-nov como vestíbulo): tu división y tu ELO (sube y baja según cómo juegas frente
 * a lo esperado y a lo difícil que fue el día para todos: `elo.ts`), la racha y los retos del día, que cambian a las
 * 7:00 de España. El HTML es el mismo para todos: lo tuyo se pinta al leer el dispositivo, en huecos del mismo tamaño.
 * Nada de esto depende de partidos: igual en los tres niveles de spoilers.
 */
export function GamesHub() {
  const clock = useChallengeClock();
  const progress = useGamesProgress();
  const day = clock?.day ?? null;

  // Los resultados de hoy y ayer sin par todavía (sin conexión al acabar): se pide ahora
  useEffect(() => {
    if (day && progress) fillPars(day);
  }, [day, progress]);

  const mine: Mine =
    progress && day
      ? (() => {
          const elo = eloOf(progress.results);
          const deltas: Partial<Record<ChallengeId, number>> = {};
          for (const e of elo.entries) if (e.day === day) deltas[e.game] = e.delta;
          return {
            elo,
            division: divisionOf(elo.elo),
            streak: streakOf(playedDays(progress), day),
            today: resultsOfDay(progress, day),
            todayDelta: eloOfDay(elo, day),
            deltas,
          };
        })()
      : null;
  const [featured, ...rest] = CHALLENGES;

  return (
    <>
      <header className="flex items-end justify-between gap-3 border-b border-slate-800 px-4 pb-3 pt-4 md:px-8 md:pb-5 md:pt-10">
        <div className="min-w-0">
          <p className="truncate font-display text-xs font-semibold uppercase tracking-[0.2em] text-orange-400 sm:tracking-[0.3em]">
            {challengeTitle(day)}
            {/* Siempre una línea (vacía hasta saber la hora del dispositivo): nada se mueve */}
            <span className="text-slate-400">{clock ? ` · nuevos en ${formatCountdown(clock.next - clock.now)}` : ""}</span>
          </p>
          <h1 className="font-display text-4xl font-extrabold uppercase leading-none text-white md:text-6xl">Juegos</h1>
        </div>
        {mine && day && mine.today.length > 0 && <ShareDayButton day={day} results={mine.today} streakDays={mine.streak.days} />}
      </header>

      <RankBanner mine={mine} />

      <section aria-labelledby="retos-del-dia">
        <h2 id="retos-del-dia" className="sr-only">
          Retos del día
        </h2>
        <ChallengeBlock challenge={featured} featured mine={mine} />
        <div className="grid grid-cols-2 divide-x divide-slate-800 border-b border-slate-800">
          {rest.map((c) => (
            <ChallengeBlock key={c.id} challenge={c} mine={mine} />
          ))}
        </div>
      </section>

      <GamesAccountLine />

      <HowItWorks />
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Tu división

function RankBanner({ mine }: { mine: Mine }) {
  const standing = mine?.division;
  const id = standing?.division.id ?? "rookie";
  const color = DIVISION_COLORS[id];
  const protectedFloor = mine ? FLOORS.includes(mine.elo.floor) && mine.elo.floor === standing?.division.from : false;
  return (
    <section aria-label="Tu división" className="relative overflow-hidden border-b border-slate-800">
      {/* Brillo del color de la división detrás de la insignia */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-16 -top-20 size-72 rounded-full opacity-25 blur-3xl"
        style={{ background: mine ? color.dark : "transparent" }}
      />
      <div className="relative flex items-center gap-4 px-4 pb-3 pt-4 md:gap-6 md:px-8 md:pt-6">
        <div className="w-22 md:w-28">
          {mine && standing ? <DivisionEmblem id={id} rank={standing.rank} className="w-full drop-shadow-[0_6px_18px_rgb(0_0_0/0.6)]" /> : <div className="aspect-[100/112] w-full animate-pulse bg-slate-900/60" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className={cn("flex min-h-[1lh] items-center gap-1.5 font-display text-sm font-bold uppercase tracking-[0.2em]", mine ? color.text : "text-slate-500")}>
            {standing ? standing.division.name : ""}
            {/* Sexto Hombre y Titular, una vez alcanzadas, no se pierden */}
            {protectedFloor && <ShieldCheck aria-label="no se pierde" className="size-4" />}
          </p>
          <p className="flex flex-wrap items-baseline gap-x-2 whitespace-nowrap font-display uppercase">
            <span className="text-5xl font-extrabold leading-none text-white tabular-nums md:text-6xl">{mine ? formatElo(mine.elo.elo) : "–"}</span>
            <span className="text-base font-semibold text-slate-400">ELO</span>
            {mine && <TodayDelta delta={mine.todayDelta} played={mine.today.length > 0} />}
          </p>
          {/* Hasta la siguiente división */}
          <div className="mt-2 h-1.5 overflow-hidden bg-slate-800">
            <div
              className="h-full transition-[width] duration-700 motion-reduce:transition-none"
              style={{ width: `${standing ? Math.max(standing.progress, 0.03) * 100 : 0}%`, background: `linear-gradient(90deg, ${color.dark}, ${color.light})` }}
            />
          </div>
          <p className="mt-1.5 min-h-[1lh] truncate text-sm text-slate-300">
            {standing &&
              (standing.next ? (
                <>
                  Te faltan <strong className="font-semibold text-white">{formatElo(standing.toNext)}</strong> para {standing.next.name}
                </>
              ) : (
                <>Lo más alto: Hall of Fame</>
              ))}
          </p>
        </div>
      </div>
      <StreakLine streak={mine?.streak ?? null} />
      <DivisionRoad current={standing?.rank ?? 0} />
    </section>
  );
}

function TodayDelta({ delta, played }: { delta: number; played: boolean }) {
  if (!played) return <span className="text-sm font-semibold tracking-wide text-slate-500">· hoy aún nada</span>;
  return (
    <span className={cn("text-xl font-extrabold tabular-nums", deltaTone(delta))}>
      {signedElo(delta)}
      <span className="ml-1 text-sm font-semibold tracking-wide text-slate-400">hoy</span>
    </span>
  );
}

function StreakLine({ streak }: { streak: Streak | null }) {
  return (
    <div className="relative flex min-h-11 items-center gap-3 border-t border-slate-800 px-4 py-2 md:px-8">
      <Flame aria-hidden className={cn("size-5 shrink-0", streak && streak.days > 0 ? "text-orange-400" : "text-slate-600")} />
      <p className="font-display text-lg font-bold uppercase tracking-wide text-white tabular-nums">
        {streak ? streak.days : "–"} <span className="text-sm font-semibold text-slate-400">{streak?.days === 1 ? "día" : "días"} de racha</span>
      </p>
      {/* Escudos: cada uno salva un día sin jugar */}
      <span className="inline-flex gap-0.5" role="img" aria-label={streak ? `${streak.shields} de ${MAX_SHIELDS} escudos` : "Escudos"} title="Escudos: cada uno salva un día sin jugar">
        {Array.from({ length: MAX_SHIELDS }, (_, i) =>
          streak && i < streak.shields ? (
            <ShieldCheck key={i} aria-hidden className="size-4.5 fill-sky-400/25 text-sky-300" />
          ) : (
            <Shield key={i} aria-hidden className="size-4.5 text-slate-700" />
          )
        )}
      </span>
      <p className="ml-auto min-w-0 truncate text-right text-sm text-orange-300">
        {streak && streak.days > 0 && !streak.playedToday && <>Juega hoy{streak.shields > 0 ? " (o gastas un escudo)" : ""}</>}
      </p>
    </div>
  );
}

/** El camino de las seis divisiones: las alcanzadas encendidas, la tuya marcada, las demás apagadas. */
function DivisionRoad({ current }: { current: number }) {
  return (
    <ol className="relative grid grid-cols-6 border-t border-slate-800 px-2 pb-2.5 pt-3 md:px-6" aria-label="Divisiones">
      {DIVISIONS.map((d, i) => {
        const reached = current > 0 && i < current;
        const here = current === i + 1;
        return (
          <li key={d.id} aria-current={here ? "step" : undefined} className="flex flex-col items-center gap-1 text-center">
            <DivisionEmblem id={d.id} rank={i + 1} dim={!reached} className={cn("w-8 md:w-10", here && "w-10 md:w-12")} />
            <span className={cn("font-display text-[0.65rem] font-bold uppercase leading-tight tracking-wide md:text-xs", here ? "text-white" : reached ? "text-slate-300" : "text-slate-600")}>
              {d.name}
            </span>
            <span className="font-display text-[0.65rem] font-semibold tabular-nums text-slate-500 md:text-xs">{formatElo(d.from)}</span>
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Retos

function ChallengeBlock({ challenge, featured = false, mine }: { challenge: Challenge; featured?: boolean; mine: Mine }) {
  const look = LOOK[challenge.id];
  const Art = look.art;
  const result = mine?.today.find((r) => r.game === challenge.id);
  const delta = mine?.deltas[challenge.id];
  const known = mine !== null;
  return (
    <Link
      href={challenge.href}
      className={cn(
        "group relative flex overflow-hidden bg-gradient-to-br to-transparent outline-none transition-colors hover:bg-slate-900/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-400",
        look.tint,
        featured ? "min-h-36 items-center gap-4 border-b border-slate-800 px-4 py-4 md:min-h-44 md:px-8" : "min-h-52 flex-col justify-between gap-3 px-4 py-4 md:px-8"
      )}
    >
      {/* Dibujo del juego, grande y de fondo */}
      <Art
        className={cn(
          "pointer-events-none absolute opacity-15 transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none",
          featured ? "-right-6 top-1/2 h-[120%] -translate-y-1/2" : "-bottom-3 -right-5 h-24"
        )}
      />
      <div className="relative min-w-0 flex-1">
        <p className="font-display text-xs font-bold uppercase tracking-[0.2em]" style={{ color: look.color }}>
          {featured ? "Reto del día · " : ""}hasta {challenge.maxPoints}
        </p>
        <h3 className={cn("font-display font-extrabold uppercase leading-[0.95] text-white", featured ? "text-3xl md:text-5xl" : "text-2xl md:text-3xl")}>{challenge.name}</h3>
        <p className={cn("mt-1 text-sm leading-snug text-slate-300", !featured && "line-clamp-2")}>{challenge.tagline}</p>
      </div>
      <div className={cn("relative shrink-0", !featured && "w-full")}>
        {result ? (
          <span className={cn("flex items-center gap-2 font-display uppercase", !featured && "justify-between")}>
            <span className="inline-flex items-center gap-1 text-lg font-extrabold text-emerald-400">
              <Check aria-hidden className="size-5" strokeWidth={3} />
              <span className="tabular-nums">
                {result.points}
                <span className="text-sm text-slate-400">/{challenge.maxPoints}</span>
              </span>
            </span>
            {delta !== undefined && (
              <span className={cn("text-base font-extrabold tabular-nums", deltaTone(delta))}>
                {signedElo(delta)}
              </span>
            )}
          </span>
        ) : (
          // Hasta leer el dispositivo no se sabe si ya lo jugó: el hueco del botón, sin texto (nada salta)
          <span
            className={cn(
              "inline-flex h-11.5 items-center justify-center gap-1 px-4 font-display text-lg font-extrabold uppercase tracking-wide transition-colors md:h-11",
              !featured && "w-full md:w-auto md:px-6",
              known ? "text-slate-950" : "bg-slate-900 text-transparent"
            )}
            style={known ? { background: look.color } : undefined}
          >
            Jugar
            <ChevronRight aria-hidden className="size-5" />
          </span>
        )}
      </div>
    </Link>
  );
}

// Dibujos propios de cada juego (decorativos)

function MasOMenosArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 100" aria-hidden className={className} fill="none" stroke="#f97316" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="14" y="44" width="26" height="46" fill="#f97316" fillOpacity="0.35" />
      <rect x="54" y="18" width="26" height="72" fill="#f97316" fillOpacity="0.6" />
      <path d="M100 52 V12 M88 24 L100 12 L112 24" />
      <path d="M100 60 V92 M88 80 L100 92 L112 80" opacity="0.5" />
    </svg>
  );
}

function AdivinaArt({ className }: { className?: string }) {
  const hex = (r: number) =>
    Array.from({ length: 6 }, (_, i) => {
      const a = ((-90 + 60 * i) * Math.PI) / 180;
      return `${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`;
    }).join(" ");
  return (
    <svg viewBox="0 0 100 100" aria-hidden className={className} fill="none" stroke="#38bdf8" strokeWidth="2.5">
      <polygon points={hex(46)} opacity="0.6" />
      <polygon points={hex(30)} opacity="0.4" />
      <polygon points="50,12 82,34 74,70 50,80 22,62 30,30" fill="#38bdf8" fillOpacity="0.35" strokeWidth="4" />
    </svg>
  );
}

function CarreraArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden className={className} fill="#a78bfa">
      {[30, 46, 62, 78].map((w, i) => (
        <rect key={i} x="8" y={14 + i * 18} width={w} height="10" fillOpacity={0.3 + i * 0.12} />
      ))}
      <text x="78" y="54" fontSize="56" fontWeight="900" fontFamily="system-ui, sans-serif" fill="#a78bfa">
        ?
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Cómo funciona

function HowItWorks() {
  return (
    <details className="group border-b border-slate-800">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-400 md:px-8 [&::-webkit-details-marker]:hidden">
        <span className="font-display text-xl font-bold uppercase tracking-wide text-white md:text-2xl">Cómo funciona el ELO</span>
        <ChevronDown aria-hidden className="size-5 text-slate-400 transition-transform group-open:rotate-180" />
      </summary>
      <div className="grid divide-y divide-slate-800 border-t border-slate-800 md:grid-cols-3 md:divide-x md:divide-y-0">
        <Rule icon={Trophy} title="Un ELO que sube y baja">
          Cada reto te sube o te baja el ELO según cómo lo hagas frente a lo que se espera de tu nivel. Si un día el reto es
          difícil para todos, no castiga: se compara con lo que sacó la mitad de la gente.
        </Rule>
        <Rule icon={ShieldCheck} title="Justo para todos">
          Nadie llega arriba en dos semanas: como mucho se ganan 60 al día y cuanto más alto, menos se gana. Sexto
          Hombre y Titular no se pierden. Cada 1 de octubre, temporada nueva: lo que pasa de {formatElo(SEASON_RESET_ABOVE)} se queda en la mitad.
        </Rule>
        <Rule icon={Flame} title="Racha con escudo">
          Juega cualquier reto cada día. Cada {SHIELD_EVERY} días seguidos ganas un escudo (como mucho {MAX_SHIELDS}): si un
          día no puedes, te guarda la racha. Sin cuenta, todo queda en este dispositivo; con ella, en todos los tuyos. Retos nuevos a las {CHALLENGE_HOUR}:00.
        </Rule>
      </div>
    </details>
  );
}

function Rule({ icon: Icon, title, children }: { icon: typeof Trophy; title: string; children: ReactNode }) {
  return (
    <div className="px-4 py-4 md:px-8 md:py-5">
      <h3 className="flex items-center gap-2 font-display text-lg font-bold uppercase tracking-wide text-white">
        <Icon aria-hidden className="size-4.5 text-orange-400" />
        {title}
      </h3>
      <p className="mt-1 text-sm leading-relaxed text-slate-300">{children}</p>
    </div>
  );
}
