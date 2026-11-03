"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { playerHeadshotUrl, teamLogoUrl } from "@/lib/nba-cdn";
import { search, type SearchIndex, type SearchTeam } from "@/lib/search";
import { teamAccent } from "@/lib/team-colors";

type SearchContextValue = { openSearch: () => void; prefetch: () => void };

const SearchContext = createContext<SearchContextValue | null>(null);

// El índice se descarga una sola vez por sesión (y se reintenta si falla).
let indexPromise: Promise<SearchIndex> | null = null;

function loadSearchIndex(): Promise<SearchIndex> {
  indexPromise ??= fetch("/api/search-index")
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<SearchIndex>;
    })
    .catch((error: unknown) => {
      indexPromise = null;
      throw error;
    });
  return indexPromise;
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

/** Monta el diálogo de búsqueda una sola vez y registra los atajos Ctrl/⌘+K y "/". */
export function SearchProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState<SearchIndex | null>(null);
  const [failed, setFailed] = useState(false);

  const prefetch = useCallback(() => {
    loadSearchIndex().then(setIndex, () => {});
  }, []);

  const load = useCallback(() => {
    setFailed(false);
    loadSearchIndex().then(setIndex, () => setFailed(true));
  }, []);

  const openSearch = useCallback(() => {
    setOpen(true);
    load();
  }, [load]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const cmdK = event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey);
      const slash = event.key === "/" && !isTypingTarget(event.target);
      if (cmdK || slash) {
        event.preventDefault();
        openSearch();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openSearch]);

  const value = useMemo(() => ({ openSearch, prefetch }), [openSearch, prefetch]);

  return (
    <SearchContext.Provider value={value}>
      {children}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-sm transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
          <Dialog.Popup
            className={cn(
              "fixed inset-0 z-50 flex flex-col bg-slate-950 pt-[env(safe-area-inset-top)] outline-none transition-all duration-150",
              "data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 md:data-[starting-style]:-translate-y-2",
              "md:inset-x-0 md:top-[10vh] md:bottom-auto md:mx-auto md:max-h-[75vh] md:w-[min(40rem,calc(100vw-4rem))] md:border md:border-slate-800 md:pt-0 md:shadow-2xl md:shadow-black/60"
            )}
          >
            <Dialog.Title className="sr-only">Buscar jugadores y equipos</Dialog.Title>
            {/* Franja de acento de la app, como en los rótulos de TV */}
            <span aria-hidden className="h-[3px] shrink-0 bg-orange-500" />
            <SearchPanel index={index} failed={failed} onRetry={load} onClose={() => setOpen(false)} />
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </SearchContext.Provider>
  );
}

function useSearch(): SearchContextValue {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error("useSearch debe usarse dentro de <SearchProvider>");
  return ctx;
}

const noopSubscribe = () => () => {};

function useIsMac(): boolean {
  return useSyncExternalStore(noopSubscribe, () => /Mac|iPhone|iPad/.test(navigator.userAgent), () => false);
}

type SearchTriggerProps = { variant: "sidebar" | "icon"; className?: string };

