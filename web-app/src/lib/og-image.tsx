// Imágenes de previsualización de los enlaces (Tarea 6.25), 1200×630 con `next/og`. Solo servidor.
// Todo lo que se pinta aquí es Nivel 1 (ver `lib/seo.ts`): nunca nota, marcador ni estado del partido.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReactElement, ReactNode } from "react";
import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand";
import { OG_SIZE } from "@/lib/seo";

export const OG_CONTENT_TYPE = "image/png";

const ORANGE = "#f97316";
const SCALE = ["#ef4444", "#f59e0b", "#10b981"] as const;

// Barlow Condensed (OFL, `assets/og/`): la misma letra de títulos y cifras de la app
let fontsPromise: Promise<{ name: string; data: Buffer; weight: 600 | 800; style: "normal" }[]> | null = null;
function fonts() {
  fontsPromise ??= Promise.all(
    (["SemiBold", "ExtraBold"] as const).map(async (file) => ({
      name: "Barlow",
      data: await readFile(join(process.cwd(), "assets/og", `BarlowCondensed-${file}.ttf`)),
      weight: file === "SemiBold" ? (600 as const) : (800 as const),
      style: "normal" as const,
    }))
  );
  return fontsPromise;
}

const svgUri = (svg: Buffer | string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

let logoPromise: Promise<string> | null = null;
/** Logo E1 (`assets/logo.svg`, fuente de todos los iconos). */
export function brandLogo(): Promise<string> {
  logoPromise ??= readFile(join(process.cwd(), "assets/logo.svg")).then(svgUri);
  return logoPromise;
}

/** Escudo de `public/logos/` (los 30 actuales); null si no está. */
export async function teamLogo(teamId: number): Promise<string | null> {
  if (!Number.isInteger(teamId)) return null;
  try {
    return svgUri(await readFile(join(process.cwd(), "public/logos", `${teamId}.svg`)));
  } catch {
    return null;
  }
}

/** Foto de la CDN de la NBA incrustada (Satori no debe depender de la red al pintar); null si falla. */
export async function headshot(playerId: number): Promise<string | null> {
  try {
    const res = await fetch(`https://cdn.nba.com/headshots/nba/latest/1040x760/${playerId}.png`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return `data:image/png;base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  } catch {
    return null;
  }
}

/** Lo que se pinta solo cambia con el calendario o el job diario: los que lo piden (WhatsApp, X) también cachean. */
const DAILY_CACHE = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";

export async function renderOgImage(children: ReactElement, { cache = DAILY_CACHE }: { cache?: string } = {}): Promise<ImageResponse> {
  return new ImageResponse(children, {
    ...OG_SIZE,
    fonts: await fonts(),
    headers: { "Cache-Control": cache },
  });
}

/** Wordmark HOOP + METER, como en la app. */
export function Wordmark({ size }: { size: number }) {
  return (
    <div style={{ display: "flex", fontSize: size, fontWeight: 800, lineHeight: 0.9, textTransform: "uppercase", color: "white" }}>
      {BRAND.lead}
      <span style={{ color: ORANGE }}>{BRAND.accent}</span>
    </div>
  );
}

/**
 * Antetítulo con raya, como los de la app (`tracking-[0.25em]`). Sobre el color de un equipo, el texto va claro
 * y solo la raya lleva su acento: el acento sobre su propio fondo apenas se lee.
 */
export function Kicker({ children, color = "#fb923c", bar = color }: { children: ReactNode; color?: string; bar?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 26, fontWeight: 800, letterSpacing: 6, textTransform: "uppercase", color }}>
      <div style={{ width: 44, height: 5, background: bar }} />
      {children}
    </div>
  );
}

/**
 * Marco común: fondo de la app (o el degradado que se pase), pie con logo, marca y "Sin spoilers",
 * y la franja de la escala de la nota (rojo → ámbar → esmeralda) abajo del todo.
 */
export function OgFrame({
  logo,
  background,
  footer = true,
  children,
}: {
  logo: string;
  background?: string;
  /** Sin pie en la imagen de la marca, que ya es el logo en grande. */
  footer?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        fontFamily: "Barlow",
        color: "white",
        backgroundColor: "#020617",
        backgroundImage:
          background ??
          "radial-gradient(circle at 85% 40%, rgba(249,115,22,0.22), rgba(2,6,23,0) 55%), linear-gradient(180deg, #0b1222 0%, #020617 100%)",
      }}
    >
      <div style={{ flex: 1, display: "flex", position: "relative" }}>{children}</div>
      {footer && (
      <div
        style={{
          height: 84,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 48px",
          backgroundColor: "#020617",
          borderTop: "2px solid #1e293b",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- Satori solo entiende <img> */}
          <img src={logo} width={72} height={72} alt="" />
          <Wordmark size={40} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 22, fontSize: 24, fontWeight: 800, letterSpacing: 5, textTransform: "uppercase" }}>
          <span style={{ color: "#e2e8f0" }}>Sin spoilers</span>
          <span style={{ color: "#64748b" }}>{BRAND.domain}</span>
        </div>
      </div>
      )}
      <div style={{ height: 10, display: "flex", backgroundImage: `linear-gradient(90deg, ${SCALE[0]} 0%, ${SCALE[1]} 45%, ${SCALE[2]} 100%)` }} />
    </div>
  );
}

/** Degradado de cabecera de equipo (como las de la app): color del equipo a la izquierda que se funde en oscuro. */
export function teamGradient(color: string, direction: "90deg" | "270deg" = "90deg"): string {
  return `linear-gradient(${direction}, ${color} 0%, ${color}cc 30%, #020617 92%)`;
}
