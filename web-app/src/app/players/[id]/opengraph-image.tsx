// Imagen al compartir la ficha de un jugador (Tarea 6.25): foto, equipo, posición y sus promedios
// (de la temporada o de la carrera si es una leyenda), que solo cambian en el job diario: valen en Nivel 1.
import { brandLogo, headshot, Kicker, OG_CONTENT_TYPE, OgFrame, renderOgImage, teamGradient, teamLogo } from "@/lib/og-image";
import { positionLabel } from "@/lib/player-profile";
import { getPlayer, getPlayerCareer, getTeams } from "@/lib/queries";
import { OG_SIZE } from "@/lib/seo";
import { teamAccent, teamBackdrop } from "@/lib/team-colors";

export const alt = "Ficha de jugador en Hoopmeter";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const playerId = Number(id);
  const logo = await brandLogo();
  const valid = Number.isInteger(playerId) && playerId > 0;
  const [player, teams, career] = await Promise.all([
    valid ? getPlayer(playerId) : null,
    getTeams(),
    valid ? getPlayerCareer(playerId) : [],
  ]);
  if (!player) return renderOgImage(<OgFrame logo={logo}>{null}</OgFrame>);

  const team = teams.find((t) => t.id === player.team_id) ?? null;
  const regular = career.filter((r) => r.season_type === "Regular Season");
  // Como la ficha: de un retirado, su carrera; de uno en activo, su última temporada
  const line = player.is_active
    ? (regular.filter((r) => r.season_id !== "Career").at(-1) ?? null)
    : (regular.find((r) => r.season_id === "Career") ?? null);
  const [photo, crest] = await Promise.all([headshot(player.id), team ? teamLogo(team.id) : null]);
  const accent = team ? teamAccent(team) : "#f97316";
  const [first, ...rest] = player.full_name.split(" ");
  const last = rest.join(" ") || first;
  const who = player.is_active ? (team?.name ?? "Sin equipo") : "Leyenda de la NBA";

  return renderOgImage(
    <OgFrame logo={logo} background={team ? teamGradient(teamBackdrop(team.primary_color)) : undefined}>
      {crest && (
        // eslint-disable-next-line @next/next/no-img-element -- Satori solo entiende <img>
        <img src={crest} width={460} height={460} alt="" style={{ position: "absolute", right: 120, top: 30, opacity: 0.14 }} />
      )}
      {photo && (
        // eslint-disable-next-line @next/next/no-img-element -- Satori solo entiende <img>
        <img src={photo} width={685} height={500} alt="" style={{ position: "absolute", right: -30, bottom: 0 }} />
      )}
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 0 0 64px", width: 620 }}>
        <Kicker color="#e2e8f0" bar={accent}>{who}</Kicker>
        {rest.length > 0 && (
          <div style={{ display: "flex", marginTop: 16, fontSize: 52, fontWeight: 800, lineHeight: 1, textTransform: "uppercase", color: "#e2e8f0" }}>
            {first}
          </div>
        )}
        <div style={{ display: "flex", fontSize: last.length > 12 ? 92 : 118, fontWeight: 800, lineHeight: 0.95, textTransform: "uppercase" }}>{last}</div>
        {positionLabel(player.position) && (
          <div style={{ display: "flex", marginTop: 12, fontSize: 30, fontWeight: 600, color: "#cbd5e1" }}>{positionLabel(player.position)}</div>
        )}
        {line && line.pts != null && (
          <div style={{ display: "flex", flexDirection: "column", marginTop: 30 }}>
            <div style={{ display: "flex", fontSize: 22, fontWeight: 800, letterSpacing: 5, textTransform: "uppercase", color: "#94a3b8" }}>
              {line.season_id === "Career" ? "Carrera" : `Temporada ${line.season_id}`}
            </div>
            <div style={{ display: "flex", gap: 34, marginTop: 6 }}>
              <Stat value={line.pts} label="PTS" accent={accent} />
              <Stat value={line.reb} label="REB" accent={accent} />
              <Stat value={line.ast} label="AST" accent={accent} />
            </div>
          </div>
        )}
      </div>
    </OgFrame>
  );
}

function Stat({ value, label, accent }: { value: number | null; label: string; accent: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", borderLeft: `5px solid ${accent}`, paddingLeft: 14 }}>
      <div style={{ display: "flex", fontSize: 64, fontWeight: 800, lineHeight: 1 }}>{value == null ? "–" : value.toFixed(1)}</div>
      <div style={{ display: "flex", fontSize: 22, fontWeight: 800, letterSpacing: 4, color: "#cbd5e1" }}>{label}</div>
    </div>
  );
}
