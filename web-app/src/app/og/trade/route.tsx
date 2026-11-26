// Imagen al compartir el enlace de un traspaso del GM (Tarea 7.9): `/og/trade?equipos=…`, con los mismos parámetros que
// el enlace (Tarea 6.9). Se monta con los contratos de hoy, como al abrirlo, con el veredicto del convenio y sin la nota
// de la IA (no viaja en el enlace). Va en una ruta propia porque `opengraph-image` no recibe los parámetros, y fuera de
// `/api/` porque robots.txt lo cierra. El GM se ve en todos los niveles: aquí no hay nada que destripar.
import type { NextRequest } from "next/server";
import { pickLabel, type GmPlayer, type GmTeam } from "@/lib/gm";
import { getSharedTrade, type SharedTrade } from "@/lib/gm-share";
import { brandLogo, headshot, Kicker, OgFrame, renderOgImage, teamLogo } from "@/lib/og-image";
import { splitTeamName } from "@/lib/seo";
import { SILHOUETTE } from "@/lib/silhouette";
import { formatMoney, verdictTitle, type DraftPick, type TradeVerdict } from "@/lib/trade-rules";

// Contratos y veredicto cambian varias veces al día (y con la fecha): menos tiempo que el resto de imágenes
const CACHE = "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400";

const VERDICT_STYLE: Record<TradeVerdict["status"], { background: string; color: string }> = {
  empty: { background: "#334155", color: "#ffffff" },
  valid: { background: "#34d399", color: "#020617" },
  valid_from: { background: "#fbbf24", color: "#020617" },
  invalid: { background: "#ef4444", color: "#ffffff" },
};

/** Filas por equipo con letra legible en un móvil, "+N más" incluido. */
const MAX_ROWS = 3;
/** Alto de cada columna: la imagen (630) sin la franja del veredicto, el pie y la escala. */
const BAND = 78;
const COLUMN = 630 - 84 - 10 - BAND;
const PADDING = 24;
const TEAM_HEADER = 84;
const ROWS_AREA = COLUMN - 2 * PADDING - TEAM_HEADER - 14;
/** Una fila de ronda o de "+N más" (texto, filete, margen y hueco), y lo que suma cada fila de jugador a su foto. */
const TEXT_ROW = 60;
const ROW_EXTRA = 24;
const PHOTO_RATIO = 1040 / 760;

// Satori no lee bien un SVG escapado para URL: la silueta va en base64
const SILHOUETTE_URI = `data:image/svg+xml;base64,${Buffer.from(decodeURIComponent(SILHOUETTE.slice(SILHOUETTE.indexOf(",") + 1))).toString("base64")}`;

/** Tamaño de letra para que `text` quepa en una línea de `width` px (Barlow Condensed en mayúsculas, ~0,5 em por letra). */
const fit = (text: string, width: number, max: number, min = 24) => Math.round(Math.max(min, Math.min(max, width / (Math.max(text.length, 1) * 0.52))));

type Column = {
  team: GmTeam;
  players: (GmPlayer & { photo: string })[];
  /** Con la abreviatura de quien la cede. */
  picks: (DraftPick & { from: string })[];
  hidden: number;
  crest: string | null;
};

