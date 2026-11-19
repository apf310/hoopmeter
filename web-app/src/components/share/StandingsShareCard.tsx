"use client";

/* eslint-disable @next/next/no-img-element -- html-to-image necesita <img> planas del mismo origen */
import { CARD_SIZE, SocialCardExporter, WATERMARK_HEIGHT, type CardFormat } from "@/components/share/SocialCardExporter";
import { formatShortDay } from "@/lib/game-day";
import { sameOrigin, teamLogoUrl } from "@/lib/nba-cdn";
import { cn } from "@/lib/utils";

/** Lo justo de cada equipo para la tarjeta (se calcula en el servidor: no viajan nóminas ni contratos). */
export type StandingsCardTeam = {
  id: number;
  abbreviation: string;
  conference: "East" | "West" | null;
  wins: number;
  losses: number;
  conf_rank: number | null;
  accent: string;
  l10: string | null;
  streak: string | null;
};

const ZONE = (rank: number) => (rank <= 6 ? "text-emerald-400" : rank <= 10 ? "text-amber-400" : "text-slate-400");
const updatedFormat = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", timeZone: "Europe/Madrid" });

function sorted(teams: StandingsCardTeam[]): StandingsCardTeam[] {
  const pct = (t: StandingsCardTeam) => (t.wins + t.losses ? t.wins / (t.wins + t.losses) : 0);
  return [...teams].sort((a, b) => (a.conf_rank ?? Infinity) - (b.conf_rank ?? Infinity) || pct(b) - pct(a));
}

/**
 * Botón de exportación de la clasificación (las dos conferencias), la misma que se ve en el nivel actual
 * (Tarea 6.6): con `beforeDay`, la de antes de esa jornada; si no, la de al día.
 */
export function StandingsCardExport({
  teams,
  beforeDay,
  spoiler,
  className,
}: {
  teams: StandingsCardTeam[];
  beforeDay: string | null;
  spoiler: boolean;
  className?: string;
}) {
  return (
    <SocialCardExporter
      className={className}
      fileName="clasificacion-nba"
      caption="Clasificación · Fase regular"
      title="Clasificación NBA"
      includes={[
        beforeDay ? `Clasificación antes de la jornada del ${formatShortDay(beforeDay)}` : "Clasificación al día",
        "Puesto y balance de cada equipo",
        "Zonas de playoffs y play-in",
      ]}
      spoiler={spoiler && "Incluye los resultados de la última jornada: quien la vea sabrá quién ganó."}
      renderCard={(format) => <StandingsShareCard format={format} teams={teams} beforeDay={beforeDay} />}
    />
  );
}

function StandingsShareCard({ format, teams, beforeDay }: { format: CardFormat; teams: StandingsCardTeam[]; beforeDay: string | null }) {
  const vertical = format === "9:16";
  const contentHeight = CARD_SIZE[format].height - WATERMARK_HEIGHT[format];
  const header = vertical ? 280 : 190;
  const rowHeight = Math.floor((contentHeight - header - (vertical ? 170 : 110)) / 15);
  const conferences = [
    { label: "Este", teams: sorted(teams.filter((t) => t.conference === "East")) },
    { label: "Oeste", teams: sorted(teams.filter((t) => t.conference === "West")) },
  ];

  return (
    <div className="absolute inset-0 overflow-hidden bg-[radial-gradient(ellipse_at_top,#1e293b_0%,#020617_65%)]">
      <div className="flex flex-col" style={{ height: contentHeight }}>
        <header className={cn("shrink-0 border-b-4 border-orange-500", vertical ? "px-14 pt-24" : "px-20 pt-14")} style={{ height: header }}>
          <p className="font-display text-3xl font-semibold uppercase tracking-[0.3em] text-orange-400">
            NBA · {beforeDay ? `Antes de la jornada del ${formatShortDay(beforeDay)}` : `Fase regular · ${updatedFormat.format(new Date())}`}
          </p>
          <p className={cn("mt-2 font-display font-extrabold uppercase leading-none text-white", vertical ? "text-8xl" : "text-7xl")}>Clasificación</p>
        </header>
        <div className={cn("grid flex-1 grid-cols-2", vertical ? "gap-10 px-10 pt-8" : "gap-16 px-20 pt-6")}>
          {conferences.map(({ label, teams: list }) => (
            <div key={label}>
              <p className={cn("border-b-2 border-white/15 pb-3 font-display font-extrabold uppercase text-white", vertical ? "text-5xl" : "text-4xl")}>
                Conferencia {label}
              </p>
              <ol>
                {list.map((team, i) => {
                  const rank = team.conf_rank ?? i + 1;
                  return (
                    <li
                      key={team.id}
                      className={cn("flex items-center gap-4 border-b border-white/10", (rank === 7 || rank === 11) && "border-t-2 border-t-white/30")}
                      style={{ height: rowHeight }}
                    >
                      <span className={cn("w-12 shrink-0 text-right font-display font-extrabold tabular-nums", ZONE(rank))} style={{ fontSize: rowHeight * 0.5 }}>
                        {rank}
                      </span>
                      <span className="w-1.5 shrink-0" style={{ height: rowHeight * 0.55, background: team.accent }} />
                      <img src={sameOrigin(teamLogoUrl(team.id))} alt="" style={{ width: rowHeight * 0.62, height: rowHeight * 0.62 }} />
                      <span className="font-display font-extrabold uppercase text-white" style={{ fontSize: rowHeight * 0.48 }}>
                        {team.abbreviation}
                      </span>
                      <span className="ml-auto font-display font-bold tabular-nums text-white" style={{ fontSize: rowHeight * 0.46 }}>
                        {team.wins}-{team.losses}
                      </span>
                      {!vertical && (
                        <span className="w-24 text-right font-display font-semibold tabular-nums text-slate-400" style={{ fontSize: rowHeight * 0.4 }}>
                          {team.streak ?? ""}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
        <p className={cn("flex shrink-0 gap-10 font-display font-semibold uppercase tracking-[0.2em]", vertical ? "px-14 pb-8 text-2xl" : "px-20 pb-5 text-xl")}>
          <span className="text-emerald-400">1-6 Playoffs</span>
          <span className="text-amber-400">7-10 Play-in</span>
          <span className="text-slate-400">11-15 Lotería</span>
        </p>
      </div>
    </div>
  );
}
