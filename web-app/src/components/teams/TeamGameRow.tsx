import type { ReactNode } from "react";
import Image from "next/image";
import { Shared, SharedLink } from "@/components/layout/SharedLink";
import { ChevronRight } from "lucide-react";
import type { GameMatchup } from "@/lib/game-day";
import { teamLogoUrl } from "@/lib/nba-cdn";

// Horarios siempre en hora de España (incluye cambio de horario verano/invierno).
const TZ = "Europe/Madrid";
const dayFormat = new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short", timeZone: TZ });
const timeFormat = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: TZ });

export type RivalLite = { id: number; name: string; abbreviation: string };

/**
 * Partido de la ficha de equipo (últimos y próximos): fecha y hora en España, "vs" en casa o "@" fuera,
 * rival y, a la derecha, lo que permita el nivel de spoilers (`children`). Lleva a la ficha del partido.
 * `below`: segunda línea opcional (la del jugador en su ficha, Tarea 6.8).
 */
export function TeamGameRow({
  teamId,
  game,
  rival,
  children,
  below,
}: {
  teamId: number;
  game: GameMatchup;
  rival: RivalLite | undefined;
  children?: ReactNode;
  below?: ReactNode;
}) {
  const isHome = game.home_team_id === teamId;
  const date = new Date(game.game_datetime_utc);

  return (
    <li className="border-b border-slate-800/80">
      <SharedLink href={`/games/${game.id}`} teams={{ away: game.away_team_id, home: game.home_team_id }} className="group block py-2.5 transition-colors hover:bg-slate-900/70">
        <span className="flex items-center gap-2">
        <time dateTime={game.game_datetime_utc} className="w-16 shrink-0 font-display uppercase leading-tight">
          <span className="block text-xs font-semibold text-slate-300">{dayFormat.format(date).replace(".", "")}</span>
          <span className="block text-lg font-bold text-white tabular-nums">{timeFormat.format(date)}</span>
        </time>
        <span className="flex min-w-0 flex-1 items-center gap-2 font-semibold text-white group-hover:text-orange-400">
          {/* El lector de pantalla oye la palabra */}
          <span aria-hidden className="w-5 shrink-0 text-center font-display text-sm font-bold uppercase text-slate-400">
            {isHome ? "vs" : "@"}
          </span>
          <span className="sr-only">{isHome ? "En casa contra" : "Fuera contra"}</span>
          {rival && (
            <Shared part={isHome ? "away" : "home"}>
              <Image src={teamLogoUrl(rival.id)} alt="" width={28} height={28} unoptimized className="size-7 shrink-0" />
            </Shared>
          )}
          {/* Nombre completo solo con la columna a todo el ancho (de sm a lg); en móvil y en la columna lateral, la abreviatura */}
          <span className="truncate">
            <span className="whitespace-nowrap sm:hidden lg:inline">{rival?.abbreviation ?? "—"}</span>
            <span className="hidden sm:inline lg:hidden">{rival?.name ?? "—"}</span>
          </span>
        </span>
        {children && <span className="flex shrink-0 items-center gap-2">{children}</span>}
        {/* Sin flecha donde falta sitio: en móvil y en la columna lateral */}
        <ChevronRight className="hidden size-4 shrink-0 text-slate-600 transition-colors group-hover:text-orange-400 sm:block lg:hidden" aria-hidden />
        </span>
        {below && <span className="mt-1 block pl-[4.5rem]">{below}</span>}
      </SharedLink>
    </li>
  );
}
