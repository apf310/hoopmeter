// Una temporada entera del explorador de jugadores (Tarea 6.22): al abrir /players (en el HTML solo va la primera tanda,
// Tarea 7.7) y al cambiar de temporada. Son estadísticas de temporada (cambian una vez al día, en el job diario): sin
// spoilers, y la CDN las guarda hasta el próximo job.
// `/api/player-stats?temporada=2025-26`
import { connection } from "next/server";
import { cdnHeaders, dailyWindow } from "@/lib/cache-window";
import { getExplorerSeasons, getPlayerExplorer } from "@/lib/queries";

export async function GET(request: Request) {
  await connection();

  const season = new URL(request.url).searchParams.get("temporada");
  try {
    const seasons = await getExplorerSeasons();
    if (!season || !seasons.includes(season)) {
      return Response.json({ error: `Parámetros: temporada=${seasons.join("|")}` }, { status: 400 });
    }
    return Response.json(await getPlayerExplorer(season), { headers: cdnHeaders(dailyWindow(Date.now()), 300) });
  } catch (error) {
    console.error("[api/player-stats]", error);
    return Response.json({ error: "Estadísticas no disponibles" }, { status: 502 });
  }
}
