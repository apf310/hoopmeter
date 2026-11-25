"use client";

import Image from "next/image";
import Link from "next/link";
import { Star } from "lucide-react";
import { PlayerPhoto } from "@/components/players/PlayerPhoto";
import type { Favorites } from "@/lib/favorites";
import { useFavorites } from "@/lib/favorites-store";
import { teamLogoUrl } from "@/lib/nba-cdn";
import { cn } from "@/lib/utils";

const surname = (name: string) => name.split(" ").slice(1).join(" ") || name;

/**
 * Franja de acceso rápido de la portada en móvil (en escritorio está en la Sidebar): tus equipos y
 * jugadores. Solo enlaces a su ficha; sin nada del resultado. Sin favoritos no ocupa sitio.
 */
export function FavoritesStrip({ favorites, className }: { favorites: Favorites; className?: string }) {
  if (favorites.teams.length === 0 && favorites.players.length === 0) return null;
  return (
    <nav aria-label="Tus favoritos" className={cn("border-b border-slate-800", className)}>
      {/* Se desplaza dentro de la franja: la página nunca se ensancha */}
      <ul className="flex items-center gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none] md:px-8">
        <li aria-hidden className="shrink-0">
          <Star className="size-4 fill-orange-500 text-orange-500" />
        </li>
        {favorites.teams.map((team) => (
          <li key={`t${team.id}`} className="shrink-0">
            <Link href={`/teams/${team.id}`} className={CHIP} title={team.name}>
              <Image src={teamLogoUrl(team.id)} alt="" width={20} height={20} unoptimized className="size-5" />
              {team.abbreviation}
            </Link>
          </li>
        ))}
        {favorites.players.map((player) => (
          <li key={`p${player.id}`} className="shrink-0">
            <Link href={`/players/${player.id}`} className={CHIP} title={player.name}>
              <PlayerPhoto id={player.id} width={30} height={22} className="h-[22px] w-[30px] object-cover object-top" />
              {surname(player.name)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

const CHIP =
  "flex h-8 items-center gap-1.5 border border-slate-800 pl-1.5 pr-2.5 font-display text-sm font-bold uppercase tracking-wide text-slate-200 transition-colors hover:border-orange-500 hover:text-white";

/** Bloque "Favoritos" de la Sidebar (escritorio). Se pinta tras hidratar: no mueve el contenido. */
export function SidebarFavorites() {
  const favorites = useFavorites();
  if (favorites.teams.length === 0 && favorites.players.length === 0) return null;

  return (
    <nav aria-label="Tus favoritos" className="min-h-0 flex-1 overflow-y-auto border-t border-slate-800 py-3">
      <p className="flex items-center gap-2 px-6 pb-2 font-display text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
        <Star className="size-3.5 fill-orange-500 text-orange-500" />
        Favoritos
      </p>
      <ul>
        {favorites.teams.map((team) => (
          <li key={`t${team.id}`}>
            <Link href={`/teams/${team.id}`} className={ROW}>
              <Image src={teamLogoUrl(team.id)} alt="" width={24} height={24} unoptimized className="size-6 shrink-0" />
              <span className="truncate">{team.name}</span>
            </Link>
          </li>
        ))}
        {favorites.players.map((player) => (
          <li key={`p${player.id}`}>
            <Link href={`/players/${player.id}`} className={ROW}>
              <PlayerPhoto
                id={player.id}
                width={33}
                height={24}
                className="h-6 w-[33px] shrink-0 object-cover object-top"
              />
              <span className="truncate">{player.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

const ROW =
  "flex items-center gap-3 px-6 py-1.5 font-sans text-sm font-medium text-slate-300 transition-colors hover:bg-slate-900 hover:text-white";