export async function GET(request: NextRequest) {
  const [logo, shared] = await Promise.all([brandLogo(), getSharedTrade(request.nextUrl.searchParams)]);
  if (!shared) return renderOgImage(<GmFallback logo={logo} />, { cache: CACHE });

  const columns = await Promise.all(shared.teams.map((team) => column(shared, team)));
  const width = 1200 / columns.length;
  const style = VERDICT_STYLE[shared.verdict.status];

  return renderOgImage(
    <OgFrame logo={logo}>
      <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
        <div style={{ height: BAND, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 40px", backgroundColor: "#020617", borderBottom: "4px solid #f97316" }}>
          <Kicker>GM Virtual · Traspaso simulado</Kicker>
          <div style={{ display: "flex", padding: "8px 18px", fontSize: 32, fontWeight: 800, lineHeight: 1, textTransform: "uppercase", ...style }}>
            {verdictTitle(shared.verdict)}
          </div>
        </div>
        <div style={{ display: "flex", flex: 1 }}>
          {columns.map((col, index) => (
            <TeamColumn key={col.team.id} column={col} width={width} first={index === 0} narrow={columns.length > 2} />
          ))}
        </div>
      </div>
    </OgFrame>,
    { cache: CACHE }
  );
}

/** Lo que recibe un equipo, como en la tarjeta para compartir: los sueldos más altos primero. */
async function column({ trade }: SharedTrade, team: GmTeam): Promise<Column> {
  const players = trade.players.filter(({ to }) => to === team.id).map(({ player }) => player).sort((a, b) => b.salary - a.salary);
  const picks = trade.picks.filter(({ to }) => to === team.id).map(({ pick }) => pick);
  // Si no cabe todo, la última fila es "+N más"
  const room = players.length + picks.length > MAX_ROWS ? MAX_ROWS - 1 : MAX_ROWS;
  const shown = players.slice(0, room);
  const shownPicks = picks.slice(0, room - shown.length).map((pick) => ({ ...pick, from: trade.teams.find(({ id }) => id === pick.teamId)?.abbreviation ?? "" }));
  const [crest, ...photos] = await Promise.all([teamLogo(team.id), ...shown.map((player) => headshot(player.id))]);
  return {
    team,
    players: shown.map((player, i) => ({ ...player, photo: photos[i] ?? SILHOUETTE_URI })),
    picks: shownPicks,
    hidden: players.length + picks.length - shown.length - shownPicks.length,
    crest,
  };
}

function TeamColumn({ column: { team, players, picks, hidden, crest }, width, first, narrow }: { column: Column; width: number; first: boolean; narrow: boolean }) {
  const inner = width - 2 * PADDING;
  const nickname = splitTeamName(team.name).nickname;
  const extraRows = picks.length + (hidden > 0 ? 1 : 0);
  // Cuantos menos jugadores, más grande la foto: un 1 por 1 llena la imagen igual que un traspaso grande
  const free = (ROWS_AREA - extraRows * TEXT_ROW) / Math.max(players.length, 1) - ROW_EXTRA;
  const photo = Math.round(Math.max(64, Math.min(narrow ? 120 : 190, free)));
  const text = inner - Math.round(photo * PHOTO_RATIO) - 16;

  return (
    <div
      style={{
        width,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        padding: PADDING,
        overflow: "hidden",
        backgroundImage: `linear-gradient(160deg, ${team.primary} 0%, ${team.primary}99 35%, #020617 85%)`,
        borderLeft: first ? "none" : "2px solid #1e293b",
      }}
    >
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", backgroundColor: "rgba(2,6,23,0.45)" }} />
      {crest && (
        // eslint-disable-next-line @next/next/no-img-element -- Satori solo entiende <img>
        <img src={crest} width={300} height={300} alt="" style={{ position: "absolute", right: -70, top: -50, opacity: 0.12 }} />
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 16, height: TEAM_HEADER, position: "relative" }}>
        {crest && (
          // eslint-disable-next-line @next/next/no-img-element -- Satori solo entiende <img>
          <img src={crest} width={76} height={76} alt="" />
        )}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 20, fontWeight: 800, letterSpacing: 5, textTransform: "uppercase", color: "rgba(255,255,255,0.75)" }}>Recibe</div>
          <div style={{ display: "flex", fontSize: fit(nickname, inner - 92, 54), fontWeight: 800, lineHeight: 1, textTransform: "uppercase" }}>{nickname}</div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, gap: 12, marginTop: 14, position: "relative" }}>
        {players.map((player) => (
          <PlayerRow key={player.id} player={player} photo={photo} text={text} />
        ))}
        {picks.map((pick) => (
          <div key={`${pick.teamId}-${pick.year}-${pick.round}`} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", borderTop: "2px solid rgba(255,255,255,0.15)", paddingTop: 8 }}>
            <div style={{ display: "flex", fontSize: narrow ? 30 : 36, fontWeight: 800, textTransform: "uppercase" }}>{pickLabel(pick)}</div>
            <div style={{ display: "flex", fontSize: narrow ? 22 : 26, fontWeight: 600, textTransform: "uppercase", color: "rgba(255,255,255,0.8)" }}>de {pick.from}</div>
          </div>
        ))}
        {hidden > 0 && (
          <div style={{ display: "flex", borderTop: "2px solid rgba(255,255,255,0.15)", paddingTop: 8, fontSize: 28, fontWeight: 600, textTransform: "uppercase", color: "rgba(255,255,255,0.8)" }}>
            +{hidden} más
          </div>
        )}
        {players.length + picks.length === 0 && (
          <div style={{ display: "flex", borderTop: "2px solid rgba(255,255,255,0.15)", paddingTop: 10, fontSize: 30, fontWeight: 600, textTransform: "uppercase", color: "rgba(255,255,255,0.7)" }}>
            No recibe nada
          </div>
        )}
      </div>
    </div>
  );
}

function PlayerRow({ player, photo, text }: { player: GmPlayer & { photo: string }; photo: number; text: number }) {
  const [first, ...rest] = player.name.split(" ");
  const last = rest.join(" ") || first;
  const lastSize = fit(last, text, Math.round(photo * 0.42), 26);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, borderTop: "2px solid rgba(255,255,255,0.15)", paddingTop: 10 }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- Satori solo entiende <img> */}
      <img src={player.photo} width={Math.round(photo * PHOTO_RATIO)} height={photo} alt="" style={{ objectFit: "cover", objectPosition: "top" }} />
      <div style={{ display: "flex", flexDirection: "column", width: text }}>
        {rest.length > 0 && (
          <div style={{ display: "flex", fontSize: Math.round(lastSize * 0.5), fontWeight: 800, lineHeight: 1.05, textTransform: "uppercase", color: "#cbd5e1" }}>{first}</div>
        )}
        <div style={{ display: "flex", fontSize: lastSize, fontWeight: 800, lineHeight: 1, textTransform: "uppercase", whiteSpace: "nowrap" }}>{last}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6, fontSize: Math.max(22, Math.round(lastSize * 0.55)), fontWeight: 600, color: "rgba(255,255,255,0.88)" }}>
          {player.salaryStatus === "approx" || player.salaryStatus === "estimated" ? "≈" : ""}
          {formatMoney(player.salary)}
          {/* Una estimación del usuario nunca sale como si fuera el salario real */}
          {player.salaryStatus === "estimated" && <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: 3, textTransform: "uppercase", color: "#fcd34d" }}>Estimación</span>}
        </div>
      </div>
    </div>
  );
}

/** Enlace roto o sin traspaso: la del simulador. */
function GmFallback({ logo }: { logo: string }) {
  return (
    <OgFrame logo={logo}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 80px" }}>
        <Kicker>Simulador de traspasos</Kicker>
        <div style={{ display: "flex", marginTop: 18, fontSize: 150, fontWeight: 800, lineHeight: 0.9, textTransform: "uppercase" }}>GM Virtual</div>
        <div style={{ display: "flex", marginTop: 24, fontSize: 42, fontWeight: 600, color: "#e2e8f0" }}>Con los contratos reales de la NBA y el convenio al día.</div>
      </div>
    </OgFrame>
  );
}
