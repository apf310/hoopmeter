// Vídeo vertical de la carta (Tarea 7.11, motor de la 6.15): fondo del equipo, la carta 3D girando 360° (línea de
// tiempo en lib/card-video.ts) y el nombre debajo. La marca de agua la pone SocialCardExporter. Solo navegador.
import type { VideoDraw } from "@/components/share/SocialCardExporter";
import { CARD_SIZE, WATERMARK_HEIGHT } from "@/components/share/SocialCardExporter";
import { splitName, type CardSpec } from "@/lib/player-card";
import { DISPLAY, fit, spaced } from "./card-kit";
import { CARD_GLOW } from "./card-model";
import { cardFrames } from "./card-stage";

const W = CARD_SIZE["9:16"].width;
const H = CARD_SIZE["9:16"].height - WATERMARK_HEIGHT["9:16"];
const CARD = { width: 940, height: 1300, y: 170 };

/** Carga la carta y devuelve el dibujo de cada instante (contenido de 1080×1808). */
export async function prepareCardVideo(spec: CardSpec, season: string): Promise<VideoDraw> {
  const frames = await cardFrames(spec, CARD.width, CARD.height);
  const { first, last } = splitName(spec.name);
  const c1 = spec.team?.c1 ?? "#1e293b";
  const subtitle = (spec.overall === undefined ? spec.line : typeof spec.overall === "number" ? `Media ${spec.overall} · ${spec.line}` : "Aún sin media esta temporada").toUpperCase();
  const kicker = `Carta Hoopmeter · ${spec.overall === undefined ? "Leyenda" : `Temporada ${season}`}`.toUpperCase();

  // Fondo fijo: se pinta una vez y se copia en cada fotograma
  const background = document.createElement("canvas");
  background.width = W;
  background.height = H;
  {
    const ctx = background.getContext("2d")!;
    const base = ctx.createLinearGradient(0, 0, W * 0.4, H);
    base.addColorStop(0, c1);
    base.addColorStop(0.45, "#0b1222");
    base.addColorStop(1, "#020617");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W / 2, CARD.y + CARD.height * 0.45, 40, W / 2, CARD.y + CARD.height * 0.45, W * 0.75);
    glow.addColorStop(0, CARD_GLOW[spec.tier].replace(/[\d.]+\)$/, "0.55)"));
    glow.addColorStop(1, "rgba(2,6,23,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    // Apellido gigante de fondo, como en los grafismos de TV
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = "#fff";
    ctx.font = DISPLAY(800, 420);
    ctx.textBaseline = "alphabetic";
    ctx.fillText(last.toUpperCase(), -20, H - 40);
    ctx.globalAlpha = 1;
  }

  return (ctx, t) => {
    const { canvas, pose } = frames(t);
    ctx.drawImage(background, 0, 0);
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillStyle = "#fb923c";
    ctx.font = DISPLAY(700, 34);
    ctx.globalAlpha = Math.min(1, pose.light * 1.4);
    spaced(ctx, kicker, W / 2, 108, 8, "center");
    ctx.globalAlpha = 1;
    ctx.drawImage(canvas, (W - CARD.width) / 2, CARD.y);

    if (pose.caption > 0) {
      const lift = (1 - pose.caption) * 40;
      ctx.globalAlpha = pose.caption;
      ctx.fillStyle = "rgba(255,255,255,.82)";
      ctx.font = DISPLAY(700, 52);
      if (first) spaced(ctx, first.toUpperCase(), W / 2, 1540 + lift, 10, "center");
      ctx.fillStyle = "#fff";
      const size = fit(ctx, last.toUpperCase(), 800, 150, W - 140);
      ctx.font = DISPLAY(800, size);
      ctx.textAlign = "center";
      ctx.fillText(last.toUpperCase(), W / 2, 1540 + size * 0.95 + lift);
      ctx.fillStyle = "#cbd5e1";
      ctx.font = DISPLAY(700, 40);
      spaced(ctx, subtitle, W / 2, 1540 + size * 0.95 + 70 + lift, 4, "center");
      ctx.textAlign = "left";
      ctx.globalAlpha = 1;
    }
  };
}
