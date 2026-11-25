"use client";

import { useEffect } from "react";
import { BeforeDayNote } from "@/components/standings/LevelStandings";
import { onLevelIntent, useSpoilerLevel } from "@/context/SpoilerContext";
import { loadPlayerHighs, usePlayerHighs } from "@/lib/game-day-store";
import type { PlayerHighs } from "@/lib/player-highs";
import { CareerHighs } from "./CareerHighs";

const HEADING = "font-display text-lg font-bold uppercase tracking-wide text-slate-300";

/**
 * Récords personales y máximos de la temporada (Tarea 7.6): cada uno lleva su fecha y su rival, así que en los
 * Niveles 1 y 2 son los de antes de la última jornada empezada (vienen en el HTML) y en el Nivel 3, al día. El
 * aviso sale siempre, haya o no récord esa noche: si solo saliera cuando lo hay, lo delataría.
 */
export function LevelHighs({
  playerId,
  active,
  before,
  day,
}: {
  playerId: number;
  /** De un retirado, solo los de su carrera: no hay jornada que tapar. */
  active: boolean;
  before: PlayerHighs;
  day: string | null;
}) {
  const level = useSpoilerLevel();
  const now = usePlayerHighs(level, playerId);

  useEffect(() => {
    if (active && level === 3) void loadPlayerHighs(playerId);
  }, [active, level, playerId]);
  useEffect(
    () =>
      onLevelIntent((target) => {
        if (active && target === 3) void loadPlayerHighs(playerId);
      }),
    [active, playerId]
  );

  const fresh = active && level === 3 ? now?.data?.highs : undefined;
  const { career, season } = fresh ?? before;
  const loading = level === 3 && fresh === undefined && !now?.error;

  return (
    <>
      <div className="pb-3 pt-8">
        <h3 className={HEADING}>Récords personales en un partido</h3>
        {active && (
          <BeforeDayNote
            standings={{ level, current: fresh !== undefined, loading, teams: before }}
            day={day}
            subject="los"
            className="mt-1"
          />
        )}
      </div>
      <CareerHighs highs={career} />
      {active && season && (
        <>
          <h3 className={`${HEADING} pb-3 pt-8`}>Máximos de la temporada {season.id}</h3>
          <CareerHighs highs={season.highs} />
        </>
      )}
    </>
  );
}
