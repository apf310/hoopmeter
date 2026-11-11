"use client";

import type { ReactElement } from "react";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar as RadarShape, RadarChart, ResponsiveContainer } from "recharts";
import type { Radar } from "@/lib/compare";
import { RADAR_LABEL } from "@/lib/player-profile";
import { RADAR_CATEGORIES } from "@/lib/supabase";

type AngleTickProps = {
  x?: number | string;
  y?: number | string;
  textAnchor?: "start" | "middle" | "end" | "inherit";
  index?: number;
  payload?: { value: string };
};

// Fuente explícita: la captura de la tarjeta no conserva las clases CSS dentro del SVG
const DISPLAY_FONT = "var(--font-barlow-condensed), sans-serif";

/**
 * Radares superpuestos de dos jugadores. Con `size` se dibuja a tamaño fijo y sin animación, como
 * necesita la tarjeta exportada: más ancho que alto, para que quepan las etiquetas de los lados.
 * El segundo va discontinuo para distinguirlos también sin color.
 */
export function DuelRadar({ a, b, colors, size }: { a: Radar; b: Radar; colors: [string, string]; size?: { width: number; height: number } }) {
  const data = RADAR_CATEGORIES.map((category) => ({ label: RADAR_LABEL[category], a: a[category] ?? 0, b: b[category] ?? 0 }));
  const fontSize = size ? Math.round(size.height / 20) : 12;

  const renderTick = ({ x, y, textAnchor, index = 1, payload }: AngleTickProps) => {
    if (!payload) return <g />;
    // Eje superior por encima del vértice, inferior por debajo y laterales centrados
    const offset = index === 0 ? -fontSize : index === 3 ? fontSize * 1.4 : fontSize * 0.3;
    return (
      <text x={x} y={Number(y) + offset} textAnchor={textAnchor} fontFamily={DISPLAY_FONT} fontSize={fontSize} fontWeight={600} letterSpacing="0.1em" fill="#cbd5e1">
        {payload.value.toUpperCase()}
      </text>
    );
  };

  const animated = size === undefined;
  const chart = (props: { width?: number; height?: number }): ReactElement => (
    <RadarChart {...props} data={data} outerRadius={size ? "88%" : "76%"} margin={size ? { top: fontSize * 2, right: 0, bottom: fontSize * 2, left: 0 } : { top: 24, right: 48, bottom: 24, left: 48 }}>
      <PolarGrid stroke="#334155" strokeOpacity={0.8} />
      <PolarAngleAxis dataKey="label" tick={renderTick} />
      <PolarRadiusAxis domain={[0, 99]} tick={false} axisLine={false} tickCount={5} />
      <RadarShape dataKey="a" stroke={colors[0]} strokeWidth={size ? 4 : 2.5} fill={colors[0]} fillOpacity={0.28} dot={{ r: size ? 5 : 3, fill: colors[0], strokeWidth: 0 }} isAnimationActive={animated} />
      <RadarShape dataKey="b" stroke={colors[1]} strokeWidth={size ? 4 : 2.5} strokeDasharray={size ? "12 7" : "7 4"} fill={colors[1]} fillOpacity={0.28} dot={{ r: size ? 5 : 3, fill: colors[1], strokeWidth: 0 }} isAnimationActive={animated} />
    </RadarChart>
  );

  if (size) return chart(size);
  return (
    <div className="h-[300px] w-full sm:h-[380px]" role="img" aria-label={data.map((d) => `${d.label}: ${d.a} contra ${d.b}`).join(", ")}>
      <ResponsiveContainer width="100%" height="100%">
        {chart({})}
      </ResponsiveContainer>
    </div>
  );
}
