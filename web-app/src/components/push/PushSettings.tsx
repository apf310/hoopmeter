"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { BellOff, BellRing, Check, EyeOff, Share, SquarePlus, Star } from "lucide-react";
import { LogoMark } from "@/components/layout/LogoMark";
import { useFavorites } from "@/lib/favorites-store";
import { PUSH_EXAMPLES, PUSH_HOURS, pushTeamIds, type PushHour } from "@/lib/push";
import { changePush, disablePush, enablePush, getPushSupport, PushError, usePushState, type PushErrorCode, type PushSupport } from "@/lib/push-store";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

const noopSubscribe = () => () => {};

function errorText(code: PushErrorCode, support: PushSupport | null): string {
  switch (code) {
    case "denied":
      return support === "native"
        ? "Hoopmeter no tiene permiso para avisarte. Actívalo en Ajustes › Aplicaciones › Hoopmeter › Notificaciones y vuelve a pulsar Activar."
        : "Las notificaciones de esta web están bloqueadas. Actívalas en los permisos del sitio (el icono junto a la dirección) y vuelve a pulsar Activar.";
    case "server":
      return "No se ha podido guardar. Prueba otra vez en un momento.";
    case "device":
      return support === "native"
        ? "Este móvil no ha podido darse de alta. Actualiza la app a la última versión y prueba otra vez."
        : "Este navegador no ha podido darse de alta. Prueba otra vez o con otro navegador.";
    case "unsupported":
      return "Este navegador no admite avisos.";
  }
}

