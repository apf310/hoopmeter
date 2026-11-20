// Fotogramas del vídeo vertical del partido (Tarea 6.15): marcador que avanza, ventaja trazándose,
// mapa de tiro de los dos equipos llenándose y cuarto a cuarto. Dibujado en un canvas 2D (rápido:
// 360 fotogramas en segundos); la marca de agua es la misma franja de las tarjetas (SocialCardExporter).
// Solo cliente. Contiene el resultado: únicamente se ofrece en Nivel 3.
import { CARD_SIZE, WATERMARK_HEIGHT, type VideoDraw } from "@/components/share/SocialCardExporter";
import { formatDayMonth, formatWeekday } from "@/lib/game-day";
import type { Shot } from "@/lib/game-detail";
import { periodChip, periodName, periodStarts, type MatchupTeam } from "@/lib/game-format";
import { frameAt, SHOT_POP, type VideoFrame, type VideoGame } from "@/lib/game-video";
import { sameOrigin, teamLogoUrl } from "@/lib/nba-cdn";
import { formatExcitementScore, getExcitementTone, type ExcitementTone } from "@/lib/spoilers";

export const VIDEO_WIDTH = CARD_SIZE["9:16"].width;
/** Alto del contenido: el vídeo entero menos la franja de la marca de agua. */
export const VIDEO_CONTENT_HEIGHT = CARD_SIZE["9:16"].height - WATERMARK_HEIGHT["9:16"];

export type GameVideoInput = {
  game: VideoGame;
  day: string;
  away: MatchupTeam;
  home: MatchupTeam;
};

const W = VIDEO_WIDTH;
const BG = "#020617";
const COURT_BG = "#0f172a";
const LINE = "#475569";
const RULE = "#1e293b";
const MISS = "#94a3b8";
const ORANGE = "#fb923c";
const TONE: Record<ExcitementTone, { fg: string; bg: string; ring: string }> = {
  high: { fg: "#34d399", bg: "rgba(16,185,129,0.15)", ring: "rgba(16,185,129,0.45)" },
  mid: { fg: "#fbbf24", bg: "rgba(245,158,11,0.15)", ring: "rgba(245,158,11,0.45)" },
  low: { fg: "#f87171", bg: "rgba(239,68,68,0.15)", ring: "rgba(239,68,68,0.45)" },
  pending: { fg: "#64748b", bg: "#1e293b", ring: "#334155" },
};

// Media pista (mismas coordenadas que ShotCourt): décimas de pie con el aro en (0, 0)
const VIEW = { x: -250, y: -52.5, width: 500, height: 475 };
const ARC_Y = 89.48;
const MAX_Y = 418;
const COURT_LINES = [
  "M -250 -47.5 H 250 V 422.5 H -250 Z",
  `M -220 -47.5 L -220 ${ARC_Y} A 237.5 237.5 0 0 0 220 ${ARC_Y} L 220 -47.5`,
  "M -80 -47.5 H 80 V 142.5 H -80 Z",
  "M -60 142.5 A 60 60 0 0 0 60 142.5",
  "M -40 0 A 40 40 0 0 0 40 0",
  "M -60 422.5 A 60 60 0 0 1 60 422.5",
  "M -30 -7.5 L 30 -7.5",
  "M 7.5 0 A 7.5 7.5 0 1 1 -7.5 0 A 7.5 7.5 0 1 1 7.5 0",
];

