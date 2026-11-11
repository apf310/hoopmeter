import Image from "next/image";
import Link from "next/link";
import { Lock } from "lucide-react";
import { Section } from "@/components/games/detail/ui";
import { SpoilerModeSelector } from "@/components/layout/SpoilerModeSelector";
import type { MatchupTeam } from "@/lib/game-format";
import { playerHeadshotUrl, teamLogoUrl } from "@/lib/nba-cdn";
import { avg, positionLabel } from "@/lib/player-profile";
import type { KeyPlayer } from "@/lib/queries";

/** Previa sin spoilers: los máximos anotadores de la temporada de cada equipo (promedios, no este partido). */
export function KeyPlayers({ players, away, home }: { players: KeyPlayer[]; away: MatchupTeam; home: MatchupTeam }) {
  if (players.length === 0) return null;

  return (
    <Section title="Jugadores a seguir">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-10">
        {[away, home].map((team) => {
          const own = players.filter((p) => p.team_id === team.id);
          if (own.length === 0) return null;
          return (
            <div key={team.id}>
              <p className="flex items-center gap-2 border-b border-slate-800 pb-2 font-display text-base font-bold uppercase tracking-wide text-white">
                <Image src={teamLogoUrl(team.id)} alt="" width={24} height={24} unoptimized className="size-6" />
                {team.name}
                <span className="ml-auto text-xs font-semibold tracking-[0.2em] text-slate-400">Promedios {own[0].season_id}</span>
              </p>
              <ul>
                {own.map((player) => (
                  <li key={player.id} className="border-b border-slate-800/80">
                    <Link href={`/players/${player.id}`} className="group flex items-center gap-3 py-2 transition-colors hover:bg-slate-900">
                      <span className="flex h-11 w-[60px] shrink-0 items-end overflow-hidden" style={{ background: `${team.accent}26` }}>
                        <Image src={playerHeadshotUrl(player.id)} alt="" width={60} height={44} className="h-11 w-[60px] object-cover object-top" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-white group-hover:text-orange-400">{player.full_name}</span>
                        <span className="block text-xs text-slate-400">{positionLabel(player.position) ?? "–"}</span>
                      </span>
                      <dl className="flex shrink-0 gap-4 text-right">
                        {(
                          [
                            ["PTS", player.pts],
                            ["REB", player.reb],
                            ["AST", player.ast],
                          ] as const
                        ).map(([label, value]) => (
                          <div key={label} className="w-9">
                            <dt className="font-display text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</dt>
                            <dd className="font-display text-xl font-bold text-white tabular-nums">{avg(value)}</dd>
                          </div>
                        ))}
                      </dl>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

/** Lo que espera detrás del Nivel 3, con el selector a mano para desbloquearlo sin salir de aquí. */
export function LockedStats({ level }: { level: 1 | 2 }) {
  return (
    <section className="relative overflow-hidden border-b border-slate-800 px-4 py-12 md:px-8">
      <LockedBackdrop />
      <div className="relative mx-auto max-w-md text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-slate-900 ring-1 ring-slate-700">
          <Lock className="size-5 text-orange-400" />
        </span>
        <h2 className="mt-4 font-display text-3xl font-extrabold uppercase text-white">Estadísticas ocultas</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          Boxscore completo y avanzado, mapa de tiro, flujo del marcador y jugada a jugada. Ocultos para no destriparte nada
          {level === 2 ? ": de momento solo ves la nota." : "."}
        </p>
        <div className="mx-auto mt-6 max-w-xs border border-slate-800 bg-slate-950/90">
          <SpoilerModeSelector withLabel />
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Mantén pulsado <span className="font-semibold text-slate-200">Resultados</span> un segundo para verlas.
        </p>
      </div>
    </section>
  );
}

/** Siluetas decorativas (barras y pista): formas fijas, sin ningún dato del partido. */
function LockedBackdrop() {
  return (
    <svg aria-hidden viewBox="0 0 800 300" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full opacity-[0.22] blur-[2px]">
      <g fill="#334155">
        {[0.62, 0.48, 0.8, 0.35, 0.7, 0.55].map((w, i) => (
          <rect key={i} x={40} y={40 + i * 38} width={260 * w} height={10} rx={5} />
        ))}
      </g>
      <g fill="none" stroke="#334155" strokeWidth={4}>
        <path d="M 520 40 L 520 120 A 130 130 0 0 0 760 120 L 760 40" />
        <rect x={590} y={40} width={100} height={110} />
        <circle cx={640} cy={60} r={8} />
      </g>
      <path d="M 40 270 H 180 V 250 H 300 V 280 H 420 V 240 H 560 V 260 H 760" fill="none" stroke="#475569" strokeWidth={4} />
    </svg>
  );
}

/** Nivel 3 sin ficha: antes del salto inicial o, si ya terminó, cuando la NBA no la publica. */
export function NotStarted({ finished }: { finished: boolean }) {
  return (
    <section className="border-b border-slate-800 px-4 py-10 text-center md:px-8">
      <p className="font-display text-2xl font-bold uppercase text-slate-200">
        {finished ? "Estadísticas no disponibles" : "El partido aún no ha empezado"}
      </p>
      <p className="mt-2 text-sm text-slate-400">
        {finished
          ? "La NBA no ha publicado el boxscore de este partido."
          : "El boxscore, el mapa de tiro y la jugada a jugada aparecerán aquí en directo en cuanto empiece."}
      </p>
    </section>
  );
}
