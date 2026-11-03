"use client";

/* eslint-disable @next/next/no-img-element -- html-to-image necesita <img> planas del mismo origen */
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart } from "recharts";
import { CARD_SIZE, SocialCardExporter, WATERMARK_HEIGHT, type CardFormat } from "@/components/share/SocialCardExporter";
import { playerHeadshotUrl, sameOrigin, teamLogoUrl } from "@/lib/nba-cdn";
import { archetypeOf, avg, overallRating, pct, positionLabel, RADAR_LABEL, tierOf } from "@/lib/player-profile";
import { teamAccent } from "@/lib/team-colors";
import { RADAR_CATEGORIES, type Player, type PlayerSeasonStats, type RadarAttributes, type Team } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type CardData = {
  player: Player;
  team: Team | null;
  radar: RadarAttributes | null;
  season: PlayerSeasonStats | null;
  age: number | null;
};

/** "Luka Dončić" → "luka-doncic" */
function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Tamaño de fuente para que el apellido quepa en `maxWidth` (Barlow Condensed ≈ 0.5em por letra). */
function fitFont(text: string, maxWidth: number, maxSize: number): number {
  return Math.min(maxSize, Math.floor(maxWidth / (Math.max(text.length, 1) * 0.5)));
}

/** Botón de exportación de la ficha del jugador (cabecera + radar + cifras de la temporada). */
export function PlayerCardExport({ className, ...data }: CardData & { className?: string }) {
  return (
    <SocialCardExporter
      className={className}
      fileName={slugify(data.player.full_name)}
      caption="Ficha de jugador"
      renderCard={(format) => <PlayerShareCard format={format} {...data} />}
    />
  );
}

