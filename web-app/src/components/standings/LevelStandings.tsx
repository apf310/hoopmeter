"use client";

import { useEffect } from "react";
import { EyeOff } from "lucide-react";
import { onLevelIntent, useSpoilerLevel } from "@/context/SpoilerContext";
import { formatShortDay } from "@/lib/game-day";
import { loadStandings, useStandingsNow } from "@/lib/game-day-store";
import type { SpoilerLevel } from "@/lib/spoilers";
import { standingsDiffer, type StandingsBefore, type StandingsRow } from "@/lib/standings";
import { cn } from "@/lib/utils";

export type LevelStandings = {
  level: SpoilerLevel;
  /** Null: en este nivel no se puede enseñar ninguna (ver `StandingsBefore`). */
  teams: StandingsRow[] | null;
  /** Al día (Nivel 3 ya descargada). */
  current: boolean;
  /** Nivel 3 esperando a `/api/standings`: entretanto se ve la de antes. */
  loading: boolean;
  /** Lo que se ve trae resultados de la última jornada: se avisa al compartir la imagen. */
  spoiler: boolean;
};

/**
 * Tarea 6.6: en los Niveles 1 y 2, la clasificación de antes de la última jornada empezada (viene en el HTML);
 * en el Nivel 3, la de al día. Se descarga solo en el Nivel 3, o al ir a pasar a él (sin enseñarla).
 */
export function useLevelStandings(before: StandingsBefore): LevelStandings {
  const level = useSpoilerLevel();
  const now = useStandingsNow(level);

  useEffect(() => {
    if (level === 3) void loadStandings();
  }, [level]);
  useEffect(
    () =>
      onLevelIntent((target) => {
        if (target === 3) void loadStandings();
      }),
    []
  );

  const fresh = level === 3 ? now?.data?.teams : undefined;
  return {
    level,
    teams: fresh ?? before.teams,
    current: fresh !== undefined,
    loading: level === 3 && fresh === undefined && !now?.error,
    spoiler: fresh !== undefined && standingsDiffer(before.teams, fresh),
  };
}

/** "Antes de la jornada del lun 16 · mantén pulsado Resultados para verla al día". Nada si ya está al día. */
export function BeforeDayNote({
  standings,
  day,
  subject = "la",
  className,
}: {
  standings: LevelStandings;
  day: string | null;
  /** "la" (clasificación) o "lo" (balance del equipo). */
  subject?: "la" | "lo";
  className?: string;
}) {
  if (standings.current || day === null) return null;

  const text = standings.loading
    ? "Cargando al día…"
    : standings.level === 3
      ? `Antes de la jornada del ${formatShortDay(day)} · sin conexión para cargar${subject} al día`
      : standings.teams === null
        ? `Oculto para no destripar la jornada del ${formatShortDay(day)} · mantén pulsado Resultados para ver${subject} al día`
        : `Antes de la jornada del ${formatShortDay(day)} · mantén pulsado Resultados para ver${subject} al día`;

  return (
    <p className={cn("flex items-start gap-2 text-xs text-slate-400", className)}>
      <EyeOff className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>{text}</span>
    </p>
  );
}
