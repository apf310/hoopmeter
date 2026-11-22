// Imagen al compartir un duelo del comparador (Tarea 6.25): `/og/compare?a=ID&b=ID`. Va en una ruta propia
// porque `opengraph-image` no recibe los parámetros de la URL, y fuera de `/api/` porque robots.txt lo cierra.
import type { NextRequest } from "next/server";
import { brandLogo, headshot, Kicker, OgFrame, renderOgImage } from "@/lib/og-image";
import { getPlayer, getTeams } from "@/lib/queries";
import { playerIdParam } from "@/lib/seo";
import type { Player, Team } from "@/lib/supabase";
import { teamAccent, teamBackdrop } from "@/lib/team-colors";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const ids = [playerIdParam(params.get("a") ?? undefined), playerIdParam(params.get("b") ?? undefined)];
  const [logo, teams, a, b] = await Promise.all([
    brandLogo(),
    getTeams(),
    ...ids.map((id) => (id ? getPlayer(id) : null)),
  ]);
  const players = [a, b] as (Player | null)[];
  const photos = await Promise.all(players.map((p) => (p ? headshot(p.id) : null)));
  const teamOf = (p: Player | null) => teams.find((t) => t.id === p?.team_id) ?? null;
  const colors = players.map((p) => teamBackdrop(teamOf(p)?.primary_color));

  return renderOgImage(
    <OgFrame logo={logo} background={`linear-gradient(90deg, ${colors[0]} 0%, #020617 50%, ${colors[1]} 100%)`}>
      <div style={{ position: "absolute", top: 36, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <Kicker color="#fdba74">Cara a cara</Kicker>
      </div>
      <Side player={players[0]} team={teamOf(players[0])} photo={photos[0]} align="left" />
      <div style={{ position: "absolute", left: 540, top: 210, width: 120, height: 120, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 60, backgroundColor: "#020617", border: "4px solid #f97316", fontSize: 56, fontWeight: 800 }}>
        VS
      </div>
      <Side player={players[1]} team={teamOf(players[1])} photo={photos[1]} align="right" />
    </OgFrame>
  );
}

function Side({ player, team, photo, align }: { player: Player | null; team: Team | null; photo: string | null; align: "left" | "right" }) {
  const accent = team ? teamAccent(team) : "#f97316";
  return (
    <div style={{ width: 600, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", position: "relative" }}>
      {photo && (
        // eslint-disable-next-line @next/next/no-img-element -- Satori solo entiende <img>
        <img src={photo} width={520} height={380} alt="" style={{ marginLeft: align === "left" ? -40 : 40 }} />
      )}
      <div
        style={{
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "14px 24px 18px",
          backgroundColor: "#020617",
          borderTop: `6px solid ${accent}`,
        }}
      >
        <div style={{ display: "flex", fontSize: (player?.full_name.length ?? 0) > 18 ? 48 : 60, fontWeight: 800, lineHeight: 1, textTransform: "uppercase" }}>
          {player?.full_name ?? "Elige jugador"}
        </div>
        <div style={{ display: "flex", marginTop: 6, fontSize: 24, fontWeight: 800, letterSpacing: 4, textTransform: "uppercase", color: "#94a3b8" }}>
          {player ? (player.is_active ? (team?.name ?? "Sin equipo") : "Leyenda") : "Comparador"}
        </div>
      </div>
    </div>
  );
}
