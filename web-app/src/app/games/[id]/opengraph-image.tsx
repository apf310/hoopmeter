// Imagen al compartir un partido (Tarea 6.25): solo Nivel 1. Emparejamiento, jornada y hora de España;
// nunca nota, marcador ni estado. Es la misma imagen antes, durante y después del partido.
import { formatDayMonth, formatGameTime, formatWeekday, gameDayOf, isGameId, madridDayIfDifferent } from "@/lib/game-day";
import { brandLogo, Kicker, OG_CONTENT_TYPE, OgFrame, renderOgImage, teamLogo } from "@/lib/og-image";
import { getGameMatchup, getTeams } from "@/lib/queries";
import { OG_SIZE } from "@/lib/seo";
import type { Team } from "@/lib/supabase";
import { matchupAccents, teamBackdrop } from "@/lib/team-colors";

export const alt = "Partido de la NBA en Hoopmeter, sin spoilers";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const logo = await brandLogo();
  const [game, teams] = await Promise.all([isGameId(id) ? getGameMatchup(id) : null, getTeams()]);
  const away = teams.find((t) => t.id === game?.away_team_id);
  const home = teams.find((t) => t.id === game?.home_team_id);
  if (!game || !away || !home) return renderOgImage(<OgFrame logo={logo}>{null}</OgFrame>);

  const [awayLogo, homeLogo] = await Promise.all([teamLogo(away.id), teamLogo(home.id)]);
  const accents = matchupAccents(away, home);
  const day = gameDayOf(game.game_datetime_utc);
  const madrugada = madridDayIfDifferent(game.game_datetime_utc, day);
  const awayColor = teamBackdrop(away.primary_color);
  const homeColor = teamBackdrop(home.primary_color);

  return renderOgImage(
    <OgFrame
      logo={logo}
      background={`linear-gradient(90deg, ${awayColor} 0%, ${awayColor}99 24%, #020617 50%, ${homeColor}99 76%, ${homeColor} 100%)`}
    >
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "36px 56px 30px" }}>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Kicker color="#fdba74">Partido · Mira su nota sin spoilers</Kicker>
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <TeamSide team={away} logo={awayLogo} accent={accents.away} role="Visitante" />
          <div style={{ display: "flex", fontSize: 96, fontWeight: 800, color: "#64748b" }}>@</div>
          <TeamSide team={home} logo={homeLogo} accent={accents.home} role="Local" />
        </div>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "baseline", gap: 22, marginTop: 22, paddingTop: 18, borderTop: "2px solid rgba(255,255,255,0.12)", textTransform: "uppercase" }}>
          <span style={{ fontSize: 40, fontWeight: 800, color: "white" }}>
            {formatWeekday(day, "long")} {formatDayMonth(day)}
          </span>
          <span style={{ fontSize: 40, fontWeight: 800, color: "#fb923c" }}>{formatGameTime(game.game_datetime_utc)}</span>
          <span style={{ fontSize: 26, fontWeight: 600, letterSpacing: 3, color: "#cbd5e1" }}>
            Hora de España{madrugada ? ` (${madrugada})` : ""}
          </span>
        </div>
      </div>
    </OgFrame>
  );
}

function TeamSide({ team, logo, accent, role }: { team: Team; logo: string | null; accent: string; role: string }) {
  return (
    <div style={{ width: 420, display: "flex", flexDirection: "column", alignItems: "center" }}>
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- Satori solo entiende <img>
        <img src={logo} width={168} height={168} alt="" />
      ) : (
        <div style={{ width: 168, height: 168, display: "flex" }} />
      )}
      <div style={{ display: "flex", marginTop: 10, fontSize: 84, fontWeight: 800, lineHeight: 1, color: "white" }}>{team.abbreviation}</div>
      <div style={{ display: "flex", marginTop: 6, fontSize: 30, fontWeight: 600, color: "#e2e8f0" }}>{team.name}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, fontSize: 22, fontWeight: 800, letterSpacing: 5, textTransform: "uppercase", color: "#cbd5e1" }}>
        <div style={{ width: 22, height: 5, background: accent }} />
        {role}
      </div>
    </div>
  );
}
