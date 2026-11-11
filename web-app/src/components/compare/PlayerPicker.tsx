"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Search } from "lucide-react";
import { loadSearchIndex } from "@/components/search/SearchCommand";
import { playerHeadshotUrl } from "@/lib/nba-cdn";
import { search, type SearchIndex, type SearchPlayer } from "@/lib/search";

/** Buscador de jugadores de cualquier época; reutiliza el índice del buscador de la app. */
export function PlayerPicker({ label, exclude, onPick, autoFocus }: { label: string; exclude: number | null; onPick: (playerId: number) => void; autoFocus?: boolean }) {
  const [index, setIndex] = useState<SearchIndex | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    loadSearchIndex().then(setIndex, () => {});
  }, []);

  const teams = useMemo(() => new Map(index?.teams.map((team) => [team.id, team])), [index]);
  const results = index ? search(index, query).players.filter((player) => player.id !== exclude) : [];

  const subtitle = (player: SearchPlayer) =>
    [player.position, player.team_id ? teams.get(player.team_id)?.abbreviation : player.is_active ? "Sin equipo" : "Retirado"].filter(Boolean).join(" · ");

  return (
    <div>
      <label className="flex items-center gap-2 border border-white/30 bg-slate-950/80 px-3 py-2 focus-within:border-orange-400">
        <Search className="size-5 shrink-0 text-slate-300" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Busca un jugador…"
          aria-label={label}
          autoFocus={autoFocus}
          className="w-full min-w-0 bg-transparent text-base text-white outline-none placeholder:text-slate-400"
        />
      </label>
      {results.length > 0 && (
        <ul className="mt-1 max-h-72 divide-y divide-slate-800 overflow-y-auto border border-slate-700 bg-slate-950">
          {results.map((player) => (
            <li key={player.id}>
              <button type="button" onClick={() => onPick(player.id)} className="flex w-full items-center gap-3 px-2 py-1.5 text-left transition-colors hover:bg-slate-800">
                <Image src={playerHeadshotUrl(player.id)} alt="" width={49} height={36} className="h-9 w-[49px] shrink-0 object-cover object-top" />
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-white">{player.full_name}</span>
                  <span className="block truncate text-xs text-slate-300">{subtitle(player)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
