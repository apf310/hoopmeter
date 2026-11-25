// sitemap.xml (Tareas 6.25 y 7.8): páginas fijas, los 30 equipos, todos los jugadores (leyendas incluidas)
// y los partidos de la temporada más reciente del calendario. Solo ids, nombres y fechas del calendario y del
// job diario: nada que dependa de resultados (ver `buildSitemap`).
import type { MetadataRoute } from "next";
import { cacheLife } from "next/cache";
import { seasonOf } from "@/lib/game-day";
import { LEGAL_UPDATED } from "@/lib/legal";
import { getDailyUpdate, getSchedule, getSearchIndex } from "@/lib/queries";
import { buildSitemap } from "@/lib/seo";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  "use cache";
  // Si se queda atrás, a algún partido le falta su fecha hasta la siguiente vez: nunca enseña una de más
  cacheLife("hours");

  const [index, schedule, daily] = await Promise.all([getSearchIndex(), getSchedule(), getDailyUpdate()]);
  const last = schedule.at(-1);
  const season = last ? seasonOf(last.game_datetime_utc) : null;
  const games = season ? schedule.filter((g) => seasonOf(g.game_datetime_utc) === season) : [];
  return buildSitemap({ teams: index.teams, players: index.players, games }, { now: Date.now(), daily, legal: LEGAL_UPDATED });
}
