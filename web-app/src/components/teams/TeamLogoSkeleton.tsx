"use client";

import Image from "next/image";
import { SharedLanding, useSharedNav } from "@/components/layout/SharedLink";
import { teamLogoUrl } from "@/lib/nba-cdn";
import { sharedTarget } from "@/lib/shared-nav";

/** Escudo del equipo que se acaba de tocar, ya en su sitio mientras llega la ficha (Tarea 7.4). */
export function TeamLogoSkeleton() {
  const { target: href } = useSharedNav();
  const target = href ? sharedTarget(href) : null;
  if (target?.kind !== "team") return null;
  return (
    <SharedLanding target={target}>
      <Image src={teamLogoUrl(target.id)} alt="" width={112} height={112} unoptimized className="size-20 drop-shadow-lg md:size-28" />
    </SharedLanding>
  );
}
