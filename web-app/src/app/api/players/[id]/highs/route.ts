// Récords al día de un jugador (Tarea 7.6), con los de la última jornada. Solo los pide el Nivel 3; el HTML de
// `/players/[id]` lleva los de antes de esa jornada (`getPlayerHighsBefore`).
// `/api/players/1628983/highs?level=3`
import { connection } from "next/server";
import { highsNow } from "@/lib/player-highs";
import { getPlayerHighs } from "@/lib/queries";

export async function GET(request: Request, ctx: RouteContext<"/api/players/[id]/highs">) {
  // Ruta dinámica: no se prerenderiza en el build
  await connection();

  const { id } = await ctx.params;
  const playerId = Number(id);
  if (!Number.isInteger(playerId) || playerId <= 0 || new URL(request.url).searchParams.get("level") !== "3") {
    return Response.json({ error: "Parámetros: id de jugador y level=3" }, { status: 400 });
  }

  try {
    return Response.json(
      { level: 3, highs: highsNow(await getPlayerHighs(playerId)) },
      // Cambian una vez al día (job diario)
      { headers: { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" } }
    );
  } catch (error) {
    console.error("[api/players/id/highs]", error);
    return Response.json({ error: "Récords no disponibles" }, { status: 502 });
  }
}
