"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Shared, SharedLink } from "@/components/layout/SharedLink";
import { ArrowDown, LoaderCircle, SlidersHorizontal, WifiOff, X } from "lucide-react";
import { ExplorerTable } from "@/components/players/ExplorerTable";
import { ExplorerCardExport } from "@/components/share/ExplorerShareCard";
import { playerHeadshotUrl } from "@/lib/nba-cdn";
import {
  AGE_PRESETS,
  CONFERENCE_FILTERS,
  DEFAULT_FILTERS,
  EXPLORER_MODES,
  EXPLORER_VIEWS,
  GAMES_PRESETS,
  INTERNATIONAL,
  LEADER_STATS,
  MINUTES_PRESETS,
  POSITION_FILTERS,
  SALARY_PRESETS,
  STATS,
  activeFilterCount,
  ageLabel,
  autoMinGames,
  countryOptions,
  explorerSearch,
  filterLabels,
  filterRows,
  formatStat,
  leaders,
  minimumLabel,
  nextExplorerSort,
  parseRange,
  rangeParam,
  salaryLabel,
  sameRange,
  seasonMaxGames,
  slugLabel,
  sortRows,
  statTitle,
  statValue,
  type ExplorerFilters,
  type ExplorerSeason,
  type ExplorerState,
  type StatKey,
} from "@/lib/player-explorer";
import type { SearchTeam } from "@/lib/search";
import { SEASON } from "@/lib/trade-rules";
import { teamAccent, teamBackdrop } from "@/lib/team-colors";
import { cn } from "@/lib/utils";

/** Filas por tanda: la temporada entera pasa de 400 jugadores. */
const PAGE_SIZE = 50;

export type ExplorerTeam = { id: number; name: string; abbreviation: string; conference: string | null; accent: string; backdrop: string };

// Temporadas ya pedidas (la del HTML incluida): volver a una es instantáneo
const seasonCache = new Map<string, Promise<ExplorerSeason>>();

function loadSeason(season: string): Promise<ExplorerSeason> {
  let request = seasonCache.get(season);
  if (!request) {
    request = fetch(`/api/player-stats?temporada=${encodeURIComponent(season)}`).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<ExplorerSeason>;
    });
    request.catch(() => seasonCache.delete(season));
    seasonCache.set(season, request);
  }
  return request;
}

/**
 * Explorador de jugadores (Tarea 6.22): filtros combinables, cualquier estadística ordenable por partido,
 * en totales o por 36 minutos, líderes, temporadas anteriores y el estado entero en la URL. Todo se
 * filtra y ordena en el dispositivo: al tocar un filtro cambia al instante. Sin spoilers: estadísticas
 * de temporada, que cambian una vez al día.
 */
