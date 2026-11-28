"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Check, ChevronRight } from "lucide-react";
import { PlayerPhoto } from "@/components/players/PlayerPhoto";
import {
  CLUE_LABEL,
  CLUE_ORDER,
  clueText,
  MAX_GUESSES,
  NEAR,
  POINTS_BY_GUESS,
  type Clue,
  type ClueKey,
  type GuessRow,
  type PublicPuzzle,
  type PublicSuspect,
  type RunView,
  type Suspect,
} from "@/lib/adivina";
import { CHALLENGE_HOUR, challengeTitle, formatCountdown, openRun, playedDays, resultsOfDay, streakOf, type ChallengeResult } from "@/lib/games";
import { recordResult, recordRun, useChallengeClock, useGamesProgress } from "@/lib/games-store";
import { teamLogoUrl } from "@/lib/nba-cdn";
import { playerPath } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { api, ApiError, attemptText, errorText, postMove } from "./game-api";
import { PlayerGuessInput } from "./PlayerGuessInput";
import { RadarHuella } from "./RadarHuella";
import { EloChange } from "./EloChange";
import { ShareDayButton } from "./ShareDayButton";

const API = "/api/juegos/adivina";
const GAME_ID = "adivina";

type Loaded = { puzzle: PublicPuzzle; run: string | null; view: RunView | null };

const loadPuzzle = (run: string | null) =>
  api<{ puzzle: PublicPuzzle; run?: string | null; view?: RunView | null }>(run ? `${API}?run=${run}` : API, { cache: run ? "no-store" : "default" }).then(
    (data): Loaded => ({ puzzle: data.puzzle, run: data.run ?? null, view: data.view ?? null })
  );

const postGuess = (body: { run: string | null; day: string; index: number; player: number }) =>
  postMove<{ run: string; view: RunView }>(API, { action: "guess", ...body });

/**
 * Adivina el jugador (Tarea 8.3): el radar del jugador del día y 6 intentos con pistas. El jugador es el mismo para
 * todos y lo decide el servidor, que corrige cada intento (el número de intento y los puntos también son suyos): aquí
 * solo se pinta lo que devuelve. La partida se guarda por su número en el dispositivo para seguirla al volver.
 * Nada depende de partidos: igual en los tres niveles de spoilers.
 */
