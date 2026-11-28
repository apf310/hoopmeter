"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Check, ChevronDown, ChevronUp, Infinity as InfinityIcon, ListChecks, RotateCcw, ShieldCheck, Timer, X } from "lucide-react";
import { PlayerPhoto } from "@/components/players/PlayerPhoto";
import { CHALLENGE_HOUR, challengeTitle, formatCountdown, playedDays, resultsOfDay, streakOf, type ChallengeResult } from "@/lib/games";
import { recordEndless, recordResult, useChallengeClock, useGamesProgress } from "@/lib/games-store";
import {
  ANSWER_MS,
  CATEGORIES,
  CATEGORY_ORDER,
  correctChoice,
  DAILY_QUESTIONS,
  formatSeconds,
  formatValue,
  POINTS_PER_HIT,
  questionText,
  REVEAL_MS,
  type AnswerOutcome,
  type AskedQuestion,
  type Category,
  type Choice,
  type HiddenSide,
  type Question,
  type RunSummary,
} from "@/lib/mas-o-menos";
import { teamLogoUrl } from "@/lib/nba-cdn";
import { splitName } from "@/lib/player-card";
import { cn } from "@/lib/utils";
import { EloChange } from "./EloChange";
import { ShareDayButton } from "./ShareDayButton";

const API = "/api/juegos/mas-o-menos";
const GAME_ID = "mas-o-menos";
/** En el infinito la respuesta es al momento: algo menos de pausa. */
const ENDLESS_REVEAL_MS = 1_100;
/** Pide la siguiente tanda del infinito cuando quedan estas. */
const ENDLESS_PREFETCH = 6;
const URGENT_MS = 5_000;
/**
 * Hasta cuánto se amplía la foto respecto al ancho del panel (175 % = se ve el 57 % central): la cabeza nunca se corta
 * (ocupa el 30-70 % de las fotos de la NBA) y en el móvil la cara sale grande; solo se pierden los extremos de los hombros.
 */
const PHOTO_ZOOM = "w-[175%]";
/** Mismo tamaño en el panel y en la precarga: así la foto que se precarga es la misma que se pinta. */
const PHOTO_SIZES = "(min-width: 768px) 45vw, 88vw";

type Mode = "dia" | "infinito";

type Reveal = Pick<AnswerOutcome, "choice" | "hit" | "late" | "value" | "correct">;

type Play = {
  mode: Mode;
  question: AskedQuestion;
  /** Aciertos antes de esta pregunta (en el infinito, la racha). */
  hits: number;
  /** undefined = sin contestar; null = se acabó el tiempo. */
  pending: Choice | null | undefined;
  reveal: Reveal | null;
  /** Cuándo apareció en pantalla (reloj del dispositivo: el que cuenta es el del servidor). */
  shownAt: number;
  /** Las fotos de la siguiente, para que estén ya descargadas. */
  upcoming: AskedQuestion | null;
};

type Logged = { question: AskedQuestion; reveal: Reveal };

type Screen =
  | { kind: "intro" }
  | { kind: "loading"; mode: Mode }
  | { kind: "play"; play: Play }
  | { kind: "day-done"; day: string; summary: RunSummary; log: Logged[] }
  | { kind: "endless-done"; streak: number; best: number; record: boolean; last: Logged | null }
  | { kind: "error"; mode: Mode; message: string };

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

async function api<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, { ...init, cache: "no-store", headers: { "Content-Type": "application/json" } });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new ApiError(data.error ?? "No se ha podido conectar.", response.status);
  return data;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Una respuesta, con un reintento si falla la red (reenviarla nunca cuenta dos veces: lo comprueba el servidor). */
async function postAnswer(run: string, index: number, choice: Choice | null): Promise<AnswerOutcome> {
  const body = JSON.stringify({ action: "answer", run, index, choice });
  try {
    return await api<AnswerOutcome>(API, { method: "POST", body });
  } catch (error) {
    if (error instanceof ApiError && error.status < 500) throw error;
    await wait(600);
    return api<AnswerOutcome>(API, { method: "POST", body });
  }
}

const hide = (q: Question, index: number): AskedQuestion => ({
  index,
  total: 0,
  category: q.category,
  season: q.season,
  a: q.a,
  b: { id: q.b.id, name: q.b.name, teamId: q.b.teamId, team: q.b.team },
});

const newPlay = (mode: Mode, question: AskedQuestion, hits: number, upcoming: AskedQuestion | null = null): Play => ({
  mode,
  question,
  hits,
  pending: undefined,
  reveal: null,
  shownAt: Date.now(),
  upcoming,
});

const errorText = (error: unknown) => (error instanceof ApiError ? error.message : "Se ha perdido la conexión.");

