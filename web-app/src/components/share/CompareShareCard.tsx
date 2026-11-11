"use client";

/* eslint-disable @next/next/no-img-element -- html-to-image necesita <img> planas del mismo origen */
import { DuelRadar } from "@/components/compare/DuelRadar";
import { fitFont, slugify } from "@/components/share/PlayerShareCard";
import { CARD_SIZE, SocialCardExporter, WATERMARK_HEIGHT, type CardFormat } from "@/components/share/SocialCardExporter";
import { CAREER, score, type DuelRow } from "@/lib/compare";
import type { DuelPlayer, DuelSeason } from "@/lib/compare-data";
import { playerHeadshotUrl, sameOrigin, teamLogoUrl } from "@/lib/nba-cdn";
import { cn } from "@/lib/utils";

type ShareProps = {
  a: DuelPlayer;
  b: DuelPlayer;
  seasonA: DuelSeason;
  seasonB: DuelSeason;
  attributes: DuelRow[];
  stats: DuelRow[];
  colors: [string, string];
};

const CARD_ROWS = ["pts", "reb", "ast", "stl", "blk", "tsPct"];

const period = (season: DuelSeason) => (season.id === CAREER ? "Carrera" : season.id) + (season.phase === "Playoffs" ? " · Playoffs" : "");

/** Botón de exportación de la tarjeta del duelo. */
export function CompareCardExport(props: ShareProps) {
  return (
    <SocialCardExporter
      fileName={`${slugify(props.a.name)}-vs-${slugify(props.b.name)}`}
      caption="Cara a cara"
      renderCard={(format) => <CompareShareCard format={format} {...props} />}
    />
  );
}

function CompareShareCard({ format, a, b, seasonA, seasonB, attributes, stats, colors }: ShareProps & { format: CardFormat }) {
  const vertical = format === "9:16";
  const contentHeight = CARD_SIZE[format].height - WATERMARK_HEIGHT[format];
  const rows = stats.filter((row) => CARD_ROWS.includes(row.key));
  const wins = score(stats);

  const center = (
    <div className={cn("flex min-w-0 flex-col items-center", vertical ? "px-12" : "w-[720px] shrink-0 px-6 py-5")}>
      <p className="font-display text-2xl font-semibold uppercase tracking-[0.3em] text-orange-400">Cara a cara</p>
      <p className="font-display font-extrabold leading-none text-white tabular-nums" style={{ fontSize: vertical ? 120 : 96 }}>
        {wins.a} – {wins.b}
      </p>
      <p className="font-display text-xl font-semibold uppercase tracking-[0.25em] text-white/70">Estadísticas ganadas</p>
      <DuelRadar a={seasonA.radar} b={seasonB.radar} colors={colors} size={vertical ? { width: 960, height: 560 } : { width: 680, height: 400 }} />
      <dl className="w-full">
        {rows.map((row) => (
          <div key={row.key} className={cn("grid grid-cols-3 items-baseline border-t-2 border-white/10 font-display tabular-nums", vertical && "py-1")}>
            <dd className={cn("font-extrabold leading-tight", vertical ? "text-5xl" : "text-[32px]", row.winner === "b" ? "text-white/55" : "text-white")}>{row.aText}</dd>
            <dt className={cn("text-center font-semibold uppercase tracking-[0.1em] text-white/75", vertical ? "text-2xl" : "text-lg")}>{row.label}</dt>
            <dd className={cn("text-right font-extrabold leading-tight", vertical ? "text-5xl" : "text-[32px]", row.winner === "a" ? "text-white/55" : "text-white")}>{row.bText}</dd>
          </div>
        ))}
      </dl>
    </div>
  );

  return (
    <div className="absolute inset-0 overflow-hidden bg-slate-950" style={{ height: contentHeight }}>
      {vertical ? (
        <div className="flex h-full flex-col">
          <div className="grid shrink-0 grid-cols-2" style={{ height: 580 }}>
            <PlayerPanel player={a} season={seasonA} attributes={attributes} side="a" format={format} />
            <PlayerPanel player={b} season={seasonB} attributes={attributes} side="b" format={format} />
          </div>
          <div className="flex min-h-0 flex-1 flex-col justify-center pt-4">{center}</div>
        </div>
      ) : (
        <div className="flex h-full">
          <PlayerPanel player={a} season={seasonA} attributes={attributes} side="a" format={format} />
          {center}
          <PlayerPanel player={b} season={seasonB} attributes={attributes} side="b" format={format} />
        </div>
      )}
    </div>
  );
}

function PlayerPanel({ player, season, attributes, side, format }: { player: DuelPlayer; season: DuelSeason; attributes: DuelRow[]; side: "a" | "b"; format: CardFormat }) {
  const vertical = format === "9:16";
  const right = side === "b";
  const primary = player.team?.primary_color ?? "#334155";
  const [firstName, ...rest] = player.name.split(" ");
  const surname = rest.join(" ") || firstName;
  const width = vertical ? 460 : 520;
  const wins = score(attributes)[side];

  return (
    <section
      className={cn("relative flex min-w-0 flex-1 flex-col justify-end overflow-hidden px-8 pb-8", right && "items-end text-right")}
      style={{ background: `linear-gradient(${vertical ? (right ? 200 : 160) : right ? 245 : 115}deg, ${primary} 0%, ${primary}b3 40%, #020617 100%)` }}
    >
      <div className="absolute inset-0 bg-slate-950/40" />
      {player.team && (
        <img src={sameOrigin(teamLogoUrl(player.team.id))} alt="" className={cn("absolute size-[520px] opacity-[0.12]", right ? "-left-40 top-10" : "-right-40 top-10")} />
      )}
      <img
        src={sameOrigin(playerHeadshotUrl(player.id))}
        alt=""
        className={cn("absolute max-w-none drop-shadow-[0_16px_32px_rgba(0,0,0,0.6)]", right ? "right-0" : "left-0")}
        style={vertical ? { width: 470, top: 16 } : { width: 600, top: 120 }}
      />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-slate-950 to-transparent" />

      <div className="relative">
        <p className="font-display text-2xl font-semibold uppercase tracking-[0.25em] text-white/80">{period(season)}</p>
        {rest.length > 0 && <p className="font-display text-4xl font-bold uppercase leading-none text-white/85">{firstName}</p>}
        <p className="whitespace-nowrap font-display font-extrabold uppercase leading-[0.9] text-white" style={{ fontSize: fitFont(surname, width - 64, vertical ? 96 : 120) }}>
          {surname}
        </p>
        <p className="mt-1 font-display text-2xl font-bold uppercase text-white/85">{wins} de {attributes.length} atributos</p>
      </div>
    </section>
  );
}
