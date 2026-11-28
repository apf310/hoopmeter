"use client";

import Image from "next/image";
import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Search, X } from "lucide-react";
import { findSuspects } from "@/lib/adivina";
import { teamLogoUrl } from "@/lib/nba-cdn";
import { cn } from "@/lib/utils";

/** Quien se puede decir: con equipo (escudo y abreviatura) o sin él (retirado o libre). */
export type GuessOption = { id: number; name: string; teamId: number | null; team: string | null; retired?: boolean };

/**
 * Buscador de los retos de adivinar (Adivina el jugador y Carrera oculta): sugerencias como el buscador de la app
 * (apellido, iniciales, sin tildes), sin los ya dichos. En el móvil se abren hacia arriba: el teclado las taparía.
 */
export function PlayerGuessInput<T extends GuessOption>({
  options,
  said,
  pending,
  onPick,
  notice,
  placeholder,
  hint,
  nothing,
}: {
  options: readonly T[] | null;
  said: ReadonlySet<number>;
  pending: boolean;
  onPick: (option: T) => void;
  notice: string | null;
  placeholder: string;
  /** Lo que se lee debajo mientras no hay aviso. */
  hint: string;
  /** Si lo escrito no da con nadie. */
  nothing: string;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const results = useMemo(() => (options && query.trim() ? findSuspects(options, query, said) : []), [options, query, said]);
  const shown = open && results.length > 0;
  const none = open && query.trim().length >= 2 && options !== null && results.length === 0;

  function pick(option: T) {
    setQuery("");
    setOpen(false);
    setActive(0);
    // En el móvil, fuera el teclado: se ve la fila nueva
    input.current?.blur();
    onPick(option);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!results.length) return;
      event.preventDefault();
      setOpen(true);
      setActive((i) => (i + (event.key === "ArrowDown" ? 1 : results.length - 1)) % results.length);
    } else if (event.key === "Enter") {
      const option = results[Math.min(active, results.length - 1)];
      if (shown && option) {
        event.preventDefault();
        pick(option);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="px-4 pb-3 pt-4 md:px-8 md:pt-6">
      <label htmlFor={`${listId}-input`} className="font-display text-xs font-semibold uppercase tracking-[0.25em] text-orange-400">
        ¿Quién es?
      </label>
      <div className="relative mt-1.5">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-slate-500" />
        <input
          ref={input}
          id={`${listId}-input`}
          type="text"
          role="combobox"
          aria-expanded={shown}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={shown ? `${listId}-${active}` : undefined}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          disabled={!options || pending}
          placeholder={!options ? "Cargando el reto…" : pending ? "Comprobando…" : placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className="h-13 w-full bg-slate-900 pl-11 pr-10 text-lg text-white ring-1 ring-inset ring-slate-700 outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-orange-500 disabled:opacity-60"
        />
        {query && (
          <button
            type="button"
            aria-label="Borrar"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setQuery("");
              input.current?.focus();
            }}
            className="absolute right-1 top-1/2 inline-flex size-10 -translate-y-1/2 items-center justify-center text-slate-400 outline-none hover:text-white"
          >
            <X className="size-5" />
          </button>
        )}
        {/*
          En el móvil la lista se abre hacia arriba, con la mejor junto al buscador: el teclado ocupa la mitad de abajo de
          la pantalla y la taparía. En el escritorio, hacia abajo.
        */}
        {shown && (
          <ul
            id={listId}
            role="listbox"
            className="absolute inset-x-0 bottom-full z-20 flex flex-col-reverse border border-b-0 border-slate-700 bg-slate-900 shadow-2xl shadow-black/60 md:bottom-auto md:top-full md:flex-col md:border-b md:border-t-0"
          >
            {results.map((option, i) => (
              <li
                key={option.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                // Sin perder el foco antes del clic (el onBlur cerraría la lista)
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(option)}
                onMouseEnter={() => setActive(i)}
                className={cn("flex cursor-pointer items-center gap-3 border-t border-slate-800 px-3 py-2.5", i === active && "bg-slate-800")}
              >
                <TeamMark teamId={option.teamId} />
                <span className="min-w-0 flex-1 truncate text-base text-white">{option.name}</span>
                <span className="shrink-0 font-display text-sm font-bold uppercase tracking-wide text-slate-400">{teamText(option)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p aria-live="polite" className={cn("mt-1.5 min-h-[1lh] text-sm", notice ? "text-amber-300" : "text-slate-500")}>
        {notice ?? (none ? nothing : hint)}
      </p>
    </div>
  );
}

/** "LAL", "Retirado" o "Sin equipo". */
export const teamText = (option: GuessOption) => option.team ?? (option.retired ? "Retirado" : "Sin equipo");

/** El escudo de su equipo o, sin equipo, un hueco del mismo tamaño. */
export function TeamMark({ teamId, size = 28 }: { teamId: number | null; size?: 24 | 28 }) {
  const box = size === 24 ? "size-6" : "size-7";
  return teamId !== null ? (
    <Image src={teamLogoUrl(teamId)} alt="" width={size} height={size} unoptimized className={cn(box, "shrink-0")} />
  ) : (
    <span aria-hidden className={cn(box, "shrink-0 bg-slate-800 ring-1 ring-inset ring-slate-700")} />
  );
}