/** Ajustes del aviso matinal (Tarea 6.14). Nada de aquí cambia el nivel de spoilers de la app. */
export function PushSettings() {
  const push = usePushState();
  const favorites = useFavorites();
  const support = useSyncExternalStore(noopSubscribe, getPushSupport, () => null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PushErrorCode | null>(null);
  const hasFavorites = favorites.teams.length > 0 || favorites.players.length > 0;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof PushError ? e.code : "server");
    } finally {
      setBusy(false);
    }
  }

  const canUse = support === "web" || support === "native";
  const toggle = () => run(() => (push.enabled ? disablePush() : enablePush(push.hour, push.withScores, pushTeamIds(favorites))));
  const setHour = (hour: PushHour) => hour !== push.hour && run(() => changePush({ hour }));
  const setWithScores = (withScores: boolean) => withScores !== push.withScores && run(() => changePush({ withScores }));

  return (
    <>
      <section className="border-b border-slate-800 px-4 py-5 md:px-8">
        <p className="max-w-2xl text-slate-300">
          Cada mañana, a la hora que elijas, te avisamos de que la jornada de anoche ya está lista para ver.{" "}
          <strong className="text-white">Nunca resultados</strong>: ni quién ganó, ni si hubo prórroga, ni avisos al acabar un partido (la hora
          del aviso lo delataría).
        </p>
        <p className="mt-2 flex max-w-2xl items-start gap-2 text-sm text-slate-400">
          <EyeOff className="mt-0.5 size-4 shrink-0 text-orange-400" />
          Al tocarlo, {BRAND.name} abre en «Todo oculto», como siempre.
        </p>

        {support === "ios-install" && <IosInstallGuide />}
        {support === "ios-update" && (
          <p className="mt-4 max-w-2xl border-l-2 border-slate-600 pl-3 text-sm text-slate-300">
            Los avisos necesitan iOS 16.4 o posterior. Actualiza el iPhone en Ajustes › General › Actualización de software y vuelve aquí.
          </p>
        )}
        {support === "unsupported" && (
          <p className="mt-4 max-w-2xl border-l-2 border-slate-600 pl-3 text-sm text-slate-300">Este navegador no admite avisos.</p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={toggle}
            disabled={!canUse || busy}
            className={cn(
              "inline-flex h-11 items-center gap-2 px-5 font-display text-lg font-extrabold uppercase tracking-wide outline-none transition-colors focus-visible:ring-2 focus-visible:ring-orange-400 disabled:opacity-50",
              push.enabled
                ? "border border-slate-700 text-slate-200 hover:border-red-500 hover:text-white"
                : "bg-orange-500 text-slate-950 hover:bg-orange-400"
            )}
          >
            {push.enabled ? <BellOff className="size-5" /> : <BellRing className="size-5" />}
            {busy ? "Un momento…" : push.enabled ? "Desactivar" : "Activar aviso"}
          </button>
          <p aria-live="polite" className="font-display text-sm font-semibold uppercase tracking-wide">
            {push.enabled ? (
              <span className="flex items-center gap-1.5 text-emerald-400">
                <Check className="size-4" /> Activado · {push.hour}:00
              </span>
            ) : (
              <span className="text-slate-400">Desactivado</span>
            )}
          </p>
        </div>
        {error && (
          <p role="alert" className="mt-3 max-w-2xl border-l-2 border-red-500 pl-3 text-sm text-slate-200">
            {errorText(error, support)}
          </p>
        )}
      </section>

      <section className="border-b border-slate-800 px-4 py-5 md:px-8">
        <h2 className="font-display text-xs font-semibold uppercase tracking-[0.25em] text-slate-300">Hora · España</h2>
        <div role="radiogroup" aria-label="Hora del aviso" className="mt-3 flex">
          {PUSH_HOURS.map((hour) => (
            <button
              key={hour}
              type="button"
              role="radio"
              aria-checked={push.hour === hour}
              disabled={busy}
              onClick={() => setHour(hour)}
              className={cn(
                "-ml-px h-11 w-20 border font-display text-xl font-extrabold tabular-nums outline-none transition-colors first:ml-0 focus-visible:ring-2 focus-visible:ring-orange-400 disabled:opacity-60",
                push.hour === hour ? "relative border-orange-500 bg-orange-500/15 text-white" : "border-slate-700 text-slate-400 hover:text-white"
              )}
            >
              {hour}:00
            </button>
          ))}
        </div>
        <p className="mt-2 text-sm text-slate-400">
          Antes de las 8:00 aún se juega el último partido de la costa oeste. Con notas, si a tu hora queda alguno por acabar, el aviso sale
          una hora después.
        </p>
      </section>

      <section className="border-b border-slate-800">
        <h2 className="px-4 pt-5 font-display text-xs font-semibold uppercase tracking-[0.25em] text-slate-300 md:px-8">Qué dice el aviso</h2>
        <div role="radiogroup" aria-label="Qué dice el aviso" className="mt-3 divide-y divide-slate-800 border-t border-slate-800">
          <AvisoOption
            checked={!push.withScores}
            disabled={busy}
            onSelect={() => setWithScores(false)}
            label="Sin notas"
            hint="Recomendado. Solo cuántos partidos hubo y, si jugó uno de tus favoritos, cuál."
            example={PUSH_EXAMPLES.withoutScores}
          />
          <AvisoOption
            checked={push.withScores}
            disabled={busy}
            onSelect={() => setWithScores(true)}
            label="Con notas"
            hint="Además, la nota del mejor partido y cuántos partidazos (8+) hubo: es el nivel «Solo nota» en la pantalla de bloqueo."
            example={PUSH_EXAMPLES.withScores}
          />
        </div>
      </section>

      <section className="border-b border-slate-800 px-4 py-5 md:px-8">
        <p className="flex max-w-2xl items-start gap-2 text-sm text-slate-300">
          <Star className="mt-0.5 size-4 shrink-0 fill-orange-500 text-orange-500" />
          {hasFavorites
            ? "Si juega uno de tus favoritos, el aviso dice su partido. Nunca cómo acabó."
            : "Marca tus equipos y jugadores con ★ en su ficha y el aviso te dirá si jugaron. Nunca cómo acabó."}
        </p>
        {!hasFavorites && (
          <Link href="/teams" className="mt-2 inline-block font-display text-sm font-bold uppercase tracking-wide text-orange-400 hover:text-orange-300">
            Ver los 30 equipos ›
          </Link>
        )}
      </section>
    </>
  );
}

/**
 * iPhone y iPad (Tarea 6.20): Safari solo da avisos a las webs añadidas a la pantalla de inicio, así que en vez de
 * un botón que no puede funcionar, los pasos para añadirla. Al abrirla desde el icono, esta pantalla ya deja activarlo.
 */
function IosInstallGuide() {
  const steps = [
    {
      icon: <Share className="size-5 text-sky-400" aria-hidden />,
      text: (
        <>
          Toca <strong className="text-white">Compartir</strong>, el cuadrado con la flecha hacia arriba (en Safari, en la barra de
          abajo; en Chrome, junto a la dirección).
        </>
      ),
    },
    {
      icon: <SquarePlus className="size-5 text-white" aria-hidden />,
      text: (
        <>
          Baja en el menú y elige <strong className="text-white">«Añadir a pantalla de inicio»</strong>; después, «Añadir».
        </>
      ),
    },
    {
      icon: <LogoMark className="size-5" />,
      text: (
        <>
          Abre <strong className="text-white">{BRAND.name}</strong> desde ese icono, vuelve a esta pantalla y pulsa «Activar aviso».
        </>
      ),
    },
  ];

  return (
    <div className="mt-5 max-w-2xl border-l-2 border-orange-500 pl-4">
      <h2 className="font-display text-xs font-semibold uppercase tracking-[0.25em] text-orange-400">En iPhone y iPad, antes de activarlo</h2>
      <p className="mt-1 text-sm text-slate-300">Apple solo deja avisar a las webs que están en la pantalla de inicio. Es un momento:</p>
      <ol className="mt-3 space-y-3">
        {steps.map((step, i) => (
          <li key={i} className="flex items-start gap-3 text-sm text-slate-200">
            <span className="flex size-7 shrink-0 items-center justify-center bg-slate-800 font-display text-base font-extrabold text-white">
              {i + 1}
            </span>
            <span className="flex min-w-0 items-start gap-2 pt-1">
              <span className="mt-px shrink-0">{step.icon}</span>
              <span>{step.text}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

type AvisoOptionProps = {
  checked: boolean;
  disabled: boolean;
  onSelect: () => void;
  label: string;
  hint: string;
  example: string;
};

function AvisoOption({ checked, disabled, onSelect, label, hint, example }: AvisoOptionProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "relative flex w-full flex-col gap-3 px-4 py-4 text-left outline-none transition-colors focus-visible:bg-slate-900 disabled:opacity-60 md:flex-row md:items-center md:gap-8 md:px-8",
        checked ? "bg-gradient-to-r from-orange-500/10 to-transparent" : "hover:bg-slate-900/60"
      )}
    >
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-[3px] bg-orange-500 transition-opacity", checked ? "opacity-100" : "opacity-0")} />
      <span className="md:w-72 md:shrink-0">
        <span className={cn("flex items-center gap-2 font-display text-xl font-extrabold uppercase", checked ? "text-white" : "text-slate-300")}>
          <span
            aria-hidden
            className={cn("flex size-4 items-center justify-center rounded-full border-2", checked ? "border-orange-500" : "border-slate-600")}
          >
            {checked && <span className="size-1.5 rounded-full bg-orange-500" />}
          </span>
          {label}
        </span>
        <span className="mt-1 block text-sm text-slate-400">{hint}</span>
      </span>
      {/* Así se verá en el móvil */}
      <span className="flex w-full max-w-md items-start gap-3 border border-slate-800 bg-slate-900 p-3">
        <LogoMark className="size-8 shrink-0" />
        <span className="min-w-0">
          <span className="block text-xs text-slate-400">{BRAND.name} · ahora</span>
          <span className="block text-sm font-semibold text-white">{PUSH_EXAMPLES.title}</span>
          <span className="block text-sm text-slate-300">{example}</span>
        </span>
      </span>
    </button>
  );
}