export function PlayerExplorer({
  initial,
  seasons,
  initialState,
  teams,
}: {
  initial: ExplorerSeason;
  /** De la más reciente a la más antigua; la primera es la en curso. */
  seasons: string[];
  initialState: ExplorerState;
  teams: SearchTeam[];
}) {
  const [state, setState] = useState(initialState);
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [shown, setShown] = useState(PAGE_SIZE);
  const requested = useRef(initial.season);

  useEffect(() => {
    if (!seasonCache.has(initial.season)) seasonCache.set(initial.season, Promise.resolve(initial));
  }, [initial]);

  // La URL siempre al día (sin navegación de Next): lista para copiarla y compartirla
  useEffect(() => {
    window.history.replaceState(window.history.state, "", `/players${explorerSearch(state, seasons[0])}`);
  }, [state, seasons]);

  const teamById = useMemo(
    () =>
      new Map<number, ExplorerTeam>(
        teams.map((t) => [
          t.id,
          { id: t.id, name: t.name, abbreviation: t.abbreviation, conference: t.conference, accent: teamAccent(t), backdrop: teamBackdrop(t.primary_color) },
        ])
      ),
    [teams]
  );
  const sortedTeams = useMemo(() => [...teamById.values()].sort((a, b) => a.name.localeCompare(b.name, "es")), [teamById]);
  const countries = useMemo(() => countryOptions(data.rows), [data.rows]);
  const maxGames = useMemo(() => seasonMaxGames(data.rows), [data.rows]);
  const filtered = useMemo(
    () => filterRows(data.rows, state.filters, { maxGames, conferenceOf: (id) => teamById.get(id)?.conference ?? null }),
    [data.rows, state.filters, maxGames, teamById]
  );
  const sorted = useMemo(() => sortRows(filtered, state.sort, state.mode, maxGames), [filtered, state.sort, state.mode, maxGames]);

  const update = (patch: Partial<ExplorerState>) => {
    setState((current) => ({ ...current, ...patch }));
    setShown(PAGE_SIZE);
  };
  const setFilters = (patch: Partial<ExplorerFilters>) => update({ filters: { ...state.filters, ...patch } });
  const onSort = (key: StatKey) => update({ sort: nextExplorerSort(state.sort, key) });

  async function changeSeason(season: string) {
    const shownSeason = data.season;
    requested.current = season;
    update({ season });
    setLoadError(false);
    setLoading(true);
    const next = await loadSeason(season).catch(() => null);
    // Si mientras tanto se ha pedido otra, manda esa
    if (requested.current !== season) return;
    setLoading(false);
    if (next) {
      setData(next);
    } else {
      setLoadError(true);
      requested.current = shownSeason;
      setState((current) => ({ ...current, season: shownSeason }));
    }
  }

  // Las otras temporadas se piden al ir a abrir el selector: al elegir una, ya está
  const prefetchSeasons = () => seasons.forEach((s) => void loadSeason(s).catch(() => undefined));

  const labels = filterLabels(state.filters, {
    teamName: (id) => teamById.get(id)?.name,
    countryName: (slug) => countries.find((c) => c.slug === slug)?.label,
  });
  const minimum = minimumLabel(state.filters, maxGames);
  const activeCount = activeFilterCount(state.filters);
  const title = statTitle(state.sort.key, state.mode);
  const view = EXPLORER_VIEWS.find((v) => v.id === state.view)!;
  const sortHidden = !view.columns.includes(state.sort.key);
  const stale = loading || data.season !== state.season;
  const count = filtered.length === 1 ? "1 jugador" : `${filtered.length} jugadores`;

  return (
    <section aria-label="Explorador de estadísticas">
      <ModeTabs mode={state.mode} onSelect={(mode) => update({ mode })} />

      <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-2 md:gap-3 md:px-8">
        <label htmlFor="explorer-season" className="sr-only">
          Temporada
        </label>
        <div className="relative shrink-0">
          <select
            id="explorer-season"
            value={state.season}
            onChange={(event) => void changeSeason(event.target.value)}
            onPointerEnter={prefetchSeasons}
            onFocus={prefetchSeasons}
            className={cn(SELECT, "w-[7.5rem] pr-7")}
          >
            {seasons.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {loading && <LoaderCircle className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 animate-spin text-orange-400" aria-hidden />}
        </div>
        <button
          type="button"
          onClick={() => setFiltersOpen((open) => !open)}
          aria-expanded={filtersOpen}
          aria-controls="explorer-filters"
          className={cn(
            "flex h-11.5 shrink-0 items-center gap-2 border px-3 font-display text-base font-bold uppercase tracking-wide transition-colors md:hidden",
            filtersOpen || activeCount > 0 ? "border-orange-500 text-orange-300" : "border-slate-800 text-slate-200 hover:border-slate-600"
          )}
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          Filtros
          {activeCount > 0 && <span className="bg-orange-500 px-1.5 font-display text-sm leading-5 text-slate-950">{activeCount}</span>}
        </button>
        {/* En el móvil, el número va en el resumen de debajo (aquí no cabe junto a "Filtros") */}
        <p aria-live="polite" className="ml-auto hidden min-w-0 truncate text-right font-display text-sm font-semibold uppercase tracking-wide text-slate-400 sm:block">
          {count}
        </p>
        <ExplorerCardExport
          className="shrink-0"
          rows={sorted}
          sort={state.sort}
          mode={state.mode}
          season={data.season}
          title={title}
          filters={labels}
          minimum={minimum}
          teamById={teamById}
        />
      </div>

      <div id="explorer-filters" className={cn("border-b border-slate-800 px-4 py-3 md:block md:px-8", filtersOpen ? "block" : "hidden")}>
        <div className="grid grid-cols-2 gap-x-3 gap-y-3 md:grid-cols-4 xl:grid-cols-8">
          <Field label="Posición" className="col-span-2 md:col-span-2">
            <Chips
              label="Posición"
              value={state.filters.position}
              options={[{ id: null, label: "Todas" }, ...POSITION_FILTERS.map((p) => ({ id: p.id, label: p.label }))]}
              onSelect={(position) => setFilters({ position })}
            />
          </Field>
          <Field label="Conferencia" className="col-span-2 md:col-span-2">
            <Chips
              label="Conferencia"
              value={state.filters.conference}
              options={[{ id: null, label: "Todas" }, ...CONFERENCE_FILTERS.map((c) => ({ id: c.id, label: c.label }))]}
              onSelect={(conference) => setFilters({ conference })}
            />
          </Field>
          <Field label="Equipo" htmlFor="explorer-team">
            <select
              id="explorer-team"
              value={state.filters.team ?? ""}
              onChange={(event) => setFilters({ team: event.target.value ? Number(event.target.value) : null })}
              className={SELECT}
            >
              <option value="">Todos</option>
              {sortedTeams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="País" htmlFor="explorer-country">
            <select
              id="explorer-country"
              value={state.filters.country ?? ""}
              onChange={(event) => setFilters({ country: event.target.value || null })}
              className={SELECT}
            >
              <option value="">Todos</option>
              <option value={INTERNATIONAL}>Internacionales</option>
              {countries.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.label} ({c.count})
                </option>
              ))}
              {state.filters.country && state.filters.country !== INTERNATIONAL && !countries.some((c) => c.slug === state.filters.country) && (
                <option value={state.filters.country}>{slugLabel(state.filters.country)} (0)</option>
              )}
            </select>
          </Field>
          <Field label="Edad" htmlFor="explorer-age">
            <RangeSelect
              id="explorer-age"
              value={state.filters.age}
              presets={AGE_PRESETS}
              any="Cualquiera"
              custom={ageLabel}
              onChange={(age) => setFilters({ age })}
            />
          </Field>
          <Field label="Salario" htmlFor="explorer-salary">
            <RangeSelect
              id="explorer-salary"
              value={state.filters.salary}
              presets={SALARY_PRESETS}
              any="Cualquiera"
              custom={salaryLabel}
              onChange={(salary) => setFilters({ salary })}
            />
          </Field>
          <Field label="Partidos" htmlFor="explorer-games" className="xl:col-span-2">
            <select
              id="explorer-games"
              value={state.filters.minGames ?? "auto"}
              onChange={(event) => setFilters({ minGames: event.target.value === "auto" ? null : Number(event.target.value) })}
              className={SELECT}
            >
              <option value="auto">{autoMinGames(maxGames)} o más (40 %)</option>
              {withValue(GAMES_PRESETS, state.filters.minGames).map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? "Todos" : `${n} o más`}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Min. por partido" htmlFor="explorer-minutes" className="xl:col-span-2">
            <select
              id="explorer-minutes"
              value={state.filters.minMinutes}
              onChange={(event) => setFilters({ minMinutes: Number(event.target.value) })}
              className={SELECT}
            >
              {withValue(MINUTES_PRESETS, state.filters.minMinutes).map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? "Todos" : `${n} o más`}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Rookies" className="xl:col-span-2">
            <Toggle pressed={state.filters.rookies} onClick={() => setFilters({ rookies: !state.filters.rookies })}>
              Solo rookies
            </Toggle>
          </Field>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {activeCount > 0 && (
            <button
              type="button"
              onClick={() => update({ filters: DEFAULT_FILTERS })}
              className="flex h-11.5 items-center gap-1.5 px-2 font-display text-base font-bold uppercase tracking-wide text-slate-300 transition-colors hover:text-white"
            >
              <X className="size-4" aria-hidden />
              Quitar filtros
            </button>
          )}
          <p className="ml-auto hidden text-xs text-slate-400 md:block">{minimum}</p>
          {/* Móvil: cierra el panel y deja ver la tabla */}
          <button
            type="button"
            onClick={() => setFiltersOpen(false)}
            className="ml-auto h-11.5 bg-orange-500 px-4 font-display text-base font-bold uppercase tracking-wide text-slate-950 transition-colors hover:bg-orange-400 md:hidden"
          >
            Ver {count}
          </button>
        </div>
      </div>

      {/* Con los filtros plegados (móvil), qué se está viendo */}
      {!filtersOpen && (
        <p className="flex items-center gap-2 border-b border-slate-800 px-4 py-2 text-xs text-slate-300 md:hidden">
          <span className="min-w-0 flex-1 truncate">
            <span className="font-semibold text-white">{count}</span> · {[...labels, minimum].join(" · ")}
          </span>
          {activeCount > 0 && (
            <button type="button" onClick={() => update({ filters: DEFAULT_FILTERS })} className="shrink-0 font-semibold text-orange-400">
              Quitar
            </button>
          )}
        </p>
      )}

      {loadError && (
        <p className="flex items-center gap-2 border-b border-slate-800 px-4 py-2 text-sm text-amber-300 md:px-8">
          <WifiOff className="size-4 shrink-0" aria-hidden />
          No se pudo cargar esa temporada. Prueba otra vez en un momento.
        </p>
      )}
      {!data.current && (
        <p className="border-b border-slate-800 bg-slate-900/60 px-4 py-2 text-xs text-slate-300 md:px-8">
          Temporada {data.season}: faltan los jugadores que ya no están en la NBA. USG%, AST% y REB%, solo en la temporada en curso.
        </p>
      )}

      <div className={cn("transition-opacity", stale && "pointer-events-none opacity-50")}>
        <Leaders
          rows={filtered}
          mode={state.mode}
          maxGames={maxGames}
          teamById={teamById}
          sortKey={state.sort.key}
          onSort={(key) => update({ sort: { key, dir: "desc" } })}
        />

        <ViewTabs view={state.view} onSelect={(v) => update({ view: v })} />
        {sortHidden && (
          <p className="flex items-center gap-1.5 border-b border-slate-800 px-4 py-1.5 text-xs text-slate-300 md:px-8">
            Ordenado por <span className="font-semibold text-orange-400">{title.toLowerCase()}</span>
            <ArrowDown className={cn("size-3 text-orange-400", state.sort.dir === "asc" && "rotate-180")} aria-hidden />
          </p>
        )}

        {sorted.length === 0 ? (
          <div className="border-b border-slate-800 px-4 py-10 text-center md:px-8">
            <p className="font-display text-2xl font-extrabold uppercase text-white">Ningún jugador cumple todos los filtros</p>
            <p className="mt-1 text-sm text-slate-400">{[...labels, minimum].join(" · ")}</p>
            <button
              type="button"
              onClick={() => update({ filters: DEFAULT_FILTERS })}
              className="mt-4 h-11 bg-orange-500 px-5 font-display text-lg font-bold uppercase tracking-wide text-white transition-colors hover:bg-orange-400"
            >
              Quitar filtros
            </button>
          </div>
        ) : (
          <>
            <ExplorerTable
              rows={sorted.slice(0, shown)}
              columns={view.columns}
              sort={state.sort}
              mode={state.mode}
              maxGames={maxGames}
              teamById={teamById}
              onSort={onSort}
            />
            {sorted.length > shown && (
              <button
                type="button"
                onClick={() => setShown((n) => n + PAGE_SIZE)}
                className="block w-full border-b border-slate-800 py-3 font-display text-base font-bold uppercase tracking-wide text-orange-400 transition-colors hover:bg-slate-900/70 hover:text-orange-300"
              >
                Ver más · {shown} de {sorted.length}
              </button>
            )}
          </>
        )}
        <Legend columns={view.columns} maxGames={maxGames} />
      </div>
    </section>
  );
}

