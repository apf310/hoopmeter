// Marcadores en directo y cuarto a cuarto. La respuesta de la NBA se cachea 30 s
// en el servidor (`getLiveScoreboard`) y en la CDN (`s-maxage`), compartida por todos.
// Opcional: `?gameId=0022500123` devuelve solo ese partido.
import { connection } from "next/server";
import { getLiveScoreboard } from "@/lib/live";

const CACHE_HEADERS = { "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=30" };

export async function GET(request: Request) {
  // Ruta dinámica: no se prerenderiza en el build (un fallo ahí dejaría la respuesta congelada)
  await connection();

  let scoreboard;
  try {
    scoreboard = await getLiveScoreboard();
  } catch (error) {
    console.error("[api/live]", error);
    return Response.json({ error: "Marcador de la NBA no disponible" }, { status: 502 });
  }

  const gameId = new URL(request.url).searchParams.get("gameId");
  if (!gameId) return Response.json(scoreboard, { headers: CACHE_HEADERS });

  const game = scoreboard.games.find((g) => g.id === gameId);
  if (!game) return Response.json({ error: "Partido no encontrado hoy" }, { status: 404 });
  return Response.json({ ...game, fetchedAt: scoreboard.fetchedAt }, { headers: CACHE_HEADERS });
}
