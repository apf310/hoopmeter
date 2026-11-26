import type { CSSProperties } from "react";
import Image from "next/image";
import { CardHuella, type HuellaPart } from "@/components/cards/CardHuella";
import { PlayerPhoto } from "@/components/players/PlayerPhoto";
import { TiltSurface } from "@/components/players/TiltSurface";
import { teamLogoUrl } from "@/lib/nba-cdn";
import { SEAL_LABEL, splitName, surnameSize, type CardSeal, type CardTier } from "@/lib/player-card";
import { teamAccent, teamBackdrop } from "@/lib/team-colors";
import type { Team } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import "./player-card.css";

export type CardTeam = Pick<Team, "id" | "primary_color" | "secondary_color">;

type Motion = "a" | "b" | "c";

/** Patrones fijos del refractor (`public/cards/`, npm run cards): rayos y chispas, iguales en todas. */
const PATTERNS: Partial<Record<CardTier, [pattern: string, motion: Motion][]>> = {
  elite: [
    ["rays-a", "a"],
    ["rays-b", "b"],
    ["rays-c", "c"],
  ],
};

/**
 * Huella (Tarea 7.11): el dibujo de cada carta sale de sus atributos (`lib/card-huella.ts`) y su luz se mueve de dos
 * maneras (a, b o c). En el zafiro, `accent` es el relleno de las facetas y `main` sus aristas.
 */
const HUELLA: Record<CardTier, [part: HuellaPart["part"], motion: Motion][]> = {
  legend: [
    ["main", "a"],
    ["accent", "b"],
  ],
  elite: [
    ["main", "b"],
    ["accent", "a"],
  ],
  great: [
    ["main", "a"],
    ["accent", "b"],
  ],
  good: [
    ["accent", "a"],
    ["main", "b"],
  ],
  base: [],
};

const huellaParts = (tier: CardTier): HuellaPart[] =>
  tier === "base"
    ? [{ part: "main", className: "hc-paint" }]
    : HUELLA[tier].map(([part, motion]) => ({ part, className: `hc-fx hc-fx-${motion} hc-huella-${part}` }));

const LONG_LINE = 18; // Con una línea más larga, la posición no cabe al lado

type PlayerCard3DProps = {
  id: number;
  name: string;
  tier: CardTier;
  team?: CardTeam | null;
  /** Media de 40 a 99; null = aún sin partidos esta temporada ("–"); sin pasar, no hay insignia. */
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
  /** Seis valores de 0 a 1 de su huella (`lib/card-huella.ts`); null = sin atributos (cartón con la zona pintada). */
  huella?: number[] | null;
  /** Sellos (Tarea 7.11): hechos conocidos, nunca nada del último partido. */
  seals?: CardSeal[];
  /** Carta pequeña (tira de leyendas): huella más ligera y solo al acercarse. */
  mini?: boolean;
  className?: string;
};

/**
 * Ficha coleccionable del jugador (Tareas 7.4 y 7.11): se inclina en 3D, su material depende de la media y el dibujo
 * del fondo nace de sus atributos. Es solo decorativa: quien la usa pone el nombre y la media en texto. Diseño propio:
 * sin marcas de cromos, firmas ni numeración.
 */
export function PlayerCard3D({ id, name, tier, team, overall, line, position, note, bare, priority, greet, huella, seals, mini, className }: PlayerCard3DProps) {
  const { first, last } = splitName(name);
  const primary = teamBackdrop(team?.primary_color);
  const vars = {
    "--tm1": primary,
    "--tm3": team ? teamAccent(team) : "#f97316",
    "--lf": `${surnameSize(last, tier)}cqw`,
  } as CSSProperties;

  return (
    <TiltSurface className={cn(bare && "hc-bare", mini && "hc-mini", className)} style={vars} greet={greet}>
      <div className={`hc-card hc-${tier}`} aria-hidden title={note}>
        <div className="hc-frame">
          <div className="hc-gap">
            <div className="hc-rim">
              <div className="hc-art">
                {/* Cartón sin atributos (aún no ha jugado): la zona pintada de siempre */}
                {tier === "base" && !huella && <div className="hc-paint" />}
                {team && tier !== "base" && (
                  <Image src={teamLogoUrl(team.id)} alt="" width={240} height={240} unoptimized className="hc-mark" draggable={false} />
                )}
                {PATTERNS[tier]?.map(([pattern, motion]) => (
                  <div key={pattern} className={`hc-fx hc-fx-${motion} hc-${pattern}`} style={{ "--m": `url(/cards/${pattern}.svg)` } as CSSProperties} />
                ))}
                {huella && <CardHuella tier={tier} values={huella} parts={huellaParts(tier)} mini={mini} />}
                {tier === "elite" && <div className="hc-fx hc-fx-a hc-sparks" style={{ "--m": "url(/cards/sparks.svg)" } as CSSProperties} />}
                {tier === "base" && <div className="hc-varnish" />}
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
        {/* null = en activo y aún sin partidos esta temporada (Tarea 7.10): "–", nunca la del año pasado */}
        {tier !== "legend" && overall !== undefined && (
          <div className="hc-badge">
            <b>{overall ?? "–"}</b>
            <small>Media</small>
          </div>
        )}
        {team && tier !== "legend" && (
          <div className="hc-team">
            <Image src={teamLogoUrl(team.id)} alt="" width={48} height={48} unoptimized draggable={false} />
          </div>
        )}
        {seals && seals.length > 0 && (
          <div className={cn("hc-seals", !team && "hc-seals-top")} title={seals.map((s) => SEAL_LABEL[s.kind]).join(" · ")}>
            {seals.map((seal) => (
              <SealBadge key={seal.kind} seal={seal} />
            ))}
          </div>
        )}
        <div className="hc-glare" />
      </div>
    </TiltSurface>
  );
}

/** Sello en relieve: la forma dice qué es (hexágono, esmalte, anillo, rombo o estrella) y la cifra, cuántas veces. */
function SealBadge({ seal }: { seal: CardSeal }) {
  return (
    <span className={`hc-seal hc-seal-${seal.kind}`}>
      <span>
        {seal.kind === "rookie" && (
          <>
            <b>RC</b>
            <small>’{String(seal.year).slice(-2)}</small>
          </>
        )}
        {seal.kind === "mvp" && (
          <>
            <b>{seal.count}</b>
            <small>MVP</small>
          </>
        )}
        {(seal.kind === "ring" || seal.kind === "star") && <b>{seal.count}</b>}
      </span>
    </span>
  );
}
