"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { Check, ChevronRight, Dices, Flame, LogOut, Medal, Pencil, RefreshCw, Star, Trash2, Trophy } from "lucide-react";
import { transferSummary } from "@/lib/account";
import {
  completeSignIn,
  createAccount,
  deleteAccount,
  failSignIn,
  renameAlias,
  retryAccount,
  signInWithGoogle,
  signOut,
  useAccount,
  type AccountState,
} from "@/lib/account-store";
import { ALIAS_MAX, checkAlias, suggestAlias } from "@/lib/alias";
import { eloOf } from "@/lib/elo";
import { useFavorites } from "@/lib/favorites-store";
import { divisionOf, playedDays, streakOf } from "@/lib/games";
import { useChallengeClock, useGamesProgress } from "@/lib/games-store";
import { LEGAL } from "@/lib/legal";
import { cn } from "@/lib/utils";
import { DIVISION_COLORS, DivisionEmblem } from "@/components/juegos/DivisionEmblem";
import { formatElo } from "@/components/juegos/EloChange";
import { GoogleButton } from "./GoogleButton";

type Ready = Extract<AccountState, { status: "ready" }>;

/** Solo rutas de la propia app ("/juegos"), nunca otra web. */
const internalPath = (value: string | null): string | null => (value && /^\/(?!\/)[\w\-/]*$/.test(value) ? value : null);

const monthYear = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "Europe/Madrid" });
const dayMonth = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", timeZone: "Europe/Madrid" });

const PRIMARY =
  "inline-flex h-11.5 items-center gap-2 bg-orange-500 px-5 font-display text-lg font-extrabold uppercase tracking-wide text-slate-950 outline-none transition-colors hover:bg-orange-400 focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:opacity-50";
const SECONDARY =
  "inline-flex h-11.5 items-center gap-2 border border-slate-700 px-4 font-display text-base font-bold uppercase tracking-wide text-slate-200 outline-none transition-colors hover:border-slate-500 hover:text-white focus-visible:ring-2 focus-visible:ring-orange-400 disabled:opacity-50";

/**
 * Tu cuenta (Tarea 8.5): entrar con Google, elegir alias, lo que se guarda, cambiar el alias, cerrar sesión y borrarla.
 * La página es la misma para todos (estática): todo se pinta al saber si hay sesión en este dispositivo. La vuelta de
 * Google en la web llega aquí con `?code=…`. Nada de esto depende de partidos: igual en los tres niveles de spoilers.
 */
export function AccountScreen() {
  const account = useAccount();
  const [back, setBack] = useState<string | null>(null);

  // Vuelta de Google (`?code=…` o `?error=…`): se quita de la dirección al momento
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const volver = internalPath(params.get("volver"));
    const code = params.get("code");
    const error = params.get("error");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- la dirección solo se lee en el navegador
    setBack(volver);
    if (!code && !error) return;
    window.history.replaceState(null, "", volver ? `/cuenta?volver=${encodeURIComponent(volver)}` : "/cuenta");
    if (code) void completeSignIn(code);
    else failSignIn(error === "access_denied");
  }, []);

  switch (account.status) {
    case "signed-out":
      return <SignedOut notice={account.notice} back={back} />;
    case "needs-alias":
      return <ChooseAlias email={account.email} />;
    case "ready":
      return <AccountReady state={account} back={back} />;
    case "unavailable":
      return <Unavailable message={account.message} />;
    default:
      return <Loading />;
  }
}

function Header({ kicker, title, aside, asWritten = false }: { kicker: ReactNode; title: ReactNode; aside?: ReactNode; asWritten?: boolean }) {
  return (
    <header className="flex items-end justify-between gap-3 border-b border-slate-800 px-4 pb-3 pt-4 md:px-8 md:pb-5 md:pt-10">
      <div className="min-w-0">
        <p className="truncate font-display text-xs font-semibold uppercase tracking-[0.2em] text-orange-400 sm:tracking-[0.3em]">{kicker}</p>
        {/* El alias, tal como lo escribió (sin pasarlo a mayúsculas) */}
        <h1 className={cn("break-all font-display text-4xl font-extrabold leading-none text-white md:text-6xl", !asWritten && "uppercase")}>{title}</h1>
      </div>
      {aside}
    </header>
  );
}

