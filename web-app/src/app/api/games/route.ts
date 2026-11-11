// Nota (Nivel 2) o resultados (Nivel 3) de una jornada, filtrados con `redactGame` en el servidor:
// el cliente nunca recibe más de lo que su nivel permite. El Nivel 1 no usa esta ruta (va en la página).
// `?date=2026-11-04&level=2`
import { connection } from "next/server";
import { isGameDay } from "@/lib/game-day";
import { getGamesByDay } from "@/lib/queries";
import { isSpoilerLevel, redactGame } from "@/lib/spoilers";

const CACHE_HEADERS = { "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=30" };

export async function GET(request: Request) {
  await connection();

  const params = new URL(request.url).searchParams;
  const day = params.get("date");
  const level = Number(params.get("level"));
  if (!isGameDay(day) || !isSpoilerLevel(level) || level === 1) {
    return Response.json({ error: "Parámetros: date=YYYY-MM-DD y level=2|3" }, { status: 400 });
  }

  let games;
  try {
    games = await getGamesByDay(day);
  } catch (error) {
    console.error("[api/games]", error);
    return Response.json({ error: "Jornada no disponible" }, { status: 502 });
  }

  return Response.json({ day, level, games: games.map((game) => redactGame(game, level)) }, { headers: CACHE_HEADERS });
}
