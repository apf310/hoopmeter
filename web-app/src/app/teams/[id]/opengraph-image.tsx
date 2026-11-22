// Imagen al compartir la ficha de un equipo (Tarea 6.25): escudo, nombre, conferencia y división.
// Sin balance ni puesto: la cabecera del equipo sigue el nivel de spoilers (Tarea 6.6).
import { brandLogo, Kicker, OG_CONTENT_TYPE, OgFrame, renderOgImage, teamGradient, teamLogo } from "@/lib/og-image";
import { conferenceLabel, divisionLabel } from "@/lib/places";
import { getTeams } from "@/lib/queries";
import { OG_SIZE } from "@/lib/seo";
import { teamAccent, teamBackdrop } from "@/lib/team-colors";

export const alt = "Ficha de equipo en Hoopmeter";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const logo = await brandLogo();
  const team = (await getTeams()).find((t) => t.id === Number(id));
  if (!team) return renderOgImage(<OgFrame logo={logo}>{null}</OgFrame>);

  const crest = await teamLogo(team.id);
  const accent = teamAccent(team);
  const conference = conferenceLabel(team.conference);
  const division = divisionLabel(team.division);
  const words = team.name.split(" ");
  // "Los Angeles" arriba, "Lakers" en grande (los Trail Blazers son la excepción de dos palabras)
  const nicknameWords = team.name.endsWith("Trail Blazers") ? 2 : 1;
  const city = words.slice(0, -nicknameWords).join(" ");
  const nickname = words.slice(-nicknameWords).join(" ");

  return renderOgImage(
    <OgFrame logo={logo} background={teamGradient(teamBackdrop(team.primary_color))}>
      <div style={{ display: "flex", alignItems: "center", padding: "0 64px", gap: 56, width: "100%" }}>
        {crest && (
          // eslint-disable-next-line @next/next/no-img-element -- Satori solo entiende <img>
          <img src={crest} width={360} height={360} alt="" />
        )}
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <Kicker color="#e2e8f0" bar={accent}>Equipo</Kicker>
          {city && <div style={{ display: "flex", marginTop: 14, fontSize: 56, fontWeight: 800, lineHeight: 1, textTransform: "uppercase", color: "#e2e8f0" }}>{city}</div>}
          <div style={{ display: "flex", fontSize: nickname.length > 10 ? 104 : 132, fontWeight: 800, lineHeight: 0.95, textTransform: "uppercase" }}>{nickname}</div>
          <div style={{ display: "flex", gap: 18, marginTop: 20, fontSize: 30, fontWeight: 600, color: "#cbd5e1" }}>
            {conference && <span>Conferencia {conference}</span>}
            {conference && division && <span style={{ color: "#64748b" }}>·</span>}
            {division && <span>División {division}</span>}
          </div>
          <div style={{ display: "flex", marginTop: 26, fontSize: 24, fontWeight: 800, letterSpacing: 4, textTransform: "uppercase", color: "#94a3b8" }}>
            Plantilla · Calendario · Nómina
          </div>
        </div>
      </div>
    </OgFrame>
  );
}