/**
 * ¿Más o menos? (Tarea 8.2). Reto del día: 30 preguntas contrarreloj que da el servidor de una en una (la cifra
 * escondida solo llega al responder) y puntos que dice él. Modo infinito: sin puntos ni reloj, hasta el primer fallo.
 * Nada depende de partidos: igual en los tres niveles de spoilers.
 */
export function MasOMenos() {
  const progress = useGamesProgress();
  const clock = useChallengeClock();
  const [screen, setScreen] = useState<Screen>({ kind: "intro" });
  const [now, setNow] = useState(0);
  const run = useRef<{ id: string; day: string } | null>(null);
  const queue = useRef<Question[]>([]);
  const fetching = useRef<Promise<void> | null>(null);
  const log = useRef<Logged[]>([]);
  const timers = useRef<number[]>([]);
  const session = useRef(0);
  // Pregunta ya contestada en esta partida: el reloj y un doble toque no la mandan dos veces
  const answered = useRef<string | null>(null);

  const today = progress && clock ? resultsOfDay(progress, clock.day) : null;
  const doneToday = today?.find((r) => r.game === GAME_ID) ?? null;

  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  function reset(kind: Screen) {
    session.current++;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    log.current = [];
    setScreen(kind);
    window.scrollTo({ top: 0 });
  }

  function startDay() {
    reset({ kind: "loading", mode: "dia" });
    const id = session.current;
    api<{ run: string; day: string; question: AskedQuestion }>(API, { method: "POST", body: JSON.stringify({ action: "start" }) })
      .then((data) => {
        if (id !== session.current) return;
        run.current = { id: data.run, day: data.day };
        setScreen({ kind: "play", play: newPlay("dia", data.question, 0) });
      })
      .catch((error) => id === session.current && setScreen({ kind: "error", mode: "dia", message: errorText(error) }));
  }

  function fetchMore(from: number) {
    fetching.current ??= api<{ questions: Question[] }>(`${API}/infinito?desde=${from}`)
      .then((data) => {
        queue.current.push(...data.questions);
      })
      .finally(() => {
        fetching.current = null;
      });
    return fetching.current;
  }

  function startEndless() {
    reset({ kind: "loading", mode: "infinito" });
    const id = session.current;
    queue.current = [];
    fetchMore(0)
      .then(() => {
        if (id !== session.current) return;
        const [first, second] = queue.current;
        setScreen({ kind: "play", play: newPlay("infinito", hide(first, 0), 0, second ? hide(second, 1) : null) });
      })
      .catch((error) => id === session.current && setScreen({ kind: "error", mode: "infinito", message: errorText(error) }));
  }

  function answer(choice: Choice | null) {
    if (screen.kind !== "play" || screen.play.pending !== undefined) return;
    const play = screen.play;
    const id = session.current;
    const index = play.question.index;
    if (answered.current === `${id}:${index}`) return;
    answered.current = `${id}:${index}`;
    setScreen({ kind: "play", play: { ...play, pending: choice } });

    const show = (reveal: Reveal, upcoming: AskedQuestion | null) => {
      log.current.push({ question: play.question, reveal });
      setScreen((s) => (s.kind === "play" && s.play.question.index === index ? { kind: "play", play: { ...s.play, reveal, upcoming } } : s));
    };

    if (play.mode === "dia") {
      postAnswer(run.current!.id, index, choice)
        .then((outcome) => {
          if (id !== session.current) return;
          show(outcome, outcome.next);
          later(() => {
            if (outcome.summary) {
              const { day } = run.current!;
              recordResult({ day, game: GAME_ID, points: outcome.summary.points, rows: outcome.summary.rows, receipt: outcome.summary.receipt });
              setScreen({ kind: "day-done", day, summary: outcome.summary, log: [...log.current] });
            } else if (outcome.next) {
              setScreen({ kind: "play", play: newPlay("dia", outcome.next, outcome.hits) });
            }
          }, REVEAL_MS);
        })
        .catch((error) => id === session.current && setScreen({ kind: "error", mode: "dia", message: errorText(error) }));
      return;
    }

    // Infinito: la solución ya está aquí
    const full = queue.current[index];
    const correct = correctChoice(full);
    const hit = choice === correct;
    if (hit && queue.current.length - index <= ENDLESS_PREFETCH) fetchMore(queue.current.length).catch(() => {});
    const following = queue.current[index + 1];
    show({ choice, hit, late: false, value: full.b.value, correct }, hit && following ? hide(following, index + 1) : null);
    later(() => {
      if (!hit) {
        const best = progress?.endless ?? 0;
        recordEndless(play.hits);
        setScreen({ kind: "endless-done", streak: play.hits, best: Math.max(best, play.hits), record: play.hits > best, last: log.current.at(-1) ?? null });
        return;
      }
      const go = () => {
        if (id !== session.current) return;
        const next = queue.current[index + 1];
        if (!next) return setScreen({ kind: "error", mode: "infinito", message: "Se ha perdido la conexión." });
        const after = queue.current[index + 2];
        setScreen({ kind: "play", play: newPlay("infinito", hide(next, index + 1), play.hits + 1, after ? hide(after, index + 2) : null) });
      };
      if (queue.current[index + 1]) go();
      else (fetching.current ?? fetchMore(queue.current.length)).then(go, go);
    }, ENDLESS_REVEAL_MS);
  }

  // Reloj de la pregunta (solo en el reto del día): al llegar a cero, cuenta como fallo
  const onTimeUp = useEffectEvent(() => answer(null));
  const playing = screen.kind === "play" && screen.play.mode === "dia" && screen.play.pending === undefined ? screen.play : null;
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t - playing.shownAt >= ANSWER_MS) onTimeUp();
    }, 100);
    return () => clearInterval(timer);
  }, [playing]);

  // Flechas del teclado: ↑ más, ↓ menos
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      answer(event.key === "ArrowUp" ? "mas" : "menos");
    }
  });
  const listening = screen.kind === "play";
  useEffect(() => {
    if (!listening) return;
    const handler = (event: KeyboardEvent) => onKey(event);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [listening]);

  if (screen.kind === "play") {
    const { play } = screen;
    // Al responder, el reloj se queda donde estaba (deja de contar)
    const remaining = play.mode === "dia" ? Math.min(ANSWER_MS, Math.max(0, ANSWER_MS - Math.max(0, now - play.shownAt))) : null;
    return <Duel play={play} remaining={remaining} best={progress?.endless ?? 0} onAnswer={answer} onExit={() => reset({ kind: "intro" })} />;
  }

  return (
    <>
      <header className="flex items-end justify-between gap-3 border-b border-slate-800 px-4 pb-3 pt-4 md:px-8 md:pb-5 md:pt-10">
        <div className="min-w-0">
          <Link
            href="/juegos"
            className="inline-flex items-center gap-1 font-display text-xs font-semibold uppercase tracking-[0.2em] text-orange-400 hover:text-orange-300 sm:tracking-[0.3em]"
          >
            <ArrowLeft aria-hidden className="size-3.5" />
            Juegos · {challengeTitle(clock?.day ?? null)}
          </Link>
          <h1 className="font-display text-4xl font-extrabold uppercase leading-none text-white md:text-6xl">¿Más o menos?</h1>
        </div>
        {screen.kind === "day-done" && progress && (
          <ShareDayButton day={screen.day} results={resultsOfDay(progress, screen.day)} streakDays={streakOf(playedDays(progress), screen.day).days} />
        )}
      </header>

      {screen.kind === "day-done" ? (
        <DayDone day={screen.day} summary={screen.summary} log={screen.log} onEndless={startEndless} nextIn={clock ? clock.next - clock.now : null} />
      ) : screen.kind === "endless-done" ? (
        <EndlessDone result={screen} onAgain={startEndless} dayPending={progress !== null && !doneToday} onDay={startDay} />
      ) : (
        <Intro
          known={progress !== null && clock !== null}
          done={doneToday}
          nextIn={clock ? clock.next - clock.now : null}
          best={progress?.endless ?? 0}
          loading={screen.kind === "loading" ? screen.mode : null}
          error={screen.kind === "error" ? screen : null}
          onDay={startDay}
          onEndless={startEndless}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Antes de jugar

function Intro({
  known,
  done,
  nextIn,
  best,
  loading,
  error,
  onDay,
  onEndless,
}: {
  known: boolean;
  done: ChallengeResult | null;
  nextIn: number | null;
  best: number;
  loading: Mode | null;
  error: { mode: Mode; message: string } | null;
  onDay: () => void;
  onEndless: () => void;
}) {
  return (
    <>
      <section aria-label="Cómo se juega" className="border-b border-slate-800">
        <p className="px-4 pb-3 pt-4 text-base leading-relaxed text-slate-300 md:px-8 md:text-lg">
          Te damos la cifra de un jugador. <strong className="font-semibold text-white">¿La del otro es más o menos?</strong> Salarios de
          esta temporada, media Hoopmeter y promedios de puntos, rebotes y asistencias.
        </p>
        <div className="grid grid-cols-3 divide-x divide-slate-800 border-t border-slate-800">
          <Fact big={String(DAILY_QUESTIONS)} unit="preguntas" />
          <Fact big={String(ANSWER_MS / 1000)} unit="segundos cada una" />
          <Fact big={`+${POINTS_PER_HIT}`} unit="por acierto" />
        </div>
      </section>

      <section aria-labelledby="reto-de-hoy" className="border-b border-slate-800 bg-gradient-to-r from-orange-500/12 to-transparent px-4 py-4 md:px-8 md:py-6">
        <h2 id="reto-de-hoy" className="font-display text-xs font-semibold uppercase tracking-[0.25em] text-orange-400">
          Reto del día · hasta {DAILY_QUESTIONS * POINTS_PER_HIT} puntos
        </h2>
        {/* Mismo alto antes y después de leer el dispositivo: nada salta */}
        <div className="mt-2 min-h-[5.5rem]">
          {!known ? null : done ? (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <p className="font-display uppercase text-white">
                <span className="flex items-center gap-1.5 text-sm font-bold tracking-wide text-emerald-400">
                  <Check aria-hidden className="size-4" /> Hecho hoy
                </span>
                <span className="text-5xl font-extrabold leading-none tabular-nums">{done.points}</span>
                <span className="ml-1 text-lg font-semibold text-slate-400">/{DAILY_QUESTIONS * POINTS_PER_HIT}</span>
              </p>
              <Marks rows={done.rows} />
              <p className="w-full text-sm text-slate-400">
                Preguntas nuevas a las {CHALLENGE_HOUR}:00{nextIn !== null && <> (en {formatCountdown(nextIn)})</>}. Mientras, el modo infinito.
              </p>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={onDay}
                disabled={loading !== null}
                className="inline-flex h-14 w-full items-center justify-center gap-2 bg-orange-500 px-8 font-display text-2xl font-extrabold uppercase tracking-wide text-slate-950 outline-none transition-colors hover:bg-orange-400 focus-visible:ring-2 focus-visible:ring-orange-300 disabled:opacity-70 sm:w-auto"
              >
                <Timer aria-hidden className="size-6" />
                {loading === "dia" ? "Preparando…" : "Empezar el reto"}
              </button>
              <p className="mt-2 flex items-start gap-1.5 text-sm text-slate-400">
                <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-sky-300" />
                Preguntas solo para ti, con la misma dificultad para todos y comprobadas en el servidor. Una vez al día.
              </p>
            </>
          )}
          {error?.mode === "dia" && <p className="mt-2 text-sm text-red-300">{error.message}</p>}
        </div>
      </section>

      <section aria-labelledby="modo-infinito" className="flex items-center gap-3 border-b border-slate-800 px-4 py-4 md:gap-5 md:px-8 md:py-5">
        <span aria-hidden className="flex size-12 shrink-0 items-center justify-center bg-slate-900 text-orange-400 ring-1 ring-inset ring-slate-800 md:size-14">
          <InfinityIcon className="size-7" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="modo-infinito" className="font-display text-2xl font-extrabold uppercase leading-tight text-white">
            Modo infinito
          </h2>
          <p className="text-sm leading-snug text-slate-400">
            Sin puntos ni reloj, hasta el primer fallo.
            {known && best > 0 && (
              <>
                {" "}
                Tu récord: <strong className="font-semibold text-white">{best}</strong>.
              </>
            )}
          </p>
          {error?.mode === "infinito" && <p className="mt-1 text-sm text-red-300">{error.message}</p>}
        </div>
        <button
          type="button"
          onClick={onEndless}
          disabled={loading !== null}
          className="shrink-0 bg-slate-900 px-4 py-2.5 font-display text-base font-bold uppercase tracking-wide text-white ring-1 ring-inset ring-slate-700 outline-none transition-colors hover:bg-orange-500 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-orange-400 disabled:opacity-70"
        >
          {loading === "infinito" ? "…" : "Jugar"}
        </button>
      </section>

      <p className="px-4 py-3 font-display text-xs font-semibold uppercase tracking-wider text-slate-500 md:px-8">
        {CATEGORY_ORDER.map((c) => CATEGORIES[c].short).join(" · ")}
        <span className="hidden md:inline"> · Atajos de teclado: ↑ más, ↓ menos</span>
      </p>
    </>
  );
}

function Fact({ big, unit }: { big: string; unit: string }) {
  return (
    <p className="min-w-0 px-4 py-3 md:px-8">
      <span className="block font-display text-3xl font-extrabold leading-none text-white tabular-nums md:text-4xl">{big}</span>
      <span className="font-display text-xs font-semibold uppercase tracking-wide text-slate-400 md:text-sm">{unit}</span>
    </p>
  );
}

/** Aciertos y fallos en cuadros (como el texto para compartir, sin emojis). */
function Marks({ rows, className }: { rows: string[]; className?: string }) {
  const marks = rows.join("");
  const hits = [...marks].filter((m) => m === "o").length;
  return (
    <div role="img" aria-label={`${hits} aciertos de ${marks.length}`} className={cn("grid w-fit grid-cols-10 gap-1", className)}>
      {[...marks].map((m, i) => (
        <span key={i} className={cn("size-3.5 md:size-4", m === "o" ? "bg-emerald-500" : "bg-red-500/80")} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
// La pregunta

function Duel({ play, remaining, best, onAnswer, onExit }: { play: Play; remaining: number | null; best: number; onAnswer: (c: Choice) => void; onExit: () => void }) {
  const q = play.question;
  const { reveal } = play;
  const day = play.mode === "dia";
  const tone = reveal ? (reveal.hit ? "hit" : "miss") : null;
  const urgent = remaining !== null && remaining <= URGENT_MS;
  const category = CATEGORIES[q.category];
  const hits = play.hits + (reveal?.hit ? 1 : 0);

  return (
    // Ocupa la pantalla entera (en el móvil, entre la cabecera y la barra de pestañas): sin hueco debajo ni scroll
    <section aria-label="Pregunta" className="flex min-h-[calc(100svh-52px-5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] flex-col md:min-h-svh">
      {/* Marcador: pregunta, aciertos y reloj (en el infinito, racha y récord) */}
      <div className="flex items-center gap-3 border-b border-slate-800 px-4 py-2.5 md:px-8">
        <button
          type="button"
          onClick={onExit}
          aria-label="Salir"
          title="Salir"
          className="-ml-2 inline-flex size-9 shrink-0 items-center justify-center text-slate-400 outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-orange-400"
        >
          <X className="size-5" />
        </button>
        <p className="min-w-0 flex-1 truncate font-display text-sm font-bold uppercase tracking-[0.15em] text-slate-300 md:text-base">
          {day ? (
            <>
              Pregunta <span className="text-white tabular-nums">{q.index + 1}</span>/{q.total}
              <span className="text-slate-600"> · </span>
              <span className="text-white tabular-nums">{hits}</span> {hits === 1 ? "acierto" : "aciertos"}
            </>
          ) : (
            <>
              Racha <span className="text-white tabular-nums">{hits}</span>
              <span className="text-slate-600"> · </span>
              Récord <span className="text-white tabular-nums">{Math.max(best, hits)}</span>
            </>
          )}
        </p>
        {day && (
          <p
            className={cn(
              "flex shrink-0 items-center gap-1 font-display text-2xl font-extrabold leading-none tabular-nums",
              urgent ? "text-red-400" : "text-white"
            )}
            aria-hidden
          >
            <Timer className="size-5" />
            {remaining === null ? "–" : Math.ceil(remaining / 1000)}
          </p>
        )}
      </div>
      {day && (
        <div className="h-1.5 bg-slate-800" role="progressbar" aria-label="Tiempo" aria-valuemin={0} aria-valuemax={ANSWER_MS / 1000} aria-valuenow={remaining === null ? 0 : Math.ceil(remaining / 1000)}>
          <div className={cn("h-full transition-[width] duration-100 ease-linear", urgent ? "bg-red-500" : "bg-orange-500")} style={{ width: `${((remaining ?? 0) / ANSWER_MS) * 100}%` }} />
        </div>
      )}

      {/* Qué se compara, en grande */}
      <div className="border-b border-slate-800 px-4 py-2 text-center md:py-3">
        <p className="font-display text-4xl font-extrabold uppercase leading-none text-orange-400 md:text-5xl">{category.title}</p>
        <p className="mt-1 font-display text-xs font-semibold uppercase tracking-[0.25em] text-slate-400 md:text-sm">{category.detail(q.season)}</p>
      </div>

      <div className="grid flex-1 grid-cols-2">
        <PlayerPanel side={q.a} align="left" value={<Value category={q.category} value={q.a.value} />} />
        <PlayerPanel
          side={q.b}
          align="right"
          tone={tone}
          value={reveal ? <Value category={q.category} value={reveal.value} count /> : <span className="text-orange-400">?</span>}
        />
      </div>

      <div className="border-y border-slate-800 px-4 pb-4 pt-3 md:px-8">
        <p className="text-center text-base font-semibold leading-snug text-white md:text-lg">{questionText(q.category, q.a, q.b)}</p>
        <div className="mx-auto mt-3 grid max-w-2xl grid-cols-2 gap-2 md:gap-3">
          <AnswerButton choice="mas" play={play} onAnswer={onAnswer} />
          <AnswerButton choice="menos" play={play} onAnswer={onAnswer} />
        </div>
        <p aria-live="polite" className={cn("mt-2 min-h-[1lh] text-center font-display text-base font-bold uppercase tracking-wide", reveal?.hit ? "text-emerald-400" : "text-red-400")}>
          {reveal && (reveal.hit ? (day ? `¡Acierto! +${POINTS_PER_HIT}` : "¡Acierto!") : reveal.choice === null || reveal.late ? "Se acabó el tiempo" : "Fallo")}
        </p>
      </div>

      {/* Fotos de la siguiente pregunta, ya descargándose mientras se enseña la cifra */}
      {play.upcoming && (
        <div aria-hidden className="hidden">
          {[play.upcoming.a.id, play.upcoming.b.id].map((id) => (
            <div key={id} className="relative size-10">
              <PlayerPhoto id={id} fill sizes={PHOTO_SIZES} priority />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function PlayerPanel({ side, align, value, tone = null }: { side: HiddenSide; align: "left" | "right"; value: ReactNode; tone?: "hit" | "miss" | null }) {
  const right = align === "right";
  const { first, last } = splitName(side.name);
  const color = side.team.color;
  return (
    <div
      className="relative min-w-0 overflow-hidden"
      style={{ background: `linear-gradient(${right ? 245 : 115}deg, ${color} 0%, ${color}b3 40%, #020617 95%)` }}
    >
      <div className="absolute inset-0 bg-slate-950/45" aria-hidden />
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: side.team.accent }} aria-hidden />
      <Image
        src={teamLogoUrl(side.teamId)}
        alt=""
        width={240}
        height={240}
        unoptimized
        loading="eager"
        className={cn("pointer-events-none absolute top-6 size-[240px] max-w-none opacity-15 md:size-[320px]", right ? "-left-16" : "-right-16")}
      />
      <div className="relative flex h-full flex-col">
        {/*
          La foto, entera y lo más grande que quepa en el alto que sobra: ni la cabeza ni la barbilla se cortan nunca
          (contain); en un panel estrecho se amplía hasta PHOTO_ZOOM y solo pierde los extremos de los hombros.
        */}
        <div className="relative mt-2 min-h-40 flex-1 [mask-image:linear-gradient(to_bottom,black_64%,transparent)] md:min-h-64">
          <div className={cn("absolute inset-y-0 left-1/2 -translate-x-1/2", PHOTO_ZOOM)}>
            <PlayerPhoto
              key={side.id}
              id={side.id}
              alt={side.name}
              fill
              sizes={PHOTO_SIZES}
              priority
              className="object-contain object-bottom drop-shadow-[0_10px_30px_rgba(0,0,0,0.6)]"
            />
          </div>
        </div>
        {/* Sube sobre el final difuminado de la foto (los hombros): más sitio para la cara */}
        <div className={cn("relative -mt-5 px-3 pb-3 [text-shadow:0_2px_10px_rgba(2,6,23,0.9)] md:-mt-8 md:px-8 md:pb-5", right && "text-right")}>
          <p className="font-display text-sm font-bold uppercase tracking-[0.15em] text-white/90 md:text-base lg:text-lg">
            {first ? `${first} · ${side.team.abbr}` : side.team.abbr}
          </p>
          <p className={cn("line-clamp-2 font-display font-extrabold uppercase leading-[0.9] text-white [overflow-wrap:anywhere]", surnameClass(last))}>{last}</p>
          <p className="pt-2 font-display text-5xl font-extrabold leading-none text-white tabular-nums md:text-7xl">{value}</p>
        </div>
      </div>
      {tone && (
        <>
          <div aria-hidden className={cn("pointer-events-none absolute inset-0 ring-4 ring-inset", tone === "hit" ? "ring-emerald-400" : "ring-red-500")} />
          <span
            aria-hidden
            className={cn("absolute top-3 flex size-9 items-center justify-center md:size-11", right ? "left-3" : "right-3", tone === "hit" ? "bg-emerald-500 text-slate-950" : "bg-red-500 text-white")}
          >
            {tone === "hit" ? <Check className="size-6" strokeWidth={3} /> : <X className="size-6" strokeWidth={3} />}
          </span>
        </>
      )}
    </div>
  );
}

/** Apellido lo más grande posible sin salirse del panel (Barlow Condensed: ~0,48 em por letra en mayúsculas). */
function surnameClass(last: string): string {
  if (last.length <= 9) return "text-4xl lg:text-6xl xl:text-7xl";
  if (last.length <= 12) return "text-3xl lg:text-5xl xl:text-6xl";
  return "text-2xl lg:text-4xl xl:text-5xl";
}

/** Cifra con la unidad pequeña ("18,4 M$"); al destaparse, sube desde cero. */
function Value({ category, value, count = false }: { category: Category; value: number; count?: boolean }) {
  const shown = useCountUp(value, count);
  const [number, unit] = formatValue(category, shown).split(" ");
  return (
    <>
      {number}
      {unit && <span className="ml-1 text-2xl md:text-3xl">{unit}</span>}
    </>
  );
}

const COUNT_MS = 550;

function useCountUp(target: number, animate: boolean): number {
  const [value, setValue] = useState(animate ? 0 : target);
  useEffect(() => {
    if (!animate) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const frame = requestAnimationFrame(() => setValue(target));
      return () => cancelAnimationFrame(frame);
    }
    const start = performance.now();
    let frame = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / COUNT_MS);
      setValue(target * (1 - (1 - k) ** 3));
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, animate]);
  return animate ? value : target;
}

function AnswerButton({ choice, play, onAnswer }: { choice: Choice; play: Play; onAnswer: (c: Choice) => void }) {
  const { reveal, pending } = play;
  const chosen = pending === choice;
  const state = reveal ? (chosen ? (reveal.hit ? "hit" : "miss") : reveal.correct === choice ? "right" : "idle") : chosen ? "pending" : "idle";
  const Icon = choice === "mas" ? ChevronUp : ChevronDown;
  return (
    <button
      type="button"
      onClick={() => onAnswer(choice)}
      disabled={pending !== undefined}
      aria-keyshortcuts={choice === "mas" ? "ArrowUp" : "ArrowDown"}
      className={cn(
        "flex h-15 items-center justify-center gap-1.5 font-display text-2xl font-extrabold uppercase tracking-wide outline-none transition-colors focus-visible:ring-2 focus-visible:ring-orange-400 md:h-18 md:text-3xl",
        state === "idle" && "bg-slate-900 text-white ring-1 ring-inset ring-slate-600 enabled:hover:bg-orange-500 enabled:hover:text-slate-950 enabled:active:bg-orange-600",
        state === "idle" && pending !== undefined && "opacity-40",
        state === "pending" && "animate-pulse bg-orange-500 text-slate-950",
        state === "hit" && "bg-emerald-500 text-slate-950",
        state === "miss" && "bg-red-500 text-white",
        state === "right" && "bg-slate-900 text-emerald-300 ring-2 ring-inset ring-emerald-500"
      )}
    >
      <Icon aria-hidden className="size-7" strokeWidth={3} />
      {choice === "mas" ? "Más" : "Menos"}
    </button>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Al acabar

function DayDone({ day, summary, log, onEndless, nextIn }: { day: string; summary: RunSummary; log: Logged[]; onEndless: () => void; nextIn: number | null }) {
  return (
    <>
      <section aria-label="Tu resultado" className="border-b border-slate-800 bg-gradient-to-r from-orange-500/12 to-transparent px-4 py-4 md:px-8 md:py-6">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.25em] text-orange-400">Reto del día · hecho</p>
        <p className="mt-1 font-display uppercase text-white">
          <span className="text-7xl font-extrabold leading-none tabular-nums md:text-8xl">{summary.points}</span>
          <span className="ml-1 text-2xl font-semibold text-slate-400">/{summary.total * POINTS_PER_HIT} puntos</span>
        </p>
        <p className="mt-1 text-base text-slate-300">
          <strong className="font-semibold text-white">{summary.hits}</strong> de {summary.total} aciertos ·{" "}
          <strong className="font-semibold text-white">{formatSeconds(summary.ms)}</strong> pensando
        </p>
        <Marks rows={summary.rows} className="mt-3" />
        <p className="mt-3 text-sm text-slate-400">
          Preguntas nuevas a las {CHALLENGE_HOUR}:00{nextIn !== null && <> (en {formatCountdown(nextIn)})</>}.
        </p>
      </section>
      <div className="-mt-px border-b border-slate-800">
        <EloChange day={day} game={GAME_ID} />
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-800 px-4 py-3 md:px-8">
        <button
          type="button"
          onClick={onEndless}
          className="inline-flex h-11.5 items-center gap-2 bg-orange-500 px-4 font-display text-lg font-bold uppercase tracking-wide text-slate-950 outline-none transition-colors hover:bg-orange-400 focus-visible:ring-2 focus-visible:ring-orange-300 md:h-11"
        >
          <InfinityIcon aria-hidden className="size-5" /> Modo infinito
        </button>
        <Link
          href="/juegos"
          className="inline-flex h-11.5 items-center gap-2 bg-slate-900 px-4 font-display text-lg font-bold uppercase tracking-wide text-white ring-1 ring-inset ring-slate-700 outline-none transition-colors hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-orange-400 md:h-11"
        >
          Volver a Juegos
        </Link>
      </div>

      <Review log={log} />
    </>
  );
}

/** Repaso: cada pregunta con las dos cifras (aquí ya no hay nada que esconder). */
function Review({ log }: { log: Logged[] }) {
  if (log.length === 0) return null;
  return (
    <details className="group border-b border-slate-800">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-display text-lg font-bold uppercase tracking-wide text-white outline-none hover:text-orange-300 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-400 md:px-8 [&::-webkit-details-marker]:hidden">
        <ListChecks aria-hidden className="size-5 text-orange-400" />
        Repasa las {log.length} preguntas
        <ChevronDown aria-hidden className="ml-auto size-5 text-slate-400 transition-transform group-open:rotate-180" />
      </summary>
      <ol className="border-t border-slate-800">
        {log.map(({ question: q, reveal }, i) => (
          <li key={i} className="flex items-center gap-3 border-b border-slate-800/70 px-4 py-2 last:border-0 md:px-8">
            <span
              aria-label={reveal.hit ? "Acierto" : "Fallo"}
              className={cn("flex size-7 shrink-0 items-center justify-center font-display text-sm font-bold tabular-nums", reveal.hit ? "bg-emerald-500 text-slate-950" : "bg-red-500 text-white")}
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1 text-sm leading-snug">
              <p className="font-display text-xs font-semibold uppercase tracking-wider text-slate-500">{CATEGORIES[q.category].short}</p>
              <p className="text-slate-300">
                {q.a.name} <strong className="text-white">{formatValue(q.category, q.a.value)}</strong>
                <span className="text-slate-600"> · </span>
                {q.b.name} <strong className="text-white">{formatValue(q.category, reveal.value)}</strong>
              </p>
            </div>
          </li>
        ))}
      </ol>
    </details>
  );
}

function EndlessDone({
  result,
  onAgain,
  dayPending,
  onDay,
}: {
  result: Extract<Screen, { kind: "endless-done" }>;
  onAgain: () => void;
  dayPending: boolean;
  onDay: () => void;
}) {
  const { streak, best, record, last } = result;
  return (
    <>
      <section aria-label="Tu racha" className="border-b border-slate-800 bg-gradient-to-r from-orange-500/12 to-transparent px-4 py-4 md:px-8 md:py-6">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.25em] text-orange-400">
          Modo infinito · {record && streak > 0 ? "¡nuevo récord!" : `récord ${best}`}
        </p>
        <p className="mt-1 font-display uppercase text-white">
          <span className="text-7xl font-extrabold leading-none tabular-nums md:text-8xl">{streak}</span>
          <span className="ml-2 text-2xl font-semibold text-slate-400">{streak === 1 ? "acierto seguido" : "aciertos seguidos"}</span>
        </p>
        {last && (
          <p className="mt-2 text-base text-slate-300">
            La última ({CATEGORIES[last.question.category].short.toLowerCase()}): {last.question.a.name}{" "}
            <strong className="text-white">{formatValue(last.question.category, last.question.a.value)}</strong> y {last.question.b.name}{" "}
            <strong className="text-white">{formatValue(last.question.category, last.reveal.value)}</strong>.
          </p>
        )}
      </section>
      <div className="flex flex-wrap gap-2 border-b border-slate-800 px-4 py-3 md:px-8">
        <button
          type="button"
          onClick={onAgain}
          className="inline-flex h-11.5 items-center gap-2 bg-orange-500 px-4 font-display text-lg font-bold uppercase tracking-wide text-slate-950 outline-none transition-colors hover:bg-orange-400 focus-visible:ring-2 focus-visible:ring-orange-300 md:h-11"
        >
          <RotateCcw aria-hidden className="size-5" /> Otra vez
        </button>
        {dayPending && (
          <button
            type="button"
            onClick={onDay}
            className="inline-flex h-11.5 items-center gap-2 bg-slate-900 px-4 font-display text-lg font-bold uppercase tracking-wide text-white ring-1 ring-inset ring-orange-500 outline-none transition-colors hover:bg-orange-500 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-orange-400 md:h-11"
          >
            <Timer aria-hidden className="size-5" /> Reto del día
          </button>
        )}
        <Link
          href="/juegos"
          className="inline-flex h-11.5 items-center gap-2 bg-slate-900 px-4 font-display text-lg font-bold uppercase tracking-wide text-white ring-1 ring-inset ring-slate-700 outline-none transition-colors hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-orange-400 md:h-11"
        >
          Volver a Juegos
        </Link>
      </div>
    </>
  );
}