// Zonas de la composición (px del vídeo)
const LAYOUT = {
  header: 92,
  logoY: 300,
  scoreY: 365,
  statusY: 455,
  badgeY: 498,
  rule1: 610,
  flow: { x: 60, y: 690, width: 960, height: 260 },
  rule2: 1020,
  courts: { y: 1110, width: 470, gap: 20 },
  rule3: 1590,
  table: { y: 1640 },
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (v: number) => 1 - (1 - clamp01(v)) ** 3;
function easeOutBack(v: number) {
  const x = clamp01(v) - 1;
  return 1 + 2.2 * x ** 3 + 1.2 * x ** 2;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => img.decode().then(() => resolve(img), () => resolve(img));
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Familia de Barlow Condensed tal como la registra next/font (nombre interno). */
function displayFamily(): string {
  const value = getComputedStyle(document.body).getPropertyValue("--font-barlow-condensed").trim();
  return value || "'Barlow Condensed', sans-serif";
}

/** Carga fuentes y logos y devuelve la función que dibuja cada instante (contenido de 1080×1808). */
export async function prepareGameVideo({ game, day, away, home }: GameVideoInput): Promise<VideoDraw> {
  const family = displayFamily();
  await Promise.all(["600", "700", "800"].map((weight) => document.fonts.load(`${weight} 40px ${family}`).catch(() => [])));
  const [awayLogo, homeLogo] = await Promise.all([away, home].map((team) => loadImage(sameOrigin(teamLogoUrl(team.id)))));

  const font = (size: number, weight = 800) => `${weight} ${size}px ${family}`;
  const header = `Jornada NBA · ${formatWeekday(day, "long")} ${formatDayMonth(day)}`.toUpperCase();
  const courtLines = COURT_LINES.map((d) => new Path2D(d));
  const maxLead = Math.max(5, ...game.flow.map(([, a, h]) => Math.abs(a - h)));
  const flowTop = Math.ceil(maxLead / 5) * 5;
  const starts = periodStarts(game.length, game.regulationPeriods);

  function text(
    ctx: CanvasRenderingContext2D,
    value: string,
    x: number,
    y: number,
    { size, weight = 800, color = "#fff", align = "center", tracking = 0 }: { size: number; weight?: number; color?: string; align?: CanvasTextAlign; tracking?: number }
  ) {
    ctx.font = font(size, weight);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "alphabetic";
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${tracking}px`;
    ctx.fillText(value, x, y);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  }

  function background(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, VIDEO_CONTENT_HEIGHT);
    const band = ctx.createLinearGradient(0, 0, W, 0);
    band.addColorStop(0, away.primary);
    band.addColorStop(0.45, BG);
    band.addColorStop(0.55, BG);
    band.addColorStop(1, home.primary);
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = band;
    ctx.fillRect(0, 0, W, LAYOUT.rule1);
    ctx.globalAlpha = 1;
    // Fundido de la franja de color hacia el fondo
    const fade = ctx.createLinearGradient(0, LAYOUT.rule1 - 260, 0, LAYOUT.rule1);
    fade.addColorStop(0, "rgba(2,6,23,0)");
    fade.addColorStop(1, BG);
    ctx.fillStyle = fade;
    ctx.fillRect(0, LAYOUT.rule1 - 260, W, 260);
    ctx.globalAlpha = 0.12;
    if (awayLogo) ctx.drawImage(awayLogo, -300, -200, 760, 760);
    if (homeLogo) ctx.drawImage(homeLogo, W - 460, -200, 760, 760);
    ctx.globalAlpha = 1;
  }

  function rule(ctx: CanvasRenderingContext2D, y: number) {
    ctx.fillStyle = RULE;
    ctx.fillRect(0, y, W, 2);
  }

  function scoreboard(ctx: CanvasRenderingContext2D, frame: VideoFrame) {
    text(ctx, header, W / 2, LAYOUT.header, { size: 34, weight: 600, color: "rgba(255,255,255,0.8)", tracking: 8 });

    const final = frame.phase === "final" && game.status === "Final";
    const loser = final ? (frame.away < frame.home ? "away" : frame.home < frame.away ? "home" : null) : null;
    for (const [side, team, logo, x] of [
      ["away", away, awayLogo, 190],
      ["home", home, homeLogo, W - 190],
    ] as const) {
      ctx.globalAlpha = loser === side ? 0.6 : 1;
      if (logo) ctx.drawImage(logo, x - 115, LAYOUT.logoY - 135, 230, 230);
      text(ctx, team.abbreviation, x, LAYOUT.logoY + 170, { size: 64 });
      text(ctx, side === "away" ? "VISITANTE" : "LOCAL", x, LAYOUT.logoY + 210, { size: 26, weight: 600, color: "rgba(255,255,255,0.7)", tracking: 6 });
      ctx.globalAlpha = 1;
    }

    const dim = "rgba(255,255,255,0.55)";
    text(ctx, String(frame.away), W / 2 - 42, LAYOUT.scoreY, { size: 168, align: "right", color: loser === "away" ? dim : "#fff" });
    text(ctx, "–", W / 2, LAYOUT.scoreY - 10, { size: 100, color: "rgba(255,255,255,0.4)" });
    text(ctx, String(frame.home), W / 2 + 42, LAYOUT.scoreY, { size: 168, align: "left", color: loser === "home" ? dim : "#fff" });

    if (frame.phase !== "final") {
      const label = frame.phase === "intro" ? "Salto inicial" : `${periodName(frame.period, game.regulationPeriods)} · ${frame.clock}`;
      text(ctx, label.toUpperCase(), W / 2, LAYOUT.statusY, { size: 40, weight: 700, color: ORANGE, tracking: 4 });
      return;
    }

    if (game.status !== "Final") {
      text(ctx, `EN DIRECTO${game.periodText ? ` · ${game.periodText}` : ""}`.toUpperCase(), W / 2, LAYOUT.statusY, { size: 40, weight: 700, color: "#f87171", tracking: 4 });
      return;
    }
    const overtime = Math.max(game.away.periods.length, game.home.periods.length) - game.regulationPeriods;
    const status = `FINAL${overtime > 0 ? (overtime > 1 ? ` · ${overtime} PRÓRROGAS` : " · PRÓRROGA") : ""}`;
    text(ctx, status, W / 2, LAYOUT.statusY, { size: 44, color: "#fff", tracking: 6 });

    if (game.excitementScore === null) return;
    // La nota entra con un pequeño rebote al congelarse el final
    const tone = TONE[getExcitementTone(game.excitementScore)];
    const grow = easeOutBack(frame.outro);
    const label = `NOTA ${formatExcitementScore(game.excitementScore)}`;
    ctx.save();
    ctx.globalAlpha = clamp01(frame.outro * 2);
    ctx.translate(W / 2, LAYOUT.badgeY + 36);
    ctx.scale(grow, grow);
    ctx.font = font(54);
    const width = ctx.measureText(label).width + 56;
    ctx.fillStyle = tone.bg;
    ctx.fillRect(-width / 2, -36, width, 72);
    ctx.strokeStyle = tone.ring;
    ctx.lineWidth = 4;
    ctx.strokeRect(-width / 2, -36, width, 72);
    text(ctx, label, 0, 19, { size: 54, color: tone.fg });
    ctx.restore();
  }

  function flowChart(ctx: CanvasRenderingContext2D, frame: VideoFrame) {
    const { x: left, y: top, width, height } = LAYOUT.flow;
    const mid = top + height / 2;
    const x = (s: number) => left + (Math.min(s, game.length) / game.length) * width;
    const y = (diff: number) => mid - (diff / flowTop) * (height / 2 - 4);

    text(ctx, "VENTAJA EN EL MARCADOR", left, top - 40, { size: 28, weight: 600, color: "#cbd5e1", align: "left", tracking: 6 });
    text(ctx, `${away.abbreviation} +${flowTop}`, left + 4, top + 22, { size: 22, weight: 600, color: "#94a3b8", align: "left", tracking: 2 });
    text(ctx, `${home.abbreviation} +${flowTop}`, left + 4, top + height - 6, { size: 22, weight: 600, color: "#94a3b8", align: "left", tracking: 2 });

    ctx.fillStyle = RULE;
    for (const v of [flowTop, flowTop / 2, -flowTop / 2, -flowTop]) ctx.fillRect(left, Math.round(y(v)), width, 1);
    ctx.fillStyle = "#334155";
    for (const s of starts) ctx.fillRect(Math.round(x(s)), top, 2, height);

    // Eje de periodos
    const bounds = [0, ...starts, game.length];
    for (let i = 0; i < bounds.length - 1; i++) {
      const p = i + 1;
      const label = p <= game.regulationPeriods ? `${periodChip(p, game.regulationPeriods)}.º` : periodChip(p, game.regulationPeriods);
      text(ctx, label, x((bounds[i] + bounds[i + 1]) / 2), top + height + 40, { size: 26, weight: 600, color: "#94a3b8", tracking: 2 });
    }

    const now = frame.gameSeconds;
    const line = new Path2D();
    line.moveTo(x(0), mid);
    let last = mid;
    for (const [s, a, h] of game.flow) {
      if (s > now) break;
      if (s === 0) continue;
      line.lineTo(x(s), last);
      last = y(a - h);
      line.lineTo(x(s), last);
    }
    line.lineTo(x(now), last);
    const area = new Path2D(line);
    area.lineTo(x(now), mid);
    area.lineTo(x(0), mid);
    area.closePath();

    for (const [team, clipTop, clipHeight] of [
      [away, top - 10, height / 2 + 10],
      [home, mid, height / 2 + 10],
    ] as const) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(left, clipTop, width + 20, clipHeight);
      ctx.clip();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = team.accent;
      ctx.fill(area);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = team.accent;
      ctx.lineWidth = 4;
      ctx.lineJoin = "round";
      ctx.stroke(line);
      ctx.restore();
    }
    ctx.fillStyle = "#64748b";
    ctx.fillRect(left, mid - 1, width, 2);

    // Punta de la línea: donde va el partido
    ctx.beginPath();
    ctx.arc(x(now), last, 10, 0, Math.PI * 2);
    ctx.fillStyle = frame.away >= frame.home ? away.accent : home.accent;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = BG;
    ctx.stroke();
  }

  function court(ctx: CanvasRenderingContext2D, team: MatchupTeam, logo: HTMLImageElement | null, shots: (Shot & { age: number })[], left: number) {
    const { y: top, width } = LAYOUT.courts;
    const scale = width / VIEW.width;

    const mine = shots.filter((s) => s.teamId === team.id);
    const made = mine.filter((s) => s.made).length;
    const threes = mine.filter((s) => s.three);
    const madeThrees = threes.filter((s) => s.made).length;
    if (logo) ctx.drawImage(logo, left, top - 78, 52, 52);
    text(ctx, team.abbreviation, left + 64, top - 36, { size: 40, align: "left" });
    text(ctx, `TC ${made}/${mine.length} · T3 ${madeThrees}/${threes.length}`, left + width, top - 38, { size: 30, weight: 700, color: "#cbd5e1", align: "right" });

    ctx.save();
    ctx.translate(left - VIEW.x * scale, top - VIEW.y * scale);
    ctx.scale(scale, scale);
    ctx.fillStyle = COURT_BG;
    ctx.fillRect(-250, -47.5, 500, 470);
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 2;
    for (const path of courtLines) ctx.stroke(path);

    // Fallados debajo, anotados encima; cada tiro entra con un pequeño rebote
    for (const pass of ["miss", "made"] as const) {
      for (const shot of mine) {
        if ((pass === "made") !== shot.made) continue;
        const pop = shot.age / SHOT_POP;
        const size = easeOutBack(pop);
        const sy = Math.min(shot.y, MAX_Y);
        if (pass === "miss") {
          ctx.save();
          ctx.translate(shot.x, sy);
          ctx.scale(size, size);
          ctx.strokeStyle = MISS;
          ctx.lineWidth = 2.5;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(-5, -5);
          ctx.lineTo(5, 5);
          ctx.moveTo(5, -5);
          ctx.lineTo(-5, 5);
          ctx.stroke();
          ctx.restore();
          continue;
        }
        if (pop < 1) {
          // Onda al anotar
          ctx.beginPath();
          ctx.arc(shot.x, sy, 7 + 22 * easeOut(pop), 0, Math.PI * 2);
          ctx.globalAlpha = 1 - pop;
          ctx.strokeStyle = team.accent;
          ctx.lineWidth = 2.5;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        ctx.beginPath();
        ctx.arc(shot.x, sy, 7 * size, 0, Math.PI * 2);
        ctx.fillStyle = team.accent;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = COURT_BG;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function quarters(ctx: CanvasRenderingContext2D, frame: VideoFrame) {
    const { y: top } = LAYOUT.table;
    const columns = Math.max(game.regulationPeriods, frame.periods.away.length, frame.periods.home.length);
    const firstX = 300;
    const step = Math.min(130, (W - 80 - firstX) / (columns + 1));
    const cx = (i: number) => firstX + step * (i + 0.5);

    for (let i = 0; i < columns; i++) text(ctx, periodChip(i + 1, game.regulationPeriods), cx(i), top, { size: 30, weight: 600, color: "#94a3b8" });
    text(ctx, "T", cx(columns), top, { size: 30, weight: 600, color: "#94a3b8" });

    const rows = [
      { team: away, mine: frame.periods.away, rival: frame.periods.home, total: frame.away, y: top + 76 },
      { team: home, mine: frame.periods.home, rival: frame.periods.away, total: frame.home, y: top + 150 },
    ];
    for (const { team, mine, rival, total, y } of rows) {
      ctx.fillStyle = RULE;
      ctx.fillRect(80, y - 56, W - 160, 2);
      ctx.fillStyle = team.accent;
      ctx.fillRect(80, y - 40, 10, 44);
      text(ctx, team.abbreviation, 110, y, { size: 48, align: "left" });
      for (let i = 0; i < columns; i++) {
        if (mine[i] === undefined) continue;
        const ahead = mine[i] > (rival[i] ?? 0);
        text(ctx, String(mine[i]), cx(i), y, { size: 46, weight: 700, color: ahead ? "#fff" : "rgba(255,255,255,0.55)" });
      }
      text(ctx, String(total), cx(columns), y, { size: 48, color: "#fff" });
    }
  }

  return (ctx, t) => {
    const frame = frameAt(game, t);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, VIDEO_CONTENT_HEIGHT);
    ctx.clip();
    background(ctx);
    scoreboard(ctx, frame);
    rule(ctx, LAYOUT.rule1);
    flowChart(ctx, frame);
    rule(ctx, LAYOUT.rule2);
    const { width, gap } = LAYOUT.courts;
    const left = (W - 2 * width - gap) / 2;
    court(ctx, away, awayLogo, frame.shots, left);
    court(ctx, home, homeLogo, frame.shots, left + width + gap);
    rule(ctx, LAYOUT.rule3);
    quarters(ctx, frame);

    // Entrada: el marcador aparece primero y el resto justo detrás (velo del color del fondo)
    if (frame.phase === "intro") {
      ctx.fillStyle = BG;
      ctx.globalAlpha = 1 - easeOut(frame.intro * 2);
      ctx.fillRect(0, 0, W, LAYOUT.rule1);
      ctx.globalAlpha = 1 - easeOut(frame.intro * 1.5 - 0.3);
      ctx.fillRect(0, LAYOUT.rule1, W, VIDEO_CONTENT_HEIGHT - LAYOUT.rule1);
    }
    ctx.restore();
  };
}
