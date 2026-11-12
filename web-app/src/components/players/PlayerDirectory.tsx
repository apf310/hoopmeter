"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { playerHeadshotUrl, teamLogoUrl } from "@/lib/nba-cdn";
import { positionLabel, tierOf } from "@/lib/player-profile";
import type { StarPlayer } from "@/lib/queries";
import { search, type SearchIndex, type SearchPlayer } from "@/lib/search";
import { teamAccent } from "@/lib/team-colors";
import { cn } from "@/lib/utils";

const RESULT_LIMIT = 40;

/** Directorio de jugadores: buscador instantáneo y, sin búsqueda, los mejores, los equipos y las leyendas. */
export function PlayerDirectory({ index, stars, legends }: { index: SearchIndex; stars: StarPlayer[]; legends: { id: number; name: string }[] }) {
  const [query, setQuery] = useState("");
  const teams = useMemo(() => new Map(index.teams.map((team) => [team.id, team])), [index.teams]);
  const results = useMemo(() => search(index, query, { teams: 0, players: RESULT_LIMIT }).players, [index, query]);
  const searching = query.trim() !== "";

  return (
    <>
      <div className="sticky top-14 z-10 border-b border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur md:top-0 md:px-8">
        <label className="flex items-center gap-3 bg-slate-900 px-4 ring-1 ring-inset ring-slate-700 focus-within:ring-2 focus-within:ring-orange-500">
          <Search className="size-5 shrink-0 text-slate-400" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
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

      {searching ? (
        <section aria-live="polite">
          {results.length === 0 ? (
            <p className="px-4 py-8 text-slate-300 md:px-8">Ningún jugador coincide con «{query}».</p>
          ) : (
            <ul className="divide-y divide-slate-800/80">
              {results.map((player) => (
                <ResultRow key={player.id} player={player} team={player.team_id ? teams.get(player.team_id) : undefined} />
              ))}
            </ul>
          )}
        </section>
      ) : (
        <>
          <SectionTitle>Los mejores de la temporada</SectionTitle>
          <ul className="grid grid-cols-2 gap-px bg-slate-800 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {stars.map((star, rank) => {
              const team = teams.get(star.teamId);
              const tier = tierOf(star.overall);
              return (
                <li key={star.id} className="bg-slate-950">
                  <Link href={`/players/${star.id}`} className="group relative block overflow-hidden" style={{ background: `linear-gradient(160deg, ${team?.primary_color ?? "#334155"}55 0%, #020617 75%)` }}>
                    <span className="absolute left-3 top-2 font-display text-3xl font-extrabold text-white/25">{rank + 1}</span>
                    <span className={cn("absolute right-3 top-2 font-display text-3xl font-extrabold leading-none", tier.textClass)}>{star.overall}</span>
                    <Image src={playerHeadshotUrl(star.id)} alt="" width={260} height={190} className="mx-auto mt-6 h-[120px] w-auto object-contain object-bottom transition-transform group-hover:scale-105" />
                    <span className="block h-1" style={{ background: team ? teamAccent(team) : "#f97316" }} aria-hidden />
                    <span className="block px-3 pb-3 pt-2">
                      <span className="block truncate font-display text-lg font-extrabold uppercase leading-tight text-white">{star.name}</span>
                      <span className="block truncate text-xs text-slate-300">{[team?.abbreviation, positionLabel(star.position)].filter(Boolean).join(" · ")}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>

          <SectionTitle>Por equipo</SectionTitle>
          <ul className="grid grid-cols-3 gap-px bg-slate-800 sm:grid-cols-5 lg:grid-cols-10">
            {index.teams.map((team) => (
              <li key={team.id} className="bg-slate-950">
                <Link href={`/teams/${team.id}`} className="flex flex-col items-center gap-1 border-b-[3px] border-transparent py-3 transition-colors hover:bg-slate-900" style={{ borderColor: teamAccent(team) }}>
                  {/* Halo claro: muchos logos son oscuros y desaparecerían sobre el fondo */}
                  <Image src={teamLogoUrl(team.id)} alt="" width={44} height={44} unoptimized className="size-11 drop-shadow-[0_0_2px_rgba(255,255,255,0.75)]" />
                  <span className="font-display text-sm font-bold uppercase text-slate-200">{team.abbreviation}</span>
                </Link>
              </li>
            ))}
          </ul>

          {legends.length > 0 && (
            <>
              <SectionTitle>Leyendas</SectionTitle>
              <ul className="flex flex-wrap gap-2 px-4 py-4 md:px-8">
                {legends.map((legend) => (
                  <li key={legend.id}>
                    <Link href={`/players/${legend.id}`} className="block bg-slate-900 px-3 py-1.5 font-display text-sm font-bold uppercase tracking-wide text-slate-200 ring-1 ring-inset ring-slate-700 transition-colors hover:bg-orange-500 hover:text-slate-950">
                      {legend.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="border-b border-slate-800 px-4 pb-2 pt-6 font-display text-lg font-bold uppercase tracking-wide text-white md:px-8">{children}</h2>
  );
}

function ResultRow({ player, team }: { player: SearchPlayer; team?: SearchIndex["teams"][number] }) {
  const detail = player.is_active ? [team?.name ?? "Agente libre", positionLabel(player.position)].filter(Boolean).join(" · ") : "Leyenda";
  return (
    <li>
      <Link href={`/players/${player.id}`} className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-slate-900 md:px-8">
        <span className="relative flex h-10 w-[54px] shrink-0 items-end overflow-hidden" style={{ background: team ? `${teamAccent(team)}26` : "#1e293b" }}>
          <Image src={playerHeadshotUrl(player.id)} alt="" width={54} height={40} className="h-10 w-[54px] object-cover object-top" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-white">{player.full_name}</span>
          <span className="block truncate text-xs text-slate-300">{detail}</span>
        </span>
        {team && <Image src={teamLogoUrl(team.id)} alt="" width={28} height={28} unoptimized className="size-7 shrink-0" />}
      </Link>
    </li>
  );
}
