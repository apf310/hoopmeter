"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Image from "next/image";
import { Search, X } from "lucide-react";
import { Shared, SharedLink } from "@/components/layout/SharedLink";
import { LegendStrip } from "@/components/players/LegendStrip";
import { PlayerPhoto } from "@/components/players/PlayerPhoto";
import { loadSearchIndex } from "@/components/search/SearchCommand";
import { teamLogoUrl } from "@/lib/nba-cdn";
import { positionLabel } from "@/lib/player-profile";
import type { LegendCard } from "@/lib/queries";
import { search, type SearchIndex, type SearchPlayer, type SearchTeam } from "@/lib/search";
import { teamAccent } from "@/lib/team-colors";

const RESULT_LIMIT = 40;

/**
 * Directorio de jugadores: buscador instantáneo (activos y leyendas) y, sin búsqueda, el explorador de
 * estadísticas (Tarea 6.22), los equipos y las leyendas. El explorador solo se oculta mientras se busca:
 * al borrar la búsqueda sigue con sus filtros. El índice del buscador (el mismo de Ctrl+K) se descarga al abrir la
 * página, no va en el HTML (Tarea 7.7).
 */
export function PlayerDirectory({ teams, legends, explorer }: { teams: SearchTeam[]; legends: LegendCard[]; explorer: ReactNode }) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState<SearchIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const teamById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const results = useMemo(() => (index ? search(index, query, { teams: 0, players: RESULT_LIMIT }).players : null), [index, query]);
  const searching = query.trim() !== "";

  const load = () => {
    setFailed(false);
    loadSearchIndex().then(setIndex, () => setFailed(true));
  };
  useEffect(() => {
    loadSearchIndex().then(setIndex, () => setFailed(true));
  }, []);

  return (
    <>
      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 border-b border-slate-800 bg-slate-950 px-4 py-3 md:top-0 md:px-8">
        <label className="flex items-center gap-3 bg-slate-900 px-4 ring-1 ring-inset ring-slate-700 focus-within:ring-2 focus-within:ring-orange-500">
          <Search className="size-5 shrink-0 text-slate-400" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={index ? undefined : load}
            placeholder="Busca un jugador: Jokić, LeBron, Jordan…"
            aria-label="Buscar jugador"
            autoComplete="off"
            className="h-12 min-w-0 flex-1 bg-transparent text-base text-white placeholder:text-slate-500 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {searching && (
            <button type="button" onClick={() => setQuery("")} aria-label="Borrar búsqueda" className="p-1 text-slate-400 hover:text-white">
              <X className="size-5" />
            </button>
          )}
        </label>
      </div>

      {searching && (
        <section aria-live="polite">
          {results === null ? (
            <p className="px-4 py-8 text-slate-300 md:px-8">
              {failed ? "No se pudo cargar el buscador. " : "Cargando jugadores…"}
              {failed && (
                <button type="button" onClick={load} className="font-semibold text-orange-400">
                  Reintentar
                </button>
              )}
            </p>
          ) : results.length === 0 ? (
            <p className="px-4 py-8 text-slate-300 md:px-8">Ningún jugador coincide con «{query}».</p>
          ) : (
            <ul className="divide-y divide-slate-800/80">
              {results.map((player) => (
                <ResultRow key={player.id} player={player} team={player.team_id ? teamById.get(player.team_id) : undefined} />
              ))}
            </ul>
          )}
        </section>
      )}

      <div hidden={searching}>
        {explorer}

        <SectionTitle>Por equipo</SectionTitle>
        <ul className="grid grid-cols-3 gap-px bg-slate-800 sm:grid-cols-5 lg:grid-cols-10">
          {teams.map((team) => (
            <li key={team.id} className="bg-slate-950">
              <SharedLink href={`/teams/${team.id}`} className="flex flex-col items-center gap-1 border-b-[3px] border-transparent py-3 transition-colors hover:bg-slate-900" style={{ borderColor: teamAccent(team) }}>
                {/* Halo claro: muchos logos son oscuros y desaparecerían sobre el fondo */}
                <Shared>
                  <Image src={teamLogoUrl(team.id)} alt="" width={44} height={44} unoptimized className="size-11 drop-shadow-[0_0_2px_rgba(255,255,255,0.75)]" />
                </Shared>
                <span className="font-display text-sm font-bold uppercase text-slate-200">{team.abbreviation}</span>
              </SharedLink>
            </li>
          ))}
        </ul>

        {legends.length > 0 && (
          <>
            <SectionTitle>Leyendas</SectionTitle>
            <LegendStrip legends={legends} />
          </>
        )}
      </div>
    </>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="border-b border-slate-800 px-4 pb-2 pt-6 font-display text-lg font-bold uppercase tracking-wide text-white md:px-8">{children}</h2>
  );
}

function ResultRow({ player, team }: { player: SearchPlayer; team?: SearchTeam }) {
  const detail = player.is_active ? [team?.name ?? "Agente libre", positionLabel(player.position)].filter(Boolean).join(" · ") : "Leyenda";
  return (
    <li>
      <SharedLink href={`/players/${player.id}`} className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-slate-900 md:px-8">
        <span className="relative flex h-10 w-[54px] shrink-0 items-end overflow-hidden" style={{ background: team ? `${teamAccent(team)}26` : "#1e293b" }}>
          <Shared>
            <PlayerPhoto id={player.id} width={54} height={40} className="h-10 w-[54px] object-cover object-top" />
          </Shared>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-white">{player.full_name}</span>
          <span className="block truncate text-xs text-slate-300">{detail}</span>
        </span>
        {team && <Image src={teamLogoUrl(team.id)} alt="" width={28} height={28} unoptimized className="size-7 shrink-0" />}
      </SharedLink>
    </li>
  );
}
