"use client";

import { useEffect, useMemo } from "react";
import { FROM_NOTIFICATION_PARAM, resetSpoilerLevel } from "@/context/SpoilerContext";
import { useFavorites } from "@/lib/favorites-store";
import { onNativePushOpened } from "@/lib/native";
import { pushTeamIds } from "@/lib/push";
import { refreshPush, usePushState } from "@/lib/push-store";

/** Espera tras abrir: al hidratar los favoritos aún son los del servidor (vacíos) y no hay prisa. */
const REFRESH_DELAY_MS = 2000;

/**
 * Aviso matinal (Tarea 6.14), en todas las páginas:
 * - con el aviso activado, mantiene al día la suscripción y los favoritos que nombra el aviso;
 * - en la app nativa, tocar un aviso vuelve SIEMPRE al Nivel 1 y abre la portada, aunque la app
 *   estuviera en segundo plano menos de 15 minutos y en otro nivel.
 */
export function PushSync() {
  const favorites = useFavorites();
  const { enabled } = usePushState();
  const teamIds = useMemo(() => pushTeamIds(favorites), [favorites]);

  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => void refreshPush(teamIds), REFRESH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [enabled, teamIds]);

  useEffect(
    () =>
      onNativePushOpened(() => {
        resetSpoilerLevel();
        // Carga completa a propósito (no router.push): la portada se pinta de cero en Nivel 1
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign(`/?${FROM_NOTIFICATION_PARAM}=1`);
      }),
    []
  );

  return null;
}
