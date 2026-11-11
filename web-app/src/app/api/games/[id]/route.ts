// Ficha completa de un partido (Nivel 3: boxscore, tiros, flujo del marcador y jugada a jugada).
// Caché compartida en el servidor (`getGameDetail`) y en la CDN: 30 s en directo, 1 h ya terminado.
// `{ detail: null }` = el partido aún no ha empezado.
import { connection } from "next/server";
import { getGameDetail } from "@/lib/game-detail";
import { isGameId } from "@/lib/game-day";

const LIVE_CACHE = { "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=30" };
const FINAL_CACHE = { "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" };

export async function GET(_request: Request, ctx: RouteContext<"/api/games/[id]">) {
  await connection();

  const { id } = await ctx.params;
  if (!isGameId(id)) return Response.json({ error: "ID de partido no válido" }, { status: 400 });

  let detail;
  try {
    detail = await getGameDetail(id);
  } catch (error) {
    console.error("[api/games/id]", error);
    return Response.json({ error: "Estadísticas del partido no disponibles" }, { status: 502 });
  }

  return Response.json({ detail }, { headers: detail?.status === "Final" ? FINAL_CACHE : LIVE_CACHE });
}