function PlayerShareCard({ format, player, team, radar, season, age }: CardData & { format: CardFormat }) {
  const vertical = format === "9:16";
  const { width, height } = CARD_SIZE[format];
  const contentHeight = height - WATERMARK_HEIGHT[format];
  const primary = team?.primary_color ?? "#334155";
  const accent = team ? teamAccent(team) : "#f97316";
  const [firstName, ...rest] = player.full_name.split(" ");
  const lastName = rest.join(" ") || firstName;
  const position = positionLabel(player.position);
  const subtitle = [team?.name ?? (player.is_active ? "Agente libre" : "Retirado"), position, age ? `${age} años` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{ background: `linear-gradient(${vertical ? 170 : 115}deg, ${primary} 0%, ${primary}b3 30%, #020617 80%)` }}
    >
      <div className="absolute inset-0 bg-slate-950/40" />
      {team && (
        <img
          src={sameOrigin(teamLogoUrl(team.id))}
          alt=""
          className="absolute opacity-[0.12]"
          style={vertical ? { width: 900, height: 900, right: -300, top: -120 } : { width: 1000, height: 1000, right: -200, top: 40 }}
        />
      )}
      {/* Apellido gigante de fondo, como en los grafismos de presentación de TV */}
      <span
        className="absolute left-6 whitespace-nowrap font-display font-extrabold uppercase leading-[0.75] text-white/[0.06]"
        style={{ fontSize: vertical ? 360 : 420, bottom: vertical ? 760 : -10 }}
      >
        {lastName}
      </span>

      {vertical ? (
        <div className="relative flex flex-col" style={{ height: contentHeight }}>
          <div className="px-16 pt-20">
            <Identity team={team} subtitle={subtitle} firstName={rest.length ? firstName : ""} lastName={lastName} nameWidth={width - 128} maxSize={200} />
            {radar && <RatingBadge radar={radar} big />}
          </div>
          <div className="relative min-h-0 flex-1">
            <img
              src={sameOrigin(playerHeadshotUrl(player.id))}
              alt=""
              className="absolute bottom-0 left-1/2 h-full w-auto max-w-none -translate-x-1/2 object-contain drop-shadow-[0_20px_40px_rgba(0,0,0,0.6)]"
            />
          </div>
          <div className="h-2" style={{ background: team?.secondary_color ?? accent }} />
          <div className="flex items-center gap-4 bg-slate-950/80 py-8 pl-4 pr-16">
            {radar && <ShareRadar radar={radar} accent={accent} size={500} />}
            {season && <StatGrid season={season} columns={radar ? 2 : 3} className="min-w-0 flex-1" />}
          </div>
        </div>
      ) : (
        <div className="relative flex" style={{ height: contentHeight }}>
          <div className="relative z-10 flex w-[760px] shrink-0 flex-col justify-between py-20 pl-20">
            <div>
              <Identity team={team} subtitle={subtitle} firstName={rest.length ? firstName : ""} lastName={lastName} nameWidth={680} maxSize={170} />
              {radar && <RatingBadge radar={radar} />}
            </div>
            {season && <StatGrid season={season} />}
          </div>
          <div className="relative min-w-0 flex-1">
            <img
              src={sameOrigin(playerHeadshotUrl(player.id))}
              alt=""
              className="absolute bottom-0 left-1/2 h-auto w-[760px] max-w-none -translate-x-1/2 drop-shadow-[0_20px_40px_rgba(0,0,0,0.6)]"
            />
          </div>
          {radar && (
            <div className="flex w-[600px] shrink-0 flex-col items-center justify-center pr-12">
              <p className="font-display text-lg font-semibold uppercase tracking-[0.3em] text-white/70">Atributos · Percentil vs liga</p>
              <ShareRadar radar={radar} accent={accent} size={560} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Identity({
  team,
  subtitle,
  firstName,
  lastName,
  nameWidth,
  maxSize,
}: {
  team: Team | null;
  subtitle: string;
  firstName: string;
  lastName: string;
  nameWidth: number;
  maxSize: number;
}) {
  return (
    <>
      <p className="flex items-center gap-4 font-display text-2xl font-semibold uppercase tracking-[0.3em] text-white/80">
        {team && <img src={sameOrigin(teamLogoUrl(team.id))} alt="" className="size-12" />}
        {subtitle}
      </p>
      <h1 className="mt-4 font-display font-extrabold uppercase leading-[0.85] text-white">
        {firstName && <span className="block text-6xl text-white/85">{firstName}</span>}
        <span className="block whitespace-nowrap" style={{ fontSize: fitFont(lastName, nameWidth, maxSize) }}>
          {lastName}
        </span>
      </h1>
    </>
  );
}

/** Insignia estilo videojuego: media global + arquetipo (misma que en la ficha). */
function RatingBadge({ radar, big }: { radar: RadarAttributes; big?: boolean }) {
  const overall = overallRating(radar);
  const tier = tierOf(overall);
  return (
    <div className={cn("flex w-fit items-stretch", big ? "mt-8" : "mt-6")}>
      <div
        className="flex flex-col items-center justify-center py-2 pl-6 pr-10 text-slate-950 [clip-path:polygon(0_0,100%_0,82%_100%,0_100%)]"
        style={{ background: tier.color }}
      >
        <span className={cn("font-display font-extrabold leading-none tabular-nums", big ? "text-8xl" : "text-7xl")}>{overall}</span>
        <span className="font-display text-base font-bold uppercase tracking-[0.25em]">Media</span>
      </div>
      <div className="-ml-4 flex flex-col justify-center bg-slate-950/80 py-2 pl-9 pr-7">
        <span className="font-display text-base font-semibold uppercase tracking-[0.25em] text-white/60">Perfil · {tier.label}</span>
        <span className={cn("font-display font-bold uppercase leading-tight text-white", big ? "text-5xl" : "text-4xl")}>{archetypeOf(radar)}</span>
      </div>
    </div>
  );
}

function StatGrid({ season, columns = 3, className }: { season: PlayerSeasonStats; columns?: 2 | 3; className?: string }) {
  const stats = [
    { label: "Puntos", value: avg(season.pts) },
    { label: "Rebotes", value: avg(season.reb) },
    { label: "Asistencias", value: avg(season.ast) },
    { label: "% Tiro", value: pct(season.fg_pct) },
    { label: "% Triple", value: pct(season.fg3_pct) },
    { label: "TS%", value: pct(season.advanced_stats.ts_pct) },
  ];
  return (
    <div className={className}>
      <p className="font-display text-lg font-semibold uppercase tracking-[0.25em] text-white/70">
        Temporada {season.season_id} · {season.games_played ?? 0} partidos
      </p>
      <dl className={cn("mt-3 grid gap-y-4", columns === 3 ? "grid-cols-3" : "grid-cols-2")}>
        {stats.map((s, i) => (
          <div key={s.label} className={cn(i % columns !== 0 && "border-l border-white/15 pl-8")}>
            <dt className="font-display text-lg font-semibold uppercase tracking-[0.2em] text-slate-300">{s.label}</dt>
            <dd className="font-display text-6xl font-extrabold leading-none text-white tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

type AngleTickProps = {
  x?: number | string;
  y?: number | string;
  textAnchor?: "start" | "middle" | "end" | "inherit";
  index?: number;
  payload?: { value: string };
};

const DISPLAY_FONT = "var(--font-barlow-condensed), sans-serif";

// Eje superior (0) por encima del vértice, inferior (3) por debajo, laterales centrados
const LABEL_OFFSET: Record<number, number> = { 0: -48, 3: 24 };

/** Radar a tamaño fijo y sin animación: en la captura tiene que salir completo al instante. */
function ShareRadar({ radar, accent, size }: { radar: RadarAttributes; accent: string; size: number }) {
  const data = RADAR_CATEGORIES.map((c) => ({ label: RADAR_LABEL[c], value: radar[c], league: 50 }));
  const valueByLabel = new Map(data.map((d) => [d.label, d.value]));

  const renderTick = ({ x, y, textAnchor, index = 1, payload }: AngleTickProps) => {
    if (!payload) return <g />;
    const value = valueByLabel.get(payload.value) ?? 0;
    return (
      // Fuente y mayúsculas explícitas: la captura no conserva las clases CSS dentro del SVG
      <text x={x} y={Number(y) + (LABEL_OFFSET[index] ?? -10)} textAnchor={textAnchor} fontFamily={DISPLAY_FONT}>
        <tspan x={x} fontSize={20} fontWeight={600} letterSpacing="0.12em" fill="#cbd5e1">
          {payload.value.toUpperCase()}
        </tspan>
        <tspan x={x} dy={34} fontSize={34} fontWeight={800} fill={tierOf(value).color}>
          {value}
        </tspan>
      </text>
    );
  };

  return (
    <RadarChart width={size} height={size} data={data} outerRadius="62%" margin={{ top: 56, right: 72, bottom: 56, left: 72 }}>
      <PolarGrid stroke="#475569" strokeOpacity={0.7} />
      <PolarAngleAxis dataKey="label" tick={renderTick} />
      <PolarRadiusAxis domain={[0, 99]} tick={false} axisLine={false} tickCount={5} />
      <Radar dataKey="league" stroke="#94a3b8" strokeDasharray="6 6" strokeWidth={2} fill="none" isAnimationActive={false} />
      <Radar
        dataKey="value"
        stroke={accent}
        strokeWidth={4}
        fill={accent}
        fillOpacity={0.35}
        dot={{ r: 5, fill: accent, strokeWidth: 0 }}
        isAnimationActive={false}
      />
    </RadarChart>
  );
}