function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "error" | "ok" }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "mt-3 max-w-2xl border-l-2 pl-3 text-sm",
        tone === "error" ? "border-red-500 text-slate-200" : tone === "ok" ? "border-emerald-500 text-slate-200" : "border-orange-500 text-slate-200"
      )}
    >
      {children}
    </p>
  );
}

function Loading() {
  return (
    <>
      <Header kicker="Opcional · gratis" title="Tu cuenta" />
      <div aria-busy className="border-b border-slate-800 px-4 py-5 md:px-8">
        <span className="sr-only">Cargando tu cuenta…</span>
        <div aria-hidden className="h-24 max-w-2xl animate-pulse bg-slate-900/70" />
        <div aria-hidden className="mt-4 h-12 w-56 animate-pulse bg-slate-900/70" />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Sin sesión

function SignedOut({ notice, back }: { notice?: string; back: string | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function enter() {
    setBusy(true);
    setError(null);
    signInWithGoogle(back)
      .catch(() => setError("No se ha podido abrir Google. Inténtalo otra vez."))
      // En la web la página se va a Google; en la app, al volver, el botón ya está libre
      .finally(() => setTimeout(() => setBusy(false), 4_000));
  }

  return (
    <>
      <Header kicker="Opcional · gratis" title="Tu cuenta" />
      <section aria-label="Qué ganas con la cuenta" className="grid divide-y divide-slate-800 border-b border-slate-800 md:grid-cols-3 md:divide-x md:divide-y-0">
        <Benefit icon={Trophy} title="Tu ELO y tu racha, a salvo">
          En el móvil y en el ordenador, y aunque borres los datos del navegador. Lo que ya has jugado aquí pasa a tu cuenta.
        </Benefit>
        <Benefit icon={Star} title="Tus favoritos, contigo">
          Marca un equipo en el móvil y la portada del ordenador ya sale con sus partidos primero.
        </Benefit>
        <Benefit icon={Medal} title="Clasificación y premios">
          Con tu alias, para competir con todo Hoopmeter y con tus amigos. Llegan muy pronto.
        </Benefit>
      </section>
      <section className="border-b border-slate-800 px-4 py-5 md:px-8">
        <GoogleButton onClick={enter} busy={busy} />
        {notice && <Notice>{notice}</Notice>}
        {error && <Notice tone="error">{error}</Notice>}
        <p className="mt-4 max-w-2xl text-sm text-slate-400">
          Sin cuenta, todo sigue funcionando igual. Hace falta tener {LEGAL.minAge} años o más. Solo guardamos tu email de Google,
          tu alias, tus resultados y tus favoritos (
          <Link href="/privacidad#cuentas" className="text-orange-400 hover:underline">
            Privacidad
          </Link>
          ). El nivel de spoilers nunca se guarda: la app siempre se abre en «Todo oculto».
        </p>
      </section>
    </>
  );
}

function Benefit({ icon: Icon, title, children }: { icon: typeof Trophy; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 px-4 py-4 md:block md:px-8 md:py-5">
      <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-orange-400 md:mb-2 md:size-6" />
      <div>
        <h2 className="font-display text-lg font-bold uppercase tracking-wide text-white">{title}</h2>
        <p className="mt-0.5 text-sm leading-relaxed text-slate-300">{children}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Alias

/** El campo del alias con su "@", el botón de sugerir y el aviso mientras se escribe. */
function AliasField({ value, onChange, problem, hint }: { value: string; onChange: (alias: string) => void; problem: string | null; hint: ReactNode }) {
  return (
    <div>
      <label htmlFor="alias" className="font-display text-xs font-semibold uppercase tracking-[0.25em] text-slate-300">
        Alias
      </label>
      <div className="mt-2 flex max-w-md bg-slate-900 ring-1 ring-inset ring-slate-700 focus-within:ring-orange-500">
        <span aria-hidden className="flex items-center pl-3 font-display text-2xl font-bold text-slate-500">
          @
        </span>
        <input
          id="alias"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={ALIAS_MAX + 4}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={problem !== null}
          aria-describedby="alias-hint"
          className="h-12 min-w-0 flex-1 bg-transparent px-1 font-display text-2xl font-bold text-white outline-none"
        />
        <button
          type="button"
          onClick={() => onChange(suggestAlias())}
          aria-label="Sugerir otro alias"
          title="Sugerir otro alias"
          className="flex w-12 items-center justify-center border-l border-slate-700 text-slate-300 outline-none transition-colors hover:text-orange-400 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-400"
        >
          <Dices className="size-5" aria-hidden />
        </button>
      </div>
      <p id="alias-hint" aria-live="polite" className={cn("mt-2 min-h-5 text-sm", problem ? "text-red-300" : "text-slate-400")}>
        {problem ?? hint}
      </p>
    </div>
  );
}

function ChooseAlias({ email }: { email: string | null }) {
  const [alias, setAlias] = useState(() => suggestAlias());
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const progress = useGamesProgress();
  const favorites = useFavorites();
  const check = checkAlias(alias);
  const transfer = progress ? transferSummary(progress, favorites) : null;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!check.ok || !adult || busy) return;
    setBusy(true);
    setError(null);
    createAccount(check.alias).then((failure) => {
      setBusy(false);
      if (failure) setError(failure.error);
    });
  }

  return (
    <>
      <Header kicker="Último paso" title="Elige tu alias" />
      <section className="border-b border-slate-800 px-4 py-5 md:px-8">
        {email && (
          <p className="mb-4 text-sm text-slate-400">
            Has entrado con Google como <strong className="font-medium text-slate-200">{email}</strong>.
          </p>
        )}
        <form onSubmit={submit} noValidate>
          <AliasField
            value={alias}
            onChange={(next) => {
              setAlias(next);
              setError(null);
            }}
            problem={check.ok ? null : check.message}
            hint="Es lo único tuyo que verá la gente (en las clasificaciones). Puedes cambiarlo una vez por semana."
          />
          <label className="mt-3 flex max-w-md cursor-pointer items-start gap-3 text-sm text-slate-200">
            <input type="checkbox" checked={adult} onChange={(event) => setAdult(event.target.checked)} className="mt-0.5 size-5 shrink-0 accent-orange-500" />
            <span>
              Tengo {LEGAL.minAge} años o más y acepto lo que dice{" "}
              <Link href="/privacidad#cuentas" className="text-orange-400 hover:underline">
                Privacidad
              </Link>{" "}
              sobre las cuentas.
            </span>
          </label>
          {transfer && transfer.results + transfer.favorites > 0 && (
            <p className="mt-4 flex max-w-md items-start gap-2 text-sm text-slate-300">
              <Check className="mt-0.5 size-4 shrink-0 text-emerald-400" aria-hidden />
              <span>
                Pasan a tu cuenta lo jugado en este dispositivo ({plural(transfer.results, "reto", "retos")}, con su ELO y su racha) y{" "}
                {plural(transfer.favorites, "favorito", "favoritos")}.
              </span>
            </p>
          )}
          {error && <Notice tone="error">{error}</Notice>}
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <button type="submit" disabled={!check.ok || !adult || busy} className={PRIMARY}>
              {busy ? "Creando…" : "Crear cuenta"}
            </button>
            <button
              type="button"
              disabled={leaving}
              onClick={() => {
                setLeaving(true);
                void signOut();
              }}
              className="text-sm text-slate-400 underline-offset-4 hover:text-white hover:underline"
            >
              Ahora no
            </button>
          </div>
        </form>
      </section>
    </>
  );
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("es-ES")} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------------------------------------------------
// Con cuenta

function AccountReady({ state, back }: { state: Ready; back: string | null }) {
  const { account, email } = state;
  const progress = useGamesProgress();
  const favorites = useFavorites();
  const clock = useChallengeClock();

  const mine = useMemo(() => {
    if (!progress) return null;
    const elo = eloOf(progress.results);
    return {
      elo: elo.elo,
      division: divisionOf(elo.elo),
      streak: clock ? streakOf(playedDays(progress), clock.day).days : null,
      played: progress.results.length,
    };
  }, [progress, clock]);
  const since = monthYear.format(new Date(account.createdAt));

  return (
    <>
      <Header
        kicker={`Tu cuenta · desde ${since}`}
        title={`@${account.alias}`}
        asWritten
        aside={mine && <DivisionEmblem id={mine.division.division.id} rank={mine.division.rank} className="w-12 shrink-0 md:w-16" />}
      />

      {/* Las líneas entre cifras son el fondo que asoma entre ellas (gap-px) */}
      <section aria-label="Lo tuyo" className="grid grid-cols-2 gap-px border-b border-slate-800 bg-slate-800 md:grid-cols-4">
        <Stat label="ELO" value={mine ? formatElo(mine.elo) : null}>
          {mine && <span className={DIVISION_COLORS[mine.division.division.id]?.text}>{mine.division.division.name}</span>}
        </Stat>
        <Stat label="Racha" value={mine?.streak != null ? plural(mine.streak, "día", "días") : null}>
          <Flame aria-hidden className="inline size-3.5 text-orange-400" /> cualquier reto cuenta
        </Stat>
        <Stat label="Retos jugados" value={mine ? mine.played.toLocaleString("es-ES") : null}>
          desde el primero
        </Stat>
        <Stat label="Favoritos" value={(favorites.teams.length + favorites.players.length).toLocaleString("es-ES")}>
          equipos y jugadores
        </Stat>
      </section>

      <section className="border-b border-slate-800 px-4 py-4 md:px-8">
        <p className="max-w-2xl text-sm text-slate-300">
          Tus resultados, tu ELO, tu racha y tus favoritos se guardan en tu cuenta y llegan a cualquier dispositivo en el que
          entres con Google. El nivel de spoilers nunca: la app siempre se abre en «Todo oculto».
        </p>
        <Link
          href={back ?? "/juegos"}
          className="mt-3 inline-flex items-center gap-1 font-display text-base font-bold uppercase tracking-wide text-orange-400 hover:text-orange-300"
        >
          {back && back !== "/juegos" ? "Volver" : "Ir a Juegos"}
          <ChevronRight aria-hidden className="size-4" />
        </Link>
      </section>

      <AliasSection alias={account.alias} changedAt={account.aliasChangedAt} />

      <section className="border-b border-slate-800 px-4 py-5 md:px-8">
        <h2 className="font-display text-xs font-semibold uppercase tracking-[0.25em] text-slate-300">Sesión</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-300">
          {email ? (
            <>
              Has entrado con Google como <strong className="font-medium text-white">{email}</strong>.
            </>
          ) : (
            "Has entrado con Google."
          )}{" "}
          Al cerrar la sesión, lo de este dispositivo se queda en él.
        </p>
        <button type="button" onClick={() => void signOut()} className={cn(SECONDARY, "mt-3")}>
          <LogOut className="size-4.5" aria-hidden />
          Cerrar sesión
        </button>
      </section>

      <DeleteSection />
    </>
  );
}

function Stat({ label, value, children }: { label: string; value: string | null; children: ReactNode }) {
  return (
    <div className="min-w-0 bg-slate-950 px-4 py-3 md:px-8 md:py-4">
      <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{label}</p>
      {value === null ? (
        <span aria-hidden className="mt-1 block h-8 w-20 animate-pulse bg-slate-800/70" />
      ) : (
        <p className="font-display text-3xl font-extrabold uppercase leading-tight text-white tabular-nums">{value}</p>
      )}
      <p className="truncate font-display text-sm font-bold uppercase tracking-wide text-slate-400">{children}</p>
    </div>
  );
}

function AliasSection({ alias, changedAt }: { alias: string; changedAt: string | null }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(alias);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const check = checkAlias(value);
  const same = check.ok && check.alias === alias;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!check.ok || same || busy) return;
    setBusy(true);
    setError(null);
    renameAlias(check.alias).then((failure) => {
      setBusy(false);
      if (failure) {
        setError(failure.next ? `Solo se puede cambiar una vez por semana: podrás el ${dayMonth.format(new Date(failure.next))}.` : failure.error);
        return;
      }
      setEditing(false);
      setSaved(true);
    });
  }

  return (
    <section className="border-b border-slate-800 px-4 py-5 md:px-8">
      <h2 className="font-display text-xs font-semibold uppercase tracking-[0.25em] text-slate-300">Alias</h2>
      {editing ? (
        <form onSubmit={submit} noValidate className="mt-2">
          <AliasField
            value={value}
            onChange={(next) => {
              setValue(next);
              setError(null);
            }}
            problem={check.ok ? null : check.message}
            hint={changedAt ? "Una vez por semana (cambiar solo mayúsculas, cuando quieras)." : "Una vez por semana."}
          />
          {error && <Notice tone="error">{error}</Notice>}
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <button type="submit" disabled={!check.ok || same || busy} className={PRIMARY}>
              {busy ? "Guardando…" : "Guardar"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setValue(alias);
                setError(null);
              }}
              className="text-sm text-slate-400 underline-offset-4 hover:text-white hover:underline"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <>
          <p className="mt-1 break-all font-display text-2xl font-bold text-white">@{alias}</p>
          <button
            type="button"
            onClick={() => {
              setValue(alias);
              setEditing(true);
              setSaved(false);
            }}
            className={cn(SECONDARY, "mt-3")}
          >
            <Pencil className="size-4.5" aria-hidden />
            Cambiar alias
          </button>
          {saved && <Notice tone="ok">Alias cambiado.</Notice>}
        </>
      )}
    </section>
  );
}

