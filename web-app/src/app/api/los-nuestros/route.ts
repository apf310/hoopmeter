// "Los nuestros" (Tarea 6.12): línea de cada español en su partido de la jornada. Solo Nivel 3: minutos,
// puntos o un "No jugó" destripan el partido. Sale del boxscore de la CDN ya cacheado para la ficha del
// partido (`getGameDetail`). Quién juega y contra quién va en el HTML (`getSpanishPlayers` + calendario).
// `/api/los-nuestros?date=2026-11-18&level=3`
import { connection } from "next/server";
import { isGameDay } from "@/lib/game-day";
import { getGameDetail } from "@/lib/game-detail";
import { playerGameLine } from "@/lib/game-format";
import type { PlayerGameLine } from "@/lib/game-day-store";
import { getGamesByDay, getSpanishPlayers } from "@/lib/queries";
import { spanishPlayersOfDay, type SpanishLinesPayload } from "@/lib/spanish-players";

const CACHE_HEADERS = { "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=30" };

export async function GET(request: Request) {
  await connection();

  const params = new URL(request.url).searchParams;
  const day = params.get("date");
  if (!isGameDay(day) || params.get("level") !== "3") {
    return Response.json({ error: "Parámetros: date=YYYY-MM-DD y level=3" }, { status: 400 });
  }

  const lines: Record<string, PlayerGameLine | null> = {};
  try {
    const [players, games] = await Promise.all([getSpanishPlayers(), getGamesByDay(day)]);
    // Sin empezar: sin boxscore que leer (y sin línea)
    const started = spanishPlayersOfDay(players, games).filter(({ game }) => game.status !== "Scheduled");
    const details = await Promise.all(started.map(({ game }) => getGameDetail(game.id)));
    details.forEach((detail, i) => {
      // Sin boxscore aún (acaba de empezar): se pide en el siguiente refresco
      if (detail) lines[started[i].player.id] = playerGameLine(detail, started[i].player.id);
    });
  } catch (error) {
    console.error("[api/los-nuestros]", error);
    return Response.json({ error: "Estadísticas no disponibles" }, { status: 502 });
  }

  const payload: SpanishLinesPayload = { day, level: 3, lines };
  return Response.json(payload, { headers: CACHE_HEADERS });
}
