// Notas de los partidos terminados de la temporada para "Qué ver" (Tarea 6.11). Es Nivel 2 y nada más:
// emparejamiento, fecha y nota, también para quien está en Nivel 3 (esta pantalla nunca da resultados).
// El Nivel 1 no la pide: el orden por nota ya sería un spoiler.
// `/api/what-to-watch?level=2`
import { connection } from "next/server";
import { cdnHeaders, scoresWindow } from "@/lib/cache-window";
import { getPendingGames, getScoredGames } from "@/lib/queries";
import type { GameLevel2 } from "@/lib/spoilers";

export async function GET(request: Request) {
  await connection();

  if (new URL(request.url).searchParams.get("level") !== "2") {
    return Response.json({ error: "Parámetros: level=2" }, { status: 400 });
  }

  let games, pending;
  try {
    [games, pending] = await Promise.all([getScoredGames(), getPendingGames()]);
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
  // La CDN lo guarda hasta que pueda haber una nota nueva (Tarea 7.7): con un partido en juego, un minuto
  return Response.json({ level: 2, games: level2 }, { headers: cdnHeaders(scoresWindow(pending, Date.now())) });
}
