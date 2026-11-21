// URLs del CDN oficial de la NBA (fotos y logos).

const CDN_ORIGIN = "https://cdn.nba.com";

/** Ids de las 30 franquicias actuales: sus escudos están en `public/logos/` (`npm run logos`). */
const FIRST_TEAM_ID = 1610612737;
const LAST_TEAM_ID = 1610612766;

export function teamLogoUrl(teamId: number): string {
  // Desde la propia web (Tarea 6.17): sin depender de cdn.nba.com ni de /api/cdn, y ya del mismo origen
  // para exportar tarjetas. Un id histórico que no esté entre los 30 sigue saliendo de la CDN.
  if (Number.isInteger(teamId) && teamId >= FIRST_TEAM_ID && teamId <= LAST_TEAM_ID) return `/logos/${teamId}.svg`;
  // Versión para fondo oscuro (D): toda la app es oscura y con la clara (L) los logos negros no se ven
  return `${CDN_ORIGIN}/logos/nba/${teamId}/global/D/logo.svg`;
}

export function playerHeadshotUrl(playerId: number): string {
  // Tamaño mayor: el loader de `next/image` (`lib/image-loader.ts`) lo baja al que haga falta
  return `${CDN_ORIGIN}/headshots/nba/latest/1040x760/${playerId}.png`;
}

/** Misma imagen servida por `/api/cdn` (mismo origen), necesaria para exportar tarjetas a PNG. */
export function sameOrigin(cdnUrl: string): string {
  return cdnUrl.replace(CDN_ORIGIN, "/api/cdn");
}
