// Modo diferido (Tarea 6.13): la ficha del partido rehecha solo hasta `?p=3&s=360` (3.er cuarto,
// 6:00 por jugar). Nada posterior sale de aquí, tampoco el estado final ni la nota: se puede pedir
// en cualquier nivel de spoilers. Misma caché para todos los partidos (las cabeceras tampoco dicen
// si ya terminó). `{ detail: null }` = aún no ha empezado.
import { connection } from "next/server";
import { parsePosition } from "@/lib/deferred-position";
import { getDeferredDetail } from "@/lib/game-detail";
import { isGameId } from "@/lib/game-day";
import { getGameMatchup } from "@/lib/queries";

const CACHE = { "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=300" };

export async function GET(request: Request, ctx: RouteContext<"/api/games/[id]/diferido">) {
  await connection();

  const { id } = await ctx.params;
  if (!isGameId(id)) return Response.json({ error: "ID de partido no válido" }, { status: 400 });
  const { searchParams } = new URL(request.url);
  const position = parsePosition(searchParams.get("p"), searchParams.get("s"));
  if (!position) return Response.json({ error: "Posición no válida" }, { status: 400 });
  // Solo partidos de nuestro calendario: un id inventado no debe hacer que preguntemos a la NBA
  if (!(await getGameMatchup(id))) {
    return Response.json({ error: "Partido no encontrado" }, { status: 404 });
  }

  let detail;
  try {
    detail = await getDeferredDetail(id, position);
  } catch (error) {
    console.error("[api/games/id/diferido]", error);
    return Response.json({ error: "Estadísticas del partido no disponibles" }, { status: 502 });
  }

  return Response.json({ detail }, { headers: CACHE });
}
