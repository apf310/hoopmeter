// Calendario completo de la temporada sin spoilers (emparejamiento y fecha) en formato compacto:
// se descarga una vez por sesión y moverse entre jornadas es instantáneo, sin esperar a la red.
import { toScheduleTuple } from "@/lib/game-day";
import { getSchedule } from "@/lib/queries";

export async function GET() {
  const games = await getSchedule();
  return Response.json(
    { games: games.map(toScheduleTuple) },
    { headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400" } }
  );
}
