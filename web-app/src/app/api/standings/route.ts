// Clasificación al día (Tarea 6.6): resultados de la última jornada incluidos. Solo la pide el Nivel 3;
// el HTML de `/standings` y `/teams/[id]` lleva la de antes de la jornada (`getStandingsBefore`).
import { connection } from "next/server";
import { getTeams } from "@/lib/queries";
import { toStandingsRow } from "@/lib/standings";

export async function GET() {
  // Ruta dinámica: no se prerenderiza en el build
  await connection();

  const teams = await getTeams();
  return Response.json(
    { teams: teams.map(toStandingsRow) },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=30" } }
  );
}
