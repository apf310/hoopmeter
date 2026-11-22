// sitemap.xml (Tarea 6.25): páginas fijas, los 30 equipos, todos los jugadores (leyendas incluidas)
// y los partidos de la temporada más reciente del calendario. Solo ids: nada que dependa de resultados.
import type { MetadataRoute } from "next";
import { seasonOf } from "@/lib/game-day";
import { getSchedule, getSearchIndex } from "@/lib/queries";
import { buildSitemap } from "@/lib/seo";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [index, schedule] = await Promise.all([getSearchIndex(), getSchedule()]);
  const last = schedule.at(-1);
  const season = last ? seasonOf(last.game_datetime_utc) : null;
  const games = season ? schedule.filter((g) => seasonOf(g.game_datetime_utc) === season) : [];
  return buildSitemap(
    index.teams.map((t) => t.id),
    index.players.map((p) => p.id),
    games
  );
}
