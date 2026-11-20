// Notas de los partidos terminados de la temporada para "Qué ver" (Tarea 6.11). Es Nivel 2 y nada más:
// emparejamiento, fecha y nota, también para quien está en Nivel 3 (esta pantalla nunca da resultados).
// El Nivel 1 no la pide: el orden por nota ya sería un spoiler.
// `/api/what-to-watch?level=2`
import { connection } from "next/server";
import { getScoredGames } from "@/lib/queries";
import type { GameLevel2 } from "@/lib/spoilers";

const CACHE_HEADERS = { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=60" };

export async function GET(request: Request) {
  await connection();

  if (new URL(request.url).searchParams.get("level") !== "2") {
    return Response.json({ error: "Parámetros: level=2" }, { status: 400 });
  }

  let games;
  try {
    games = await getScoredGames();
  } catch (error) {
    console.error("[api/what-to-watch]", error);
    return Response.json({ error: "Notas no disponibles" }, { status: 502 });
  }

  // Lista blanca explícita, como `redactGame(game, 2)`: ningún campo extra llega al cliente
  const level2: GameLevel2[] = games.map((game) => ({
    level: 2,
    id: game.id,
    game_datetime_utc: game.game_datetime_utc,
    home_team_id: game.home_team_id,
    away_team_id: game.away_team_id,
    excitement_score: game.excitement_score,
  }));
  return Response.json({ level: 2, games: level2 }, { headers: CACHE_HEADERS });
}
