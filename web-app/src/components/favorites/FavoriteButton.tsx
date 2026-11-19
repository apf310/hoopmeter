"use client";

import { useEffect } from "react";
import { Star } from "lucide-react";
import { isFavoritePlayer, isFavoriteTeam, type FavoritePlayer, type FavoriteTeam } from "@/lib/favorites";
import { syncFavoritePlayer, toggleFavoritePlayer, toggleFavoriteTeam, useFavorites } from "@/lib/favorites-store";
import { cn } from "@/lib/utils";

type FavoriteButtonProps = ({ kind: "team"; team: FavoriteTeam } | { kind: "player"; player: FavoritePlayer }) & { className?: string };

/**
 * Estrella de favorito en la cabecera de una ficha (mismo formato que el botón de compartir).
 * Un toque, sin confirmaciones. Marcar un favorito nunca cambia el nivel de spoilers.
 */
export function FavoriteButton(props: FavoriteButtonProps) {
  const favorites = useFavorites();
  const active = props.kind === "team" ? isFavoriteTeam(favorites, props.team.id) : isFavoritePlayer(favorites, props.player.id);
  const name = props.kind === "team" ? props.team.name : props.player.name;

  // La ficha del jugador tiene su equipo de hoy: si es favorito, se apunta (por si lo traspasaron)
  const playerId = props.kind === "player" ? props.player.id : null;
  const playerName = props.kind === "player" ? props.player.name : "";
  const playerTeamId = props.kind === "player" ? props.player.teamId : null;
  useEffect(() => {
    if (playerId !== null && active) syncFavoritePlayer({ id: playerId, name: playerName, teamId: playerTeamId });
  }, [playerId, playerName, playerTeamId, active]);

  const label = active ? `Quitar de favoritos: ${name}` : `Añadir a favoritos: ${name}`;
  return (
    <button
      type="button"
      onClick={() => (props.kind === "team" ? toggleFavoriteTeam(props.team) : toggleFavoritePlayer(props.player))}
      aria-pressed={active}
      aria-label={label}
      title={active ? "Quitar de favoritos" : "Añadir a favoritos"}
      className={cn(
        "inline-flex size-10 items-center justify-center border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-orange-400",
        active
          ? "border-orange-500 bg-slate-950/60 text-orange-400 hover:bg-orange-500/15"
          : "border-white/25 bg-slate-950/60 text-white hover:border-orange-500 hover:text-orange-400",
        props.className
      )}
    >
      <Star className={cn("size-5", active && "fill-current")} />
    </button>
  );
}
