// URLs del CDN oficial de la NBA (fotos y logos).

const CDN_ORIGIN = "https://cdn.nba.com";

export function teamLogoUrl(teamId: number): string {
  // Versión para fondo oscuro (D): toda la app es oscura y con la clara (L) los logos negros no se ven
  return `${CDN_ORIGIN}/logos/nba/${teamId}/global/D/logo.svg`;
}

export function playerHeadshotUrl(playerId: number): string {
  return `${CDN_ORIGIN}/headshots/nba/latest/1040x760/${playerId}.png`;
}

/** Misma imagen servida por `/api/cdn` (mismo origen), necesaria para exportar tarjetas a PNG. */
export function sameOrigin(cdnUrl: string): string {
  return cdnUrl.replace(CDN_ORIGIN, "/api/cdn");
}