/** Abre el buscador: fila completa en la Sidebar o icono en la barra superior móvil. */
export function SearchTrigger({ variant, className }: SearchTriggerProps) {
  const { openSearch, prefetch } = useSearch();
  const isMac = useIsMac();

  if (variant === "icon") {
    return (
      <button
        type="button"
        aria-label="Buscar jugadores y equipos"
        onClick={openSearch}
        onPointerEnter={prefetch}
        className={cn(
          "flex size-10 items-center justify-center rounded-full text-slate-300 outline-none transition-colors hover:bg-slate-900 hover:text-white focus-visible:ring-2 focus-visible:ring-orange-400",
          className
        )}
      >
        <Search className="size-5" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={openSearch}
      onPointerEnter={prefetch}
      onFocus={prefetch}
      className={cn(
        "group flex w-full items-center gap-3 px-6 py-3 text-slate-400 outline-none transition-colors hover:bg-slate-900 hover:text-white focus-visible:bg-slate-900 focus-visible:text-white",
        className
      )}
    >
      <Search className="size-5 group-hover:text-orange-500" />
      <span className="flex-1 text-left font-display text-lg font-bold uppercase tracking-wide">Buscar</span>
      <kbd className="border border-slate-700 px-1.5 py-0.5 font-sans text-[11px] font-medium text-slate-400">
        {isMac ? "⌘" : "Ctrl"} K
      </kbd>
    </button>
  );
}

type SearchPanelProps = { index: SearchIndex | null; failed: boolean; onRetry: () => void; onClose: () => void };

type Option = { key: string; href: string };

function SearchPanel({ index, failed, onRetry, onClose }: SearchPanelProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const teamsById = useMemo(() => new Map(index?.teams.map((t) => [t.id, t])), [index]);
  const results = useMemo(() => (index ? search(index, query) : { teams: [], players: [] }), [index, query]);
  const options: Option[] = useMemo(
    () => [
      ...results.teams.map((t) => ({ key: `team-${t.id}`, href: `/teams/${t.id}` })),
      ...results.players.map((p) => ({ key: `player-${p.id}`, href: `/players/${p.id}` })),
    ],
    [results]
  );
  const activeKey = options[active]?.key;

  useEffect(() => {
    if (activeKey) document.getElementById(`search-${activeKey}`)?.scrollIntoView({ block: "nearest" });
  }, [activeKey]);

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!options.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + options.length) % options.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      router.push(options[active].href);
      onClose();
    }
  }

  const hasQuery = query.trim().length > 0;
  const noResults = index && hasQuery && options.length === 0;
  // Índice plano: primero los equipos, después los jugadores (mismo orden que `options`)
  function optionProps(key: string, i: number) {
    return {
      id: `search-${key}`,
      role: "option" as const,
      "aria-selected": i === active,
      onPointerMove: () => setActive(i),
      onClick: onClose,
      className: cn(
        "relative flex items-center gap-3 px-4 py-2 transition-colors md:px-5",
        i === active ? "bg-slate-900 text-white" : "text-slate-200"
      ),
    };
  }

  return (
    <>
      <div className="flex shrink-0 items-center gap-3 border-b border-slate-800 px-4 md:px-5">
        <Search aria-hidden className="size-5 shrink-0 text-orange-500" />
        <input
          type="search"
          role="combobox"
          aria-expanded={options.length > 0}
          aria-controls="search-results"
          aria-activedescendant={activeKey ? `search-${activeKey}` : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="go"
          placeholder="Jugador o equipo…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          className="h-14 min-w-0 flex-1 bg-transparent text-lg text-white outline-none placeholder:text-slate-500 [&::-webkit-search-cancel-button]:hidden"
        />
        <Dialog.Close
          aria-label="Cerrar buscador"
          className="flex size-9 shrink-0 items-center justify-center text-slate-400 outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-orange-400"
        >
          <kbd className="hidden border border-slate-700 px-1.5 py-0.5 font-sans text-[11px] md:inline">Esc</kbd>
          <X className="size-5 md:hidden" />
        </Dialog.Close>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
        {failed ? (
          <Message>
            No se pudo cargar el buscador.{" "}
            <button type="button" onClick={onRetry} className="font-semibold text-orange-400 hover:text-orange-300">
              Reintentar
            </button>
          </Message>
        ) : !index ? (
          <LoadingRows />
        ) : !hasQuery ? (
          <TeamGrid teams={index.teams} onPick={onClose} />
        ) : noResults ? (
          <Message>
            Sin resultados para <span className="font-semibold text-white">«{query.trim()}»</span>
          </Message>
        ) : (
          <div id="search-results" role="listbox" aria-label="Resultados" className="py-2">
            {results.teams.length > 0 && (
              <section aria-label="Equipos">
                <GroupLabel>Equipos</GroupLabel>
                {results.teams.map((team, i) => (
                  <Link key={team.id} href={`/teams/${team.id}`} {...optionProps(`team-${team.id}`, i)}>
                    <AccentStripe team={team} />
                    <Image src={teamLogoUrl(team.id)} alt="" width={36} height={36} unoptimized className="size-9 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{team.name}</span>
                      <span className="block text-xs text-slate-400">
                        {team.abbreviation}
                        {team.conference && ` · Conferencia ${team.conference === "East" ? "Este" : "Oeste"}`}
                      </span>
                    </span>
                  </Link>
                ))}
              </section>
            )}
            {results.players.length > 0 && (
              <section aria-label="Jugadores">
                <GroupLabel>Jugadores</GroupLabel>
                {results.players.map((player, i) => {
                  const team = player.team_id ? teamsById.get(player.team_id) : undefined;
                  const accent = team ? teamAccent(team) : "#94a3b8";
                  return (
                    <Link key={player.id} href={`/players/${player.id}`} {...optionProps(`player-${player.id}`, results.teams.length + i)}>
                      {team && <AccentStripe team={team} />}
                      {/* Fondo teñido con el color del equipo detrás de la foto */}
                      <span className="flex h-10 w-[54px] shrink-0 items-end overflow-hidden" style={{ background: `${accent}26` }}>
                        <Image
                          src={playerHeadshotUrl(player.id)}
                          alt=""
                          width={54}
                          height={40}
                          className="h-10 w-[54px] object-cover object-top"
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{player.full_name}</span>
                        <span className="block text-xs text-slate-400">
                          {[player.position, team?.abbreviation ?? "Sin equipo"].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      {team && (
                        <Image src={teamLogoUrl(team.id)} alt="" width={24} height={24} unoptimized className="size-6 shrink-0 opacity-80" />
                      )}
                    </Link>
                  );
                })}
              </section>
            )}
          </div>
        )}
      </div>

      <div className="hidden shrink-0 items-center gap-4 border-t border-slate-800 px-5 py-2 text-[11px] text-slate-500 md:flex">
        <span><Kbd>↑</Kbd> <Kbd>↓</Kbd> navegar</span>
        <span><Kbd>↵</Kbd> abrir</span>
        <span><Kbd>Esc</Kbd> cerrar</span>
      </div>
    </>
  );
}

/** Sin texto escrito: los 30 equipos a un toque. */
function TeamGrid({ teams, onPick }: { teams: SearchTeam[]; onPick: () => void }) {
  return (
    <div className="py-2">
      <GroupLabel>Equipos</GroupLabel>
      <ul className="grid grid-cols-5 gap-px px-4 pb-2 sm:grid-cols-6 md:px-5">
        {teams.map((team) => (
          <li key={team.id}>
            <Link
              href={`/teams/${team.id}`}
              onClick={onPick}
              title={team.name}
              className="group flex flex-col items-center gap-1 py-2 outline-none transition-colors hover:bg-slate-900 focus-visible:bg-slate-900"
            >
              <Image src={teamLogoUrl(team.id)} alt="" width={36} height={36} unoptimized className="size-9 transition-transform group-hover:scale-110" />
              <span className="font-display text-xs font-bold uppercase tracking-wider text-slate-400 group-hover:text-white">
                {team.abbreviation}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AccentStripe({ team }: { team: SearchTeam }) {
  return <span aria-hidden className="absolute inset-y-1.5 left-0 w-[3px]" style={{ background: teamAccent(team) }} />;
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-4 pb-1 pt-2 font-display text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400 md:px-5">
      {children}
    </p>
  );
}

function Message({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-10 text-center text-sm text-slate-400">{children}</p>;
}

function LoadingRows() {
  return (
    <div aria-label="Cargando" className="space-y-1 px-4 py-4 md:px-5">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 py-1.5">
          <span className="h-10 w-[54px] animate-pulse bg-slate-900" />
          <span className="h-4 flex-1 animate-pulse bg-slate-900" style={{ maxWidth: `${60 - i * 6}%` }} />
        </div>
      ))}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="border border-slate-700 px-1 py-px font-sans text-slate-400">{children}</kbd>;
}