export function Adivina() {
  const progress = useGamesProgress();
  const clock = useChallengeClock();
  const [data, setData] = useState<Loaded | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState<PublicSuspect | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const busy = useRef(false);
  const requested = useRef<string | null>(null);

  const day = clock?.day ?? null;
  const today = progress && day ? resultsOfDay(progress, day) : null;
  const doneToday = today?.find((r) => r.game === GAME_ID) ?? null;
  const view = data?.view ?? null;
  const said = useMemo(() => new Set(view?.guesses.map((g) => g.id) ?? []), [view]);

  /** Lo que dijo el servidor: si ha acabado, se apunta (solo cuenta el primero de cada día). */
  function show(next: Loaded) {
    setData(next);
    setFailure(null);
    const summary = next.view?.summary;
    if (next.view && summary) recordResult({ day: next.view.day, game: GAME_ID, points: summary.points, rows: summary.rows, receipt: summary.receipt });
  }

  /** El reto de ese día, con la partida que hubiera empezada en este dispositivo. */
  function load(forDay: string) {
    requested.current = forDay;
    const run = progress ? openRun(progress, GAME_ID, forDay) : null;
    loadPuzzle(run)
      .then((loaded) => requested.current === forDay && show(loaded))
      .catch((error) => requested.current === forDay && setFailure(errorText(error)));
  }

  // Al saber el día, el reto; a las 7:00, si la página sigue abierta, el nuevo (nunca encima de un tablero jugado)
  const onDay = useEffectEvent((forDay: string) => {
    if (requested.current !== forDay && !data?.view) load(forDay);
  });
  useEffect(() => {
    if (day && progress !== null) onDay(day);
  }, [day, progress]);

  function retry() {
    if (!day) return;
    setFailure(null);
    load(day);
  }

  function guess(suspect: PublicSuspect) {
    if (!data || busy.current || data.view?.finished) return;
    busy.current = true;
    setPending(suspect);
    setNotice(null);
    const { puzzle, run } = data;
    postGuess({ run, day: puzzle.day, index: data.view?.guesses.length ?? 0, player: suspect.id })
      .then((answer) => {
        if (run === null) recordRun(GAME_ID, { day: answer.view.day, run: answer.run });
        show({ puzzle, run: answer.run, view: answer.view });
      })
      .catch((error) => {
        const code = error instanceof ApiError ? error.code : null;
        if (code === "new-day" && day) {
          // A las 7:00 cambia el jugador: el de hoy, desde cero
          setNotice("Ya hay jugador nuevo: este es el de hoy.");
          setData(null);
          load(day);
        } else if (code === "out-of-order" && run) {
          // Se siguió en otra pestaña: lo que diga el servidor
          loadPuzzle(run).then(show, () => setNotice(errorText(error)));
        } else {
          setNotice(errorText(error));
        }
      })
      .finally(() => {
        busy.current = false;
        setPending(null);
      });
  }

  // Compartir: el día de la partida que se ve (o el de hoy si ya estaba jugado)
  const shareDay = view?.finished ? view.day : doneToday ? day : null;
  const shareResults = progress && shareDay ? resultsOfDay(progress, shareDay) : [];

  return (
    <>
      <header className="flex items-end justify-between gap-3 border-b border-slate-800 px-4 pb-3 pt-4 md:px-8 md:pb-5 md:pt-10">
        <div className="min-w-0">
          <Link
            href="/juegos"
            className="inline-flex items-center gap-1 font-display text-xs font-semibold uppercase tracking-[0.2em] text-orange-400 hover:text-orange-300 sm:tracking-[0.3em]"
          >
            <ArrowLeft aria-hidden className="size-3.5" />
            Juegos · {challengeTitle(day)}
          </Link>
          <h1 className="font-display text-4xl font-extrabold uppercase leading-none text-white md:text-6xl">Adivina el jugador</h1>
        </div>
        {progress && shareDay && shareResults.length > 0 && (
          <ShareDayButton day={shareDay} results={shareResults} streakDays={streakOf(playedDays(progress), shareDay).days} />
        )}
      </header>

      <StatusStrip view={view} done={doneToday} known={data !== null} />

      <div className="grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:divide-x md:divide-slate-800">
        <section aria-labelledby="radar-del-dia" className="border-b border-slate-800 px-4 pb-3 pt-4 md:px-8 md:pt-6">
          <h2 id="radar-del-dia" className="font-display text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
            Su radar · temporada {data?.puzzle.season ?? ""}
          </h2>
          {/* Mismo hueco antes de llegar el radar: nada salta */}
          <div className="mx-auto aspect-[400/312] w-full max-w-md">
            {data ? <RadarHuella radar={data.puzzle.radar} /> : <div className="size-full animate-pulse bg-slate-900/60" aria-hidden />}
          </div>
          <p className="text-center text-xs text-slate-500">De 40 a 99 frente a la rotación · discontinua: la mitad de la liga</p>
        </section>

        <div className="min-w-0 border-b border-slate-800">
          {failure ? (
            <div className="px-4 py-6 md:px-8">
              <p className="text-sm text-red-300">{failure}</p>
              <button
                type="button"
                onClick={retry}
                className="mt-3 inline-flex h-11.5 items-center bg-slate-900 px-4 font-display text-lg font-bold uppercase tracking-wide text-white ring-1 ring-inset ring-slate-700 outline-none hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-orange-400 md:h-11"
              >
                Reintentar
              </button>
            </div>
          ) : view?.finished && view.answer ? (
            <Reveal view={view} answer={view.answer} nextIn={clock ? clock.next - clock.now : null} />
          ) : doneToday && !view ? (
            <DoneElsewhere result={doneToday} nextIn={clock ? clock.next - clock.now : null} />
          ) : (
            <PlayerGuessInput
              options={data?.puzzle.suspects ?? null}
              said={said}
              pending={pending !== null}
              onPick={guess}
              notice={notice}
              placeholder="Escribe un jugador en activo"
              hint="Cada intento destapa cinco pistas."
              nothing="Ningún jugador en activo con ese nombre."
            />
          )}
          {(view?.guesses.length || pending) && <Board guesses={view?.guesses ?? []} pending={pending} />}
          <Legend />
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Cómo va

function StatusStrip({ view, done, known }: { view: RunView | null; done: ChallengeResult | null; known: boolean }) {
  const used = view?.guesses.length ?? 0;
  const finished = view?.finished ?? done !== null;
  return (
    <div className="flex min-h-11 items-center gap-3 border-b border-slate-800 px-4 py-2 md:px-8">
      {/* Los 6 intentos: verde el acierto, gris los fallados */}
      <ol className="flex gap-1" aria-label={`${used} de ${MAX_GUESSES} intentos`}>
        {Array.from({ length: MAX_GUESSES }, (_, i) => {
          const guess = view?.guesses[i];
          return (
            <li
              key={i}
              className={cn(
                "h-2 w-5 md:w-7",
                guess ? (guess.hit ? "bg-emerald-500" : "bg-slate-500") : i === used && !finished ? "bg-orange-500/70" : "bg-slate-800"
              )}
            />
          );
        })}
      </ol>
      <p className="min-w-0 flex-1 truncate font-display text-sm font-bold uppercase tracking-[0.15em] text-slate-300">
        {!known ? null : view?.finished && view.summary ? (
          view.solved ? (
            <span className="text-emerald-400">
              Acertado {attemptText(view.summary.attempts)} · +{view.summary.points}
            </span>
          ) : (
            <span className="text-slate-300">Sin acertar · sigue tu racha</span>
          )
        ) : done ? (
          <span className="text-emerald-400">
            Hecho hoy · {done.points}/{POINTS_BY_GUESS[0]}
          </span>
        ) : (
          <>
            Intento <span className="text-white tabular-nums">{used + 1}</span>/{MAX_GUESSES}
            <span className="text-slate-600"> · </span>
            vale <span className="text-orange-400 tabular-nums">+{POINTS_BY_GUESS[used]}</span>
          </>
        )}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Intentos

function Board({ guesses, pending }: { guesses: GuessRow[]; pending: PublicSuspect | null }) {
  // El último arriba, junto al buscador
  const rows = guesses.map((g, i) => ({ g, n: i + 1 })).reverse();
  const list = useRef<HTMLOListElement>(null);
  const seen = useRef(guesses.length);

  // Un intento nuevo (no los de una partida que se retoma): si su fila queda debajo de la pantalla, se sube hasta ella
  useEffect(() => {
    if (guesses.length <= seen.current) return;
    seen.current = guesses.length;
    const row = list.current?.firstElementChild;
    if (!row || row.getBoundingClientRect().bottom < window.innerHeight - 96) return;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    row.scrollIntoView({ block: "center", behavior: smooth ? "smooth" : "auto" });
  }, [guesses.length]);

  return (
    <section aria-label="Tus intentos" className="border-t border-slate-800">
      <div className="grid grid-cols-5 gap-1 px-4 pt-2 md:px-8 lg:ml-auto lg:w-[24rem]">
        {CLUE_ORDER.map((k) => (
          <span key={k} className="text-center font-display text-xs font-semibold uppercase tracking-wider text-slate-400">
            {CLUE_LABEL[k]}
          </span>
        ))}
      </div>
      <ol ref={list}>
        {pending && <PendingRow suspect={pending} n={guesses.length + 1} />}
        {rows.map(({ g, n }) => (
          <Row key={g.id} guess={g} n={n} />
        ))}
      </ol>
    </section>
  );
}

function RowShell({ n, suspect, hit, children }: { n: number; suspect: PublicSuspect; hit?: boolean; children: ReactNode }) {
  return (
    <li className="border-b border-slate-800/70 px-4 py-2 last:border-0 md:px-8 lg:flex lg:items-center lg:gap-4">
      <p className="mb-1 flex min-w-0 items-center gap-2 lg:mb-0 lg:flex-1">
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center font-display text-sm font-bold tabular-nums",
            hit ? "bg-emerald-500 text-slate-950" : "bg-slate-800 text-slate-300"
          )}
        >
          {n}
        </span>
        <Image src={teamLogoUrl(suspect.teamId)} alt="" width={24} height={24} unoptimized className="size-6 shrink-0" />
        <span className="min-w-0 truncate text-base font-semibold text-white">{suspect.name}</span>
        <span className="shrink-0 font-display text-sm font-bold uppercase tracking-wide text-slate-400">{suspect.team}</span>
      </p>
      <div className="grid grid-cols-5 gap-1 lg:w-[24rem] lg:shrink-0">{children}</div>
    </li>
  );
}

function Row({ guess, n }: { guess: GuessRow; n: number }) {
  return (
    <RowShell n={n} suspect={guess} hit={guess.hit}>
      {CLUE_ORDER.map((k, i) => (
        <Tile key={k} clueKey={k} clue={guess.clues[k]} text={clueText(k, guess)} delay={i * 70} />
      ))}
    </RowShell>
  );
}

function PendingRow({ suspect, n }: { suspect: PublicSuspect; n: number }) {
  return (
    <RowShell n={n} suspect={suspect}>
      {CLUE_ORDER.map((k) => (
        <span key={k} className="h-12 animate-pulse bg-slate-800 md:h-13" />
      ))}
    </RowShell>
  );
}

const MARK_CLASS = {
  o: "bg-emerald-500 text-slate-950",
  c: "bg-amber-400 text-slate-950",
  x: "bg-red-500/15 text-red-100 ring-1 ring-inset ring-red-500/40",
} as const;

const MARK_WORD = { o: "coincide", c: "cerca", x: "no coincide" } as const;

const DIRECTION_WORD: Record<"age" | "height" | "media", Record<"up" | "down", string>> = {
  age: { up: "es mayor", down: "es más joven" },
  height: { up: "es más alto", down: "es más bajo" },
  media: { up: "tiene más media", down: "tiene menos media" },
};

/** Una pista: el dato del que has dicho, su color y, si no coincide, hacia dónde está el del día. Se destapa en cascada. */
function Tile({ clueKey, clue, text, delay }: { clueKey: ClueKey; clue: Clue; text: string; delay: number }) {
  const Arrow = clue.dir === "up" ? ArrowUp : clue.dir === "down" ? ArrowDown : null;
  const direction = clue.dir && clueKey !== "conf" && clueKey !== "pos" ? `: el del día ${DIRECTION_WORD[clueKey][clue.dir]}` : "";
  return (
    <span
      role="img"
      aria-label={`${CLUE_LABEL[clueKey]} ${text}, ${MARK_WORD[clue.mark]}${direction}`}
      style={{ animationDelay: `${delay}ms` }}
      className={cn(
        "flex h-12 items-center justify-center gap-0.5 px-0.5 font-display font-extrabold uppercase leading-none animate-in fade-in zoom-in-90 fill-mode-both duration-300 motion-reduce:animate-none md:h-13",
        text.length > 5 ? "text-base md:text-lg" : "text-xl md:text-2xl",
        MARK_CLASS[clue.mark]
      )}
    >
      <span className="truncate">{text}</span>
      {Arrow && <Arrow aria-hidden className="size-4 shrink-0 md:size-5" strokeWidth={3} />}
    </span>
  );
}

function Legend() {
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-800 px-4 py-3 text-xs text-slate-400 md:px-8">
      <span className="flex items-center gap-1.5">
        <span className="size-3 bg-emerald-500" aria-hidden /> Coincide
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-3 bg-amber-400" aria-hidden /> Cerca: ±{NEAR.age} años, ±{NEAR.height} cm, ±{NEAR.media} de media o posición en parte
      </span>
      <span className="flex items-center gap-1.5">
        <ArrowUp aria-hidden className="size-3.5 text-slate-300" strokeWidth={3} />
        <ArrowDown aria-hidden className="size-3.5 text-slate-300" strokeWidth={3} /> Hacia dónde está el del día
      </span>
    </p>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Al acabar

function Reveal({ view, answer, nextIn }: { view: RunView; answer: Suspect; nextIn: number | null }) {
  const summary = view.summary!;
  return (
    <section aria-label="El jugador del día" className="relative overflow-hidden">
      <Image
        src={teamLogoUrl(answer.teamId)}
        alt=""
        width={220}
        height={220}
        unoptimized
        className="pointer-events-none absolute -right-10 -top-6 size-[220px] max-w-none opacity-10"
      />
      <div className={cn("relative flex items-end gap-3 px-4 pt-4 md:gap-5 md:px-8 md:pt-6", view.solved ? "bg-gradient-to-r from-emerald-500/15 to-transparent" : "bg-gradient-to-r from-orange-500/12 to-transparent")}>
        <div className="relative h-28 w-38 shrink-0 md:h-36 md:w-49">
          <PlayerPhoto id={answer.id} alt={answer.name} fill sizes="200px" priority className="object-contain object-bottom" />
        </div>
        <div className="min-w-0 pb-3">
          <p className={cn("flex items-center gap-1.5 font-display text-sm font-bold uppercase tracking-wide", view.solved ? "text-emerald-400" : "text-orange-400")}>
            {view.solved ? (
              <>
                <Check aria-hidden className="size-4" strokeWidth={3} /> ¡Acertado {attemptText(summary.attempts)}!
              </>
            ) : (
              "Era…"
            )}
          </p>
          <p className="font-display text-3xl font-extrabold uppercase leading-[0.95] text-white md:text-5xl">{answer.name}</p>
          <p className="mt-1 font-display text-sm font-semibold uppercase tracking-wide text-slate-300">
            {[answer.team, clueText("conf", answer), clueText("pos", answer), answer.age !== null ? `${answer.age} años` : null, clueText("height", answer), answer.media !== null ? `Media ${answer.media}` : null]
              .filter((x) => x && x !== "–")
              .join(" · ")}
          </p>
        </div>
      </div>
      <div className="relative flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-800 px-4 py-3 md:px-8">
        <p className="font-display uppercase text-white">
          <span className="text-5xl font-extrabold leading-none tabular-nums">{summary.points}</span>
          <span className="ml-1 text-lg font-semibold text-slate-400">/{POINTS_BY_GUESS[0]} puntos</span>
        </p>
        <Link
          href={playerPath(answer.id, answer.name)}
          className="inline-flex h-11.5 items-center gap-1 bg-slate-900 pl-4 pr-3 font-display text-lg font-bold uppercase tracking-wide text-white ring-1 ring-inset ring-slate-700 outline-none transition-colors hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-orange-400 md:h-11"
        >
          Su ficha <ChevronRight aria-hidden className="size-5" />
        </Link>
        <Link
          href="/juegos"
          className="inline-flex h-11.5 items-center bg-orange-500 px-4 font-display text-lg font-bold uppercase tracking-wide text-slate-950 outline-none transition-colors hover:bg-orange-400 focus-visible:ring-2 focus-visible:ring-orange-300 md:h-11"
        >
          Más retos
        </Link>
        <p className="w-full text-sm text-slate-400">
          Jugador nuevo a las {CHALLENGE_HOUR}:00{nextIn !== null && <> (en {formatCountdown(nextIn)})</>}. Comparte tu resultado: va sin el nombre.
        </p>
      </div>
      <EloChange day={view.day} game="adivina" />
    </section>
  );
}

/** Ya jugado hoy, pero la partida no está (otro dispositivo o se borró): el resultado guardado. */
function DoneElsewhere({ result, nextIn }: { result: ChallengeResult; nextIn: number | null }) {
  return (
    <>
      <section aria-label="Tu resultado" className="bg-gradient-to-r from-orange-500/12 to-transparent px-4 py-4 md:px-8 md:py-6">
        <p className="flex items-center gap-1.5 font-display text-sm font-bold uppercase tracking-wide text-emerald-400">
          <Check aria-hidden className="size-4" /> Hecho hoy
        </p>
        <p className="font-display uppercase text-white">
          <span className="text-5xl font-extrabold leading-none tabular-nums">{result.points}</span>
          <span className="ml-1 text-lg font-semibold text-slate-400">/{POINTS_BY_GUESS[0]} puntos</span>
        </p>
        <div className="mt-3 grid w-fit gap-1" role="img" aria-label={`${result.rows.length} intentos`}>
          {result.rows.map((row, i) => (
            <span key={i} className="flex gap-1">
              {[...row].map((m, j) => (
                <span key={j} className={cn("size-4", m === "o" ? "bg-emerald-500" : m === "c" ? "bg-amber-400" : "bg-red-500/60")} />
              ))}
            </span>
          ))}
        </div>
        <p className="mt-3 text-sm text-slate-400">
          Jugador nuevo a las {CHALLENGE_HOUR}:00{nextIn !== null && <> (en {formatCountdown(nextIn)})</>}.
        </p>
      </section>
      <EloChange day={result.day} game="adivina" />
    </>
  );
}
