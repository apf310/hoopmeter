"use client";

/* eslint-disable @next/next/no-img-element -- html-to-image necesita <img> planas del mismo origen */
import { CARD_SIZE, SocialCardExporter, WATERMARK_HEIGHT, type CardFormat } from "@/components/share/SocialCardExporter";
import { slugify } from "@/components/share/PlayerShareCard";
import { sameOrigin, teamLogoUrl } from "@/lib/nba-cdn";
import { cn } from "@/lib/utils";

/** Datos del equipo para la tarjeta (calculados en el servidor). */
export type TeamCardData = {
  id: number;
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  conference: string | null;
  division: string | null;
  wins: number;
  losses: number;
  confRank: number | null;
  streak: string | null;
  l10: string | null;
  form: ("W" | "L")[];
  home: string | null;
  road: string | null;
  diff: number | null;
  /** Próximos partidos (sin resultado: solo rival, fecha y hora). */
  upcoming: { id: string; utc: string; home: boolean; rivalId: number; rival: string }[];
};

const TZ = "Europe/Madrid";
const dayFormat = new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short", timeZone: TZ });
const timeFormat = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: TZ });

/** Botón de exportación de la ficha del equipo. */
export function TeamCardExport({ team, className }: { team: TeamCardData; className?: string }) {
  return (
    <SocialCardExporter
      className={className}
      fileName={slugify(team.name)}
      caption="Ficha de equipo"
      title={`Ficha de ${team.name}`}
      includes={["Balance y puesto", "Racha, últimos 10, casa y fuera", ...(team.upcoming.length ? ["Próximos partidos"] : [])]}
      renderCard={(format) => <TeamShareCard format={format} team={team} />}
    />
  );
}

function TeamShareCard({ format, team }: { format: CardFormat; team: TeamCardData }) {
  const vertical = format === "9:16";
  const contentHeight = CARD_SIZE[format].height - WATERMARK_HEIGHT[format];
  const stats: { label: string; value: string }[] = [
    { label: "Balance", value: `${team.wins}-${team.losses}` },
    ...(team.confRank && team.conference ? [{ label: "Posición", value: `${team.confRank}º ${team.conference}` }] : []),
    { label: "Racha", value: team.streak ?? "–" },
    { label: "Casa", value: team.home ?? "–" },
    { label: "Fuera", value: team.road ?? "–" },
    { label: "Dif. puntos", value: team.diff === null ? "–" : `${team.diff > 0 ? "+" : ""}${team.diff.toFixed(1)}` },
  ];
  const upcoming = team.upcoming.slice(0, vertical ? 4 : 2);

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{ background: `linear-gradient(${vertical ? 170 : 115}deg, ${team.primary} 0%, ${team.primary}b3 35%, #020617 80%)` }}
    >
      <div className="absolute inset-0 bg-slate-950/40" />
      <img
        src={sameOrigin(teamLogoUrl(team.id))}
        alt=""
        className="absolute opacity-[0.12]"
        style={vertical ? { width: 1100, height: 1100, right: -420, top: -200 } : { width: 1100, height: 1100, right: -300, top: -60 }}
      />
      <div className={cn("relative flex flex-col", vertical ? "px-16 pt-24" : "px-20 pt-16")} style={{ height: contentHeight }}>
        <div className="flex items-center gap-10">
          <img src={sameOrigin(teamLogoUrl(team.id))} alt="" className="shrink-0 drop-shadow-[0_16px_32px_rgba(0,0,0,0.5)]" style={{ width: vertical ? 260 : 230, height: vertical ? 260 : 230 }} />
          <div className="min-w-0">
            <p className="font-display text-3xl font-semibold uppercase tracking-[0.3em] text-white/80">
              {[team.conference && `Conferencia ${team.conference}`, team.division && `División ${team.division}`].filter(Boolean).join(" · ")}
            </p>
            <p className={cn("text-balance font-display font-extrabold uppercase leading-[0.9] text-white", vertical ? "text-8xl" : "text-8xl")}>{team.name}</p>
          </div>
        </div>

        <dl className={cn("mt-16 grid gap-x-12 gap-y-10", vertical ? "grid-cols-2" : "grid-cols-6")}>
          {stats.map(({ label, value }) => (
            <div key={label}>
              <dt className="font-display text-2xl font-semibold uppercase tracking-[0.25em] text-white/70">{label}</dt>
              <dd className="font-display text-7xl font-extrabold leading-tight text-white tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>

        {team.form.length > 0 && (
          <div className="mt-12">
            <p className="font-display text-2xl font-semibold uppercase tracking-[0.25em] text-white/70">
              {team.form.length < 10 ? `Últimos ${team.form.length}` : "Últimos 10"}
              {team.l10 ? ` · ${team.l10}` : ""}
            </p>
            <div className="mt-3 flex gap-3">
              {team.form.map((r, i) => (
                <span key={i} className={cn("h-16 w-10", r === "W" ? "bg-emerald-500" : "bg-red-500")} />
              ))}
            </div>
          </div>
        )}

        {upcoming.length > 0 && (
          <div className="mt-auto pb-12">
            <p className="border-b-2 pb-3 font-display text-3xl font-bold uppercase tracking-[0.2em] text-white" style={{ borderColor: team.accent }}>
              Próximos partidos · Hora de España
            </p>
            <ul className={cn(vertical ? "" : "grid grid-cols-2 gap-16")}>
              {upcoming.map((g) => (
                <li key={g.id} className="flex items-center gap-5 border-b border-white/10 py-4">
                  <span className="w-44 shrink-0 font-display text-3xl font-bold uppercase text-white/80">{dayFormat.format(new Date(g.utc))}</span>
                  <span className="font-display text-3xl font-semibold uppercase text-white/60">{g.home ? "vs" : "@"}</span>
                  <img src={sameOrigin(teamLogoUrl(g.rivalId))} alt="" className="size-16" />
                  <span className="font-display text-4xl font-extrabold uppercase text-white">{g.rival}</span>
                  <span className="ml-auto font-display text-3xl font-bold tabular-nums text-white/80">{timeFormat.format(new Date(g.utc))}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
