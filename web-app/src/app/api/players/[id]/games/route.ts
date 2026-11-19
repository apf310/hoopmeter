// Línea del jugador en los últimos partidos de su equipo (Tarea 6.8). Solo Nivel 3: minutos, puntos, rebotes…
// destripan el partido. Sale del boxscore de la CDN ya cacheado para la ficha del partido (`getGameDetail`).
// Nota y resultado de esos partidos, por `/api/teams/[id]/games` como en la ficha de equipo.
// `/api/players/1628983/games?level=3`
import { connection } from "next/server";
import { getGameDetail } from "@/lib/game-detail";
import type { PlayerGameLine } from "@/lib/game-day-store";
import { getPlayer, getRecentGames } from "@/lib/queries";

const CACHE_HEADERS = { "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=30" };

export async function GET(request: Request, ctx: RouteContext<"/api/players/[id]/games">) {
  await connection();

  const { id } = await ctx.params;
  const playerId = Number(id);
  if (!Number.isInteger(playerId) || new URL(request.url).searchParams.get("level") !== "3") {
    return Response.json({ error: "Parámetros: id de jugador y level=3" }, { status: 400 });
  }

  const lines: Record<string, PlayerGameLine | null> = {};
  try {
    const player = await getPlayer(playerId);
    if (!player?.team_id) return Response.json({ error: "Jugador sin equipo" }, { status: 404 });

    const games = (await getRecentGames(player.team_id)).filter((game) => game.status !== "Scheduled");
    const details = await Promise.all(games.map((game) => getGameDetail(game.id)));
    details.forEach((detail, i) => {
      // Sin boxscore aún (acaba de empezar): sin línea, se pide en el siguiente refresco
      if (!detail) return;
      const line = [...detail.home.players, ...detail.away.players].find((p) => p.id === playerId);
      lines[games[i].id] = line
        ? {
            played: line.played,
            absence: line.absence,
            seconds: line.seconds,
            pts: line.pts,
            reb: line.reb,
            ast: line.ast,
            stl: line.stl,
            blk: line.blk,
            fgm: line.fgm,
            fga: line.fga,
            fg3m: line.fg3m,
            fg3a: line.fg3a,
            plusMinus: line.plusMinus,
          }
        : null;
    });
  } catch (error) {
    console.error("[api/players/id/games]", error);
    return Response.json({ error: "Estadísticas no disponibles" }, { status: 502 });
  }

  return Response.json({ level: 3, lines }, { headers: CACHE_HEADERS });
}
