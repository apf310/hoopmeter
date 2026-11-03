"use client";

import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from "recharts";
import { RADAR_LABEL, tierOf } from "@/lib/player-profile";
import { RADAR_CATEGORIES, type RadarAttributes } from "@/lib/supabase";

const LEAGUE_AVERAGE = 50;

type AngleTickProps = {
  x?: number | string;
  y?: number | string;
  textAnchor?: "start" | "middle" | "end" | "inherit";
  index?: number;
  payload?: { value: string };
};

// Desplazamiento vertical de la etiqueta según el eje: el superior (0) va por encima
// del vértice, el inferior (3) por debajo y los laterales centrados.
const LABEL_OFFSET: Record<number, number> = { 0: -32, 3: 16 };

/** Radar de 6 atributos (percentiles 0-99) en el color del equipo, con la media de la liga de referencia. */
export function PlayerRadarChart({ radar, accent }: { radar: RadarAttributes; accent: string }) {
  const data = RADAR_CATEGORIES.map((c) => ({ key: c, label: RADAR_LABEL[c], value: radar[c], league: LEAGUE_AVERAGE }));
  const valueByLabel = new Map(data.map((d) => [d.label, d.value]));

  // Etiqueta de cada eje: nombre del atributo + percentil en el color de su nivel
  const renderTick = ({ x, y, textAnchor, index = 1, payload }: AngleTickProps) => {
    if (!payload) return <g />;
    const value = valueByLabel.get(payload.value) ?? 0;
    return (
      <text x={x} y={Number(y) + (LABEL_OFFSET[index] ?? -6)} textAnchor={textAnchor} className="font-display uppercase">
        <tspan x={x} fontSize={12} fontWeight={600} letterSpacing="0.12em" fill="#cbd5e1">
          {payload.value}
        </tspan>
        <tspan x={x} dy={22} fontSize={22} fontWeight={800} fill={tierOf(value).color}>
          {value}
        </tspan>
      </text>
    );
  };

  return (
    <figure>
      <div className="h-[320px] w-full sm:h-[360px]" role="img" aria-label={data.map((d) => `${d.label} ${d.value}`).join(", ")}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="66%" margin={{ top: 40, right: 48, bottom: 40, left: 48 }}>
            <PolarGrid stroke="#334155" strokeOpacity={0.7} />
            <PolarAngleAxis dataKey="label" tick={renderTick} />
            <PolarRadiusAxis domain={[0, 99]} tick={false} axisLine={false} tickCount={5} />
            <Radar dataKey="league" stroke="#94a3b8" strokeDasharray="4 4" strokeWidth={1.5} fill="none" isAnimationActive={false} />
            <Radar dataKey="value" stroke={accent} strokeWidth={2.5} fill={accent} fillOpacity={0.35} dot={{ r: 3.5, fill: accent, strokeWidth: 0 }} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-1 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-slate-400">
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-4" style={{ background: accent }} aria-hidden />
          Jugador
        </span>
        <span className="flex items-center gap-2">
          <span className="w-4 border-t-2 border-dashed border-slate-400" aria-hidden />
          Media de la liga
        </span>
      </figcaption>
    </figure>
  );
}
