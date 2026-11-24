"use client";

import Image from "next/image";
import { Shared, SharedLink } from "@/components/layout/SharedLink";
import { formatGameTime, type TeamLite } from "@/lib/game-day";
import type { Entry } from "@/lib/game-day-store";
import { playerHeadshotUrl } from "@/lib/nba-cdn";
import { compactLine, shortName, type SpanishLinesPayload, type SpanishPlayerGame } from "@/lib/spanish-players";
import type { SpoilerLevel } from "@/lib/spoilers";
import { cn } from "@/lib/utils";

type SpanishPlayersStripProps = {
  entries: SpanishPlayerGame[];
  teamsById: Map<number, TeamLite>;
  level: SpoilerLevel;
  /** Solo en Nivel 3: la línea de cada uno en su partido. */
  lines: Entry<SpanishLinesPayload> | undefined;
};

/**
 * "Los nuestros" (Tarea 6.12): los españoles que juegan en la jornada, con enlace a su ficha. En Niveles 1
 * y 2, su equipo, el rival y la hora (sale del calendario: ni siquiera si llegó a jugar); en Nivel 3, además,
 * su línea. Sin españoles en la jornada no ocupa sitio.
 */
export function SpanishPlayersStrip({ entries, teamsById, level, lines }: SpanishPlayersStripProps) {
  if (entries.length === 0) return null;

  return (
    <section aria-label="Los nuestros: jugadores españoles de la jornada" className="border-b border-slate-800">
      {/* Se desplaza dentro de la franja: la página nunca se ensancha */}
      <ul className="flex items-center gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none] md:px-8">
        <li aria-hidden className="flex shrink-0 items-center gap-1.5 pr-1">
          <SpainFlag />
          {/* En móvil, en dos líneas: deja sitio a los jugadores */}
          <span className="w-min font-display text-xs font-semibold uppercase leading-tight tracking-[0.2em] text-slate-300 md:w-auto md:whitespace-nowrap md:tracking-[0.25em]">
            Los nuestros
          </span>
        </li>
        {entries.map(({ player, game, home, opponentId }) => {
          const team = teamsById.get(player.teamId);
          const opponent = teamsById.get(opponentId);
          const matchup = `${home ? "vs" : "@"} ${opponent?.abbreviation ?? "—"} · ${formatGameTime(game.game_datetime_utc)}`;
          const line = level === 3 ? compactLine(lines?.data?.lines[player.id]) : null;
          return (
            <li key={player.id} className="shrink-0">
              <SharedLink
                href={`/players/${player.id}`}
                title={`${player.name} · ${team?.name ?? ""} ${home ? "vs" : "@"} ${opponent?.name ?? ""}`}
                className="flex h-11 items-center gap-2 border border-slate-800 pl-1.5 pr-3 transition-colors hover:border-orange-500"
                style={team ? { borderLeftColor: team.accent, borderLeftWidth: 3 } : undefined}
              >
                <Shared>
                  <Image
                    src={playerHeadshotUrl(player.id)}
                    alt=""
                    width={44}
                    height={32}
                    className="h-8 w-11 shrink-0 object-cover object-top"
                  />
                </Shared>
                <span className="leading-tight">
                  <span className="block whitespace-nowrap font-display text-sm font-bold uppercase tracking-wide text-white">
                    {shortName(player.name)}
                    <span className="ml-1.5 text-xs text-slate-400">{team?.abbreviation}</span>
                  </span>
                  <span
                    className={cn(
                      "block whitespace-nowrap font-display text-xs font-semibold uppercase tracking-wide",
                      line ? "text-orange-300" : "text-slate-400"
                    )}
                  >
                    {line ?? matchup}
                  </span>
                </span>
              </SharedLink>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Bandera dibujada (los emojis de bandera no se ven en Windows). */
function SpainFlag() {
  return (
    <span className="flex h-3 w-[1.125rem] shrink-0 flex-col overflow-hidden rounded-[1px]">
      <span className="h-1/4 bg-red-600" />
      <span className="h-1/2 bg-yellow-400" />
      <span className="h-1/4 bg-red-600" />
    </span>
  );
}
