// Una temporada del explorador de jugadores (Tarea 6.22) para cambiar de temporada sin recargar la página.
// Son estadísticas de temporada (cambian una vez al día, en el job diario): sin spoilers y con caché larga.
// `/api/player-stats?temporada=2025-26`
import { connection } from "next/server";
import { getExplorerSeasons, getPlayerExplorer } from "@/lib/queries";

const CACHE_HEADERS = { "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=3600" };

export async function GET(request: Request) {
  await connection();

  const season = new URL(request.url).searchParams.get("temporada");
  try {
    const seasons = await getExplorerSeasons();
    if (!season || !seasons.includes(season)) {
      return Response.json({ error: `Parámetros: temporada=${seasons.join("|")}` }, { status: 400 });
    }
    return Response.json(await getPlayerExplorer(season), { headers: CACHE_HEADERS });
  } catch (error) {
    console.error("[api/player-stats]", error);
    return Response.json({ error: "Estadísticas no disponibles" }, { status: 502 });
  }
}
