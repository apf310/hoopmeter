"use client";

/* eslint-disable @next/next/no-img-element -- html-to-image necesita <img> planas del mismo origen */
import type { ExplorerTeam } from "@/components/players/PlayerExplorer";
import { CARD_SIZE, SocialCardExporter, WATERMARK_HEIGHT, type CardFormat } from "@/components/share/SocialCardExporter";
import { playerHeadshotUrl, sameOrigin, teamLogoUrl } from "@/lib/nba-cdn";
import { EXPLORER_MODES, formatStat, scalesWithMode, slugify, statValue, type ExplorerMode, type ExplorerRow, type ExplorerSort } from "@/lib/player-explorer";
import { cn } from "@/lib/utils";

const TOP = 10;

type CardRow = { id: number; name: string; team?: ExplorerTeam; value: string; games: number };

/**
 * Modo Creador del explorador (Tarea 6.22): los 10 primeros de la tabla tal como está (estadística, modo,
 * temporada y filtros). Son estadísticas de temporada: sin spoilers.
 */
export function ExplorerCardExport({
  rows,
  sort,
  mode,
  season,
  title,
  filters,
  minimum,
  teamById,
  className,
}: {
  /** Ya filtrados y ordenados. */
  rows: ExplorerRow[];
  sort: ExplorerSort;
  mode: ExplorerMode;
  season: string;
  /** "Puntos por partido". */
  title: string;
  filters: string[];
  minimum: string;
  teamById: Map<number, ExplorerTeam>;
  className?: string;
}) {
  const top: CardRow[] = rows.slice(0, TOP).map((row) => ({
    id: row.id,
    name: row.name,
    team: row.teamId ? teamById.get(row.teamId) : undefined,
    value: sort.key === "salary" && row.salaryStatus === "approx" ? `≈${formatStat(row.salary, "salary", mode)}` : formatStat(statValue(row, sort.key, mode), sort.key, mode),
    games: row.totals.gp,
  }));
  const modeLabel = scalesWithMode(sort.key) ? EXPLORER_MODES.find((m) => m.id === mode)!.label : null;
  const heading = sort.dir === "asc" ? `${title} · de menos a más` : title;
  const subtitle = [...filters, minimum].join(" · ");

  if (top.length === 0) return null;
  return (
    <SocialCardExporter
      className={className}
      fileName={`jugadores-${slugify(title)}-${season}`}
      caption={`Explorador de jugadores · ${season}`}
      title={`Top ${top.length}: ${heading.toLowerCase()}`}
      includes={[`Los ${top.length} primeros de la tabla, en el orden que tienes`, filters.length ? `Filtros: ${filters.join(", ")}` : "Sin filtros", minimum]}
      renderCard={(format) => <ExplorerShareCard format={format} rows={top} heading={heading} season={season} modeLabel={modeLabel} subtitle={subtitle} />}
    />
  );
}

function ExplorerShareCard({
  format,
  rows,
  heading,
  season,
  modeLabel,
  subtitle,
}: {
  format: CardFormat;
  rows: CardRow[];
  heading: string;
  season: string;
  modeLabel: string | null;
  subtitle: string;
}) {
  const vertical = format === "9:16";
  const contentHeight = CARD_SIZE[format].height - WATERMARK_HEIGHT[format];
  const header = vertical ? 400 : 250;
  // Con menos de 10 (p. ej. los españoles), filas más altas en vez de media tarjeta vacía
  const perColumn = vertical ? Math.max(rows.length, 6) : Math.max(Math.ceil(rows.length / 2), 3);
  const rowHeight = Math.min(Math.floor((contentHeight - header - (vertical ? 60 : 50)) / perColumn), vertical ? 190 : 170);
  const columns = vertical ? [rows] : [rows.slice(0, perColumn), rows.slice(perColumn)];
  const lead = rows[0]?.team;

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{ background: `radial-gradient(ellipse at top left, ${lead?.backdrop ?? "#1e293b"}aa 0%, #020617 60%)` }}
    >
      {lead && (
        <img
          src={sameOrigin(teamLogoUrl(lead.id))}
          alt=""
          className="absolute opacity-[0.07]"
          style={vertical ? { width: 900, height: 900, right: -260, top: -200 } : { width: 900, height: 900, right: -160, top: -260 }}
        />
      )}
      <div className="relative flex flex-col" style={{ height: contentHeight }}>
        <header className={cn("shrink-0 border-b-4 border-orange-500", vertical ? "px-14 pt-24" : "px-20 pt-14")} style={{ height: header }}>
          <p className="font-display text-3xl font-semibold uppercase tracking-[0.3em] text-orange-400">
            NBA · Temporada {season}
            {modeLabel ? ` · ${modeLabel}` : ""}
          </p>
          <p className={cn("mt-2 font-display font-extrabold uppercase leading-[0.95] text-white", vertical ? "text-8xl" : "text-7xl")}>{heading}</p>
          <p className={cn("mt-3 truncate font-display font-semibold uppercase tracking-wide text-slate-300", vertical ? "text-3xl" : "text-2xl")}>{subtitle}</p>
        </header>
        <div className={cn("grid flex-1", vertical ? "grid-cols-1 px-10 pt-8" : "grid-cols-2 gap-16 px-20 pt-8")}>
          {columns.map((list, c) => (
            <ol key={c}>
              {list.map((row, i) => {
                const rank = c * perColumn + i + 1;
                return (
                  <li key={row.id} className="flex items-center gap-5 border-b border-white/10" style={{ height: rowHeight }}>
                    <span
                      className={cn("w-16 shrink-0 text-right font-display font-extrabold tabular-nums", rank === 1 ? "text-orange-400" : "text-white/40")}
                      style={{ fontSize: rowHeight * 0.45 }}
                    >
                      {rank}
                    </span>
                    <span className="w-2 shrink-0 self-stretch" style={{ background: row.team?.accent ?? "#334155", margin: `${rowHeight * 0.18}px 0` }} />
                    <span className="flex shrink-0 items-end overflow-hidden" style={{ width: rowHeight * 1.2, height: rowHeight * 0.88, background: `${row.team?.accent ?? "#334155"}33` }}>
                      <img src={sameOrigin(playerHeadshotUrl(row.id))} alt="" className="h-full w-full object-cover object-top" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display font-extrabold uppercase leading-tight text-white" style={{ fontSize: rowHeight * 0.36 }}>
                        {row.name}
                      </span>
                      <span className="mt-1 flex items-center gap-3 font-display font-semibold uppercase text-slate-300" style={{ fontSize: rowHeight * 0.22 }}>
                        {row.team && <img src={sameOrigin(teamLogoUrl(row.team.id))} alt="" style={{ width: rowHeight * 0.3, height: rowHeight * 0.3 }} />}
                        {row.team?.abbreviation ?? "Sin equipo"} · {row.games} PJ
                      </span>
                    </span>
                    <span className={cn("shrink-0 font-display font-extrabold tabular-nums", rank === 1 ? "text-orange-400" : "text-white")} style={{ fontSize: rowHeight * 0.5 }}>
                      {row.value}
                    </span>
                  </li>
                );
              })}
            </ol>
          ))}
        </div>
      </div>
    </div>
  );
}
