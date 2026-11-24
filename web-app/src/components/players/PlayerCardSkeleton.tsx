"use client";

import Image from "next/image";
import { SharedLanding, useSharedNav } from "@/components/layout/SharedLink";
import { playerHeadshotUrl } from "@/lib/nba-cdn";
import { sharedTarget } from "@/lib/shared-nav";
import "./player-card.css";

/** Foto del jugador que se acaba de tocar, en el sitio de su ficha mientras llega el resto (Tarea 7.4). */
export function PlayerCardSkeleton({ className }: { className: string }) {
  const { target: href } = useSharedNav();
  const target = href ? sharedTarget(href) : null;
  const card = (
    <div className={className}>
      <div className="hc hc-bare w-full">
        <div className="hc-card hc-blank">
          {target?.kind === "player" && (
            <div className="hc-photo">
              <Image src={playerHeadshotUrl(target.id)} alt="" width={400} height={292} draggable={false} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
  return target?.kind === "player" ? <SharedLanding target={target}>{card}</SharedLanding> : card;
}
