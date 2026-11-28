// El "par" de los retos de un día (Tarea 8.1, ELO): lo que sacó la mitad de la gente en cada uno, de 0 a 1, ya
// acercado a lo de siempre si aún hay pocas partidas (`parOf`). La app lo apunta con cada resultado para calcular el
// ELO: un día difícil para todos no castiga.
//   GET ?day=YYYY-MM-DD → {day, par: {"mas-o-menos": 0.58, adivina: 0.61, carrera: 0.4}}
// Solo totales del día (cuántas partidas acabadas y su mediana): nada de nadie. Sin la clave del GM (en local), lo de
// siempre; si Supabase falla, 503 y la app lo vuelve a pedir más tarde.
import { connection } from "next/server";
import { cdnHeaders } from "@/lib/cache-window";
import { parOf } from "@/lib/elo";
import { callGameDb, gameSecret } from "@/lib/game-runs";
import { CHALLENGES, type ChallengeId } from "@/lib/games";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** Lo que la CDN guarda el par: cambia a medida que acaban partidas. */
const CACHE_S = 60;

type Stats = { n?: unknown; median?: unknown };

export async function GET(request: Request) {
  await connection();
  const day = new URL(request.url).searchParams.get("day");
  if (!day || !DAY.test(day)) return Response.json({ error: "Día no válido" }, { status: 400, headers: { "Cache-Control": "no-store" } });

  const key = gameSecret();
  let stats: Record<string, Stats> = {};
  if (key) {
    try {
      stats = ((await callGameDb("game_day_par", { p_secret: key, p_day: day })) ?? {}) as Record<string, Stats>;
    } catch (error) {
      console.error("[api/juegos/par]", error instanceof Error ? error.message : error);
      return Response.json({ error: "No disponible ahora mismo." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
  }
  const par = Object.fromEntries(
    CHALLENGES.map((c) => {
      const s = stats[c.id];
      const n = typeof s?.n === "number" ? s.n : 0;
      const median = typeof s?.median === "number" ? s.median : 0;
      return [c.id, parOf(c.id as ChallengeId, { n, median })];
    })
  );
  return Response.json({ day, par }, { headers: cdnHeaders({ fresh: CACHE_S, expire: CACHE_S }) });
}
