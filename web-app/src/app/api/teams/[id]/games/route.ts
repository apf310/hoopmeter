// Últimos partidos de un equipo con nota (Nivel 2) o resultado (Nivel 3), filtrados con `redactGame` en el
// servidor (Tarea 6.7). El Nivel 1 no usa esta ruta: rival y fecha van en el HTML de `/teams/[id]`.
// `/api/teams/1610612738/games?level=2`
import { connection } from "next/server";
import { getRecentGames, getTeams } from "@/lib/queries";
import { isSpoilerLevel, redactGame } from "@/lib/spoilers";

const CACHE_HEADERS = { "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=30" };

export async function GET(request: Request, ctx: RouteContext<"/api/teams/[id]/games">) {
  await connection();

  const { id } = await ctx.params;
  const teamId = Number(id);
  const level = Number(new URL(request.url).searchParams.get("level"));
  if (!Number.isInteger(teamId) || !isSpoilerLevel(level) || level === 1) {
    return Response.json({ error: "Parámetros: id de equipo y level=2|3" }, { status: 400 });
  }

  let games;
  try {
    if (!(await getTeams()).some((team) => team.id === teamId)) {
      return Response.json({ error: "Equipo no encontrado" }, { status: 404 });
    }
    games = await getRecentGames(teamId);
  } catch (error) {
    console.error("[api/teams/id/games]", error);
    return Response.json({ error: "Partidos no disponibles" }, { status: 502 });
  }

  return Response.json({ level, games: games.map((game) => redactGame(game, level)) }, { headers: CACHE_HEADERS });
}
