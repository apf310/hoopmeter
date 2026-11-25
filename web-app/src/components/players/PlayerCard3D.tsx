import type { CSSProperties } from "react";
import Image from "next/image";
import { PlayerPhoto } from "@/components/players/PlayerPhoto";
import { TiltSurface } from "@/components/players/TiltSurface";
import { teamLogoUrl } from "@/lib/nba-cdn";
import { splitName, surnameSize, type CardTier } from "@/lib/player-card";
import { teamAccent, teamBackdrop } from "@/lib/team-colors";
import type { Team } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import "./player-card.css";

export type CardTeam = Pick<Team, "id" | "primary_color" | "secondary_color">;

/** Capas de brillo de cada material: patrón (`public/cards/`, npm run cards) y cómo se mueve su luz (a, b o c). */
const LAYERS: Record<CardTier, [pattern: string, motion: "a" | "b" | "c"][]> = {
  legend: [
    ["guilloche-a", "a"],
    ["guilloche-b", "b"],
  ],
  elite: [
    ["rays-a", "a"],
    ["rays-b", "b"],
    ["rays-c", "c"],
    ["net", "b"],
    ["sparks", "a"],
  ],
  great: [
    ["waves-a", "a"],
    ["waves-b", "b"],
  ],
  good: [
    ["facets-a", "a"],
    ["facets-b", "b"],
    ["facets-c", "c"],
  ],
  base: [],
};

const LONG_LINE = 18; // Con una línea más larga, la posición no cabe al lado

type PlayerCard3DProps = {
  id: number;
  name: string;
  tier: CardTier;
  team?: CardTeam | null;
  overall?: number | null;
  /** Arquetipo o, en las leyendas, su palmarés. */
  line?: string;
  position?: string | null;
  /** Aclaración de la media (al pasar el ratón). */
  note?: string;
  /** Sin el nombre: en la ficha de jugador ya va debajo, en grande. */
  bare?: boolean;
  priority?: boolean;
  greet?: boolean;
  className?: string;
};

/**
 * Ficha coleccionable del jugador (Tarea 7.4): se inclina en 3D y su material depende de la media. Es solo
 * decorativa: quien la usa pone el nombre y la media en texto. Diseño propio: sin marcas de cromos.
 */
export function PlayerCard3D({ id, name, tier, team, overall, line, position, note, bare, priority, greet, className }: PlayerCard3DProps) {
  const { first, last } = splitName(name);
  const primary = teamBackdrop(team?.primary_color);
  const vars = {
    "--tm1": primary,
    "--tm3": team ? teamAccent(team) : "#f97316",
    "--lf": `${surnameSize(last, tier)}cqw`,
  } as CSSProperties;

  return (
    <TiltSurface className={cn(bare && "hc-bare", className)} style={vars} greet={greet}>
      <div className={`hc-card hc-${tier}`} aria-hidden title={note}>
        <div className="hc-frame">
          <div className="hc-gap">
            <div className="hc-rim">
              <div className="hc-art">
                {tier === "base" && <div className="hc-paint" />}
                {tier === "base" && <div className="hc-varnish" />}
                {team && tier !== "base" && (
                  <Image src={teamLogoUrl(team.id)} alt="" width={240} height={240} unoptimized className="hc-mark" draggable={false} />
                )}
                {LAYERS[tier].map(([pattern, motion]) => (
                  <div key={pattern} className={`hc-fx hc-fx-${motion} hc-${pattern}`} style={{ "--m": `url(/cards/${pattern}.svg)` } as CSSProperties} />
                ))}
                <div className="hc-vignette" />
              </div>
            </div>
          </div>
        </div>
        <div className="hc-photo">
          <PlayerPhoto id={id} width={bare ? 400 : 260} height={bare ? 292 : 190} priority={priority} draggable={false} />
        </div>
        <div className="hc-plate">
          {tier === "base" && <span className="hc-strip" />}
          <span className="hc-first">
            <i>{first}</i>
          </span>
          <span className="hc-banner" />
          <span className="hc-last">{last}</span>
          {line && <span className="hc-line">{line}</span>}
          {position && (line?.length ?? 0) < LONG_LINE && <span className="hc-pos">{position}</span>}
        </div>
        {tier === "legend" && (
          <div className="hc-badge">
            <small>Leyenda</small>
          </div>
        )}
        {overall != null && (
          <div className="hc-badge">
            <b>{overall}</b>
            <small>Media</small>
          </div>
        )}
        {team && tier !== "legend" && (
          <div className="hc-team">
            <Image src={teamLogoUrl(team.id)} alt="" width={48} height={48} unoptimized draggable={false} />
          </div>
        )}
        <div className="hc-glare" />
      </div>
    </TiltSurface>
  );
}