function DeleteSection() {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function remove() {
    if (!confirming) return setConfirming(true);
    setBusy(true);
    setError(null);
    deleteAccount().then((failure) => {
      setBusy(false);
      if (failure) setError(failure);
    });
  }

  return (
    <section className="border-b border-slate-800 px-4 py-5 md:px-8">
      <h2 className="font-display text-xs font-semibold uppercase tracking-[0.25em] text-slate-300">Borrar la cuenta</h2>
      <p className="mt-2 max-w-2xl text-sm text-slate-300">
        Se borran para siempre tu alias, tus resultados y tus favoritos de la cuenta, y lo que nos dio Google (tu email). No
        se puede deshacer. Lo de este dispositivo se queda hasta que lo borres en{" "}
        <Link href="/privacidad#borrar" className="text-orange-400 hover:underline">
          Privacidad
        </Link>
        .
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className={cn(
            "inline-flex h-11.5 items-center gap-2 px-4 font-display text-base font-bold uppercase tracking-wide outline-none transition-colors focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-60",
            confirming ? "bg-red-600 text-white hover:bg-red-500" : "border border-slate-700 text-slate-200 hover:border-red-500 hover:text-white"
          )}
        >
          <Trash2 className={cn("size-4.5", !confirming && "text-red-400")} aria-hidden />
          {busy ? "Borrando…" : confirming ? "Pulsa otra vez para borrarla" : "Borrar la cuenta"}
        </button>
        {confirming && !busy && (
          <button type="button" onClick={() => setConfirming(false)} className="text-sm text-slate-400 underline-offset-4 hover:text-white hover:underline">
            Cancelar
          </button>
        )}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------

function Unavailable({ message }: { message: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Header kicker="Tu cuenta" title="Sin conexión" />
      <section className="border-b border-slate-800 px-4 py-5 md:px-8">
        <p className="max-w-2xl text-slate-300">{message} Lo que juegues mientras tanto se guarda aquí y pasa a tu cuenta al volver.</p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void retryAccount().finally(() => setBusy(false));
            }}
            className={PRIMARY}
          >
            <RefreshCw className={cn("size-5", busy && "animate-spin")} aria-hidden />
            Volver a intentarlo
          </button>
          <button type="button" onClick={() => void signOut()} className="text-sm text-slate-400 underline-offset-4 hover:text-white hover:underline">
            Cerrar sesión
          </button>
        </div>
      </section>
    </>
  );
}