const SELECT =
  "h-11.5 w-full min-w-0 border border-slate-800 bg-slate-950 px-2 font-display text-base font-bold uppercase tracking-wide text-white transition-colors hover:border-slate-600 focus:border-orange-500 focus:outline-none";

/** Añade a la lista el valor de la URL si no es uno de los de serie (un enlace con `min=12` sigue funcionando). */
function withValue(presets: number[], value: number | null): number[] {
  return value === null || presets.includes(value) ? presets : [...presets, value].sort((a, b) => a - b);
}

function ModeTabs({ mode, onSelect }: { mode: ExplorerState["mode"]; onSelect: (mode: ExplorerState["mode"]) => void }) {
  return (
    <div role="group" aria-label="Cómo contar las estadísticas" className="grid grid-cols-3 border-b border-slate-800">
      {EXPLORER_MODES.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          aria-pressed={id === mode}
          onClick={() => onSelect(id)}
          className={cn(
            "border-b-[3px] py-2.5 font-display text-lg font-extrabold uppercase leading-none transition-colors md:py-3 md:text-2xl",
            id === mode ? "border-orange-500 text-white" : "border-transparent text-slate-500 hover:text-slate-300"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ViewTabs({ view, onSelect }: { view: ExplorerState["view"]; onSelect: (view: ExplorerState["view"]) => void }) {
  return (
    <div role="tablist" aria-label="Columnas de la tabla" className="flex border-b border-slate-800 px-4 md:px-8">
      {EXPLORER_VIEWS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={id === view}
          onClick={() => onSelect(id)}
          className={cn(
            "-mb-px h-11.5 border-b-2 px-3 font-display text-base font-bold uppercase tracking-wide transition-colors first:pl-0",
            id === view ? "border-orange-500 text-white" : "border-transparent text-slate-400 hover:text-slate-200"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Field({ label, htmlFor, className, children }: { label: string; htmlFor?: string; className?: string; children: ReactNode }) {
  const Label = htmlFor ? "label" : "span";
  return (
    <div className={cn("min-w-0", className)}>
      <Label htmlFor={htmlFor} className="mb-1 block font-display text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
        {label}
      </Label>
      {children}
    </div>
  );
}

function Chips<T extends string | null>({
  label,
  value,
  options,
  onSelect,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onSelect: (id: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex">
      {options.map((option) => (
        <button
          key={option.label}
          type="button"
          aria-pressed={option.id === value}
          onClick={() => onSelect(option.id)}
          className={cn(
            "-ml-px h-11.5 min-w-0 flex-1 border px-1 font-display text-base font-bold uppercase tracking-wide transition-colors first:ml-0",
            option.id === value ? "relative z-10 border-orange-500 bg-orange-500 text-slate-950" : "border-slate-800 text-slate-200 hover:border-slate-600"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "h-11.5 w-full border px-3 font-display text-base font-bold uppercase tracking-wide transition-colors",
        pressed ? "border-orange-500 bg-orange-500 text-slate-950" : "border-slate-800 text-slate-200 hover:border-slate-600"
      )}
    >
      {children}
    </button>
  );
}

function RangeSelect({
  id,
  value,
  presets,
  any,
  custom,
  onChange,
}: {
  id: string;
  value: ExplorerFilters["age"];
  presets: { label: string; range: NonNullable<ExplorerFilters["age"]> }[];
  any: string;
  custom: (range: NonNullable<ExplorerFilters["age"]>) => string;
  onChange: (range: ExplorerFilters["age"]) => void;
}) {
  const isPreset = value === null || presets.some((p) => sameRange(p.range, value));
  return (
    <select id={id} value={value ? rangeParam(value) : ""} onChange={(event) => onChange(parseRange(event.target.value, 100))} className={SELECT}>
      <option value="">{any}</option>
      {presets.map((p) => (
        <option key={p.label} value={rangeParam(p.range)}>
          {p.label}
        </option>
      ))}
      {!isPreset && value && <option value={rangeParam(value)}>{custom(value)}</option>}
    </select>
  );
}

/** Tarjetas de líderes de los jugadores filtrados (Rookies → los mejores rookies). Tocar la categoría ordena la tabla. */
function Leaders({
  rows,
  mode,
  maxGames,
  teamById,
  sortKey,
  onSort,
}: {
  rows: ExplorerSeason["rows"];
  mode: ExplorerState["mode"];
  maxGames: number;
  teamById: Map<number, ExplorerTeam>;
  sortKey: StatKey;
  onSort: (key: StatKey) => void;
}) {
  return (
    <ul aria-label="Líderes" className="grid grid-cols-2 gap-px border-b border-slate-800 bg-slate-800 sm:grid-cols-3 xl:grid-cols-6">
      {LEADER_STATS.map((key) => {
        const top = leaders(rows, key, mode, maxGames, 3);
        const [first, ...rest] = top;
        const team = first?.teamId ? teamById.get(first.teamId) : undefined;
        return (
          <li key={key} className="flex flex-col bg-slate-950">
            <button
              type="button"
              onClick={() => onSort(key)}
              title={`Ordenar la tabla por ${statTitle(key, mode).toLowerCase()}`}
              className={cn(
                "flex items-center justify-between px-3 pt-2 text-left font-display text-sm font-bold uppercase tracking-[0.2em] transition-colors hover:text-white",
                sortKey === key ? "text-orange-400" : "text-slate-300"
              )}
            >
              {STATS[key].name}
              {sortKey === key && <ArrowDown className="size-3.5" aria-hidden />}
            </button>
            {first ? (
              <SharedLink
                href={`/players/${first.id}`}
                className="group relative block min-h-[5.75rem] overflow-hidden"
                style={{ background: `linear-gradient(160deg, ${team?.backdrop ?? "#334155"}80 0%, #020617 72%)` }}
              >
                <Shared>
                  <Image
                    src={playerHeadshotUrl(first.id)}
                    alt=""
                    width={130}
                    height={95}
                    className="absolute bottom-0 right-0 h-[5.5rem] w-auto object-contain object-bottom transition-transform group-hover:scale-105"
                  />
                </Shared>
                <span className="relative block px-3 pt-1">
                  <span className="block font-display text-4xl font-extrabold leading-none tabular-nums text-white drop-shadow">
                    {formatStat(statValue(first, key, mode), key, mode)}
                  </span>
                  <span className="mt-2 block max-w-[62%] truncate font-display text-base font-extrabold uppercase leading-tight text-white drop-shadow">
                    {first.name}
                  </span>
                  <span className="block pb-2 text-xs font-semibold text-slate-300">{team?.abbreviation ?? "Sin equipo"}</span>
                </span>
                <span className="absolute inset-x-0 bottom-0 h-1" style={{ background: team?.accent ?? "#f97316" }} aria-hidden />
              </SharedLink>
            ) : (
              <p className="flex min-h-[5.75rem] items-center px-3 text-sm text-slate-500">Nadie con estos filtros</p>
            )}
            {/* 2.º y 3.º: en el móvil ocupan demasiado; desde tableta, debajo */}
            <ol start={2} className="hidden flex-1 border-t border-slate-800 sm:block">
              {rest.map((row, i) => (
                <li key={row.id}>
                  <Link href={`/players/${row.id}`} className="flex items-baseline gap-2 px-3 py-1 text-sm transition-colors hover:bg-slate-900">
                    <span className="w-3 shrink-0 font-display font-bold text-slate-500">{i + 2}</span>
                    <span className="min-w-0 flex-1 truncate text-slate-200">{row.name}</span>
                    <span className="font-display font-bold tabular-nums text-white">{formatStat(statValue(row, key, mode), key, mode)}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </li>
        );
      })}
    </ul>
  );
}

/** Qué significa cada sigla de la vista, para quien no las conoce (en el móvil no hay tooltips). */
function Legend({ columns, maxGames }: { columns: StatKey[]; maxGames: number }) {
  const shown = columns.filter((key) => key !== "salary");
  const pcts = columns.some((key) => key === "fg_pct" || key === "fg3_pct" || key === "ft_pct" || key === "ts_pct" || key === "efg_pct");
  return (
    <div className="px-4 py-3 text-xs leading-relaxed text-slate-400 md:px-8">
      <p>
        {shown.map((key, i) => (
          <span key={key}>
            {i > 0 && " · "}
            <span className="font-semibold text-slate-300">{STATS[key].label}</span> {STATS[key].name.replace(/ \(.*\)$/, "").toLowerCase()}
            {STATS[key].hint ? ` (${STATS[key].hint})` : ""}
          </span>
        ))}
        {columns.includes("salary") && (
          <span>
            {" · "}
            <span className="font-semibold text-slate-300">M$</span> salario {SEASON} en millones (≈ aproximado)
          </span>
        )}
      </p>
      {pcts && (
        <p className="mt-1">
          Al ordenar por un porcentaje, delante van los que llegan al mínimo de la NBA a estas alturas ({Math.min(maxGames, 82)} partidos): sin él, un 1 de 1 sería
          un 100 %.
        </p>
      )}
    </div>
  );
}
