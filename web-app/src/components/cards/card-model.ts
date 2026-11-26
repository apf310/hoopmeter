// Carta 3D de jugador (Tarea 7.11, prototipo aprobado el 25-nov): plancha con canto y grosor, arte hundido con la
// huella de su material, marco, foto, placa con el nombre, media, escudo, sellos en relieve y reverso con su radar,
// sus temporadas y su palmarés. Solo navegador (Three.js con import dinámico).
import * as THREE from "three";
import { buildHuella, facetsOf, PEAKS, type Huella } from "@/lib/card-huella";
import type { CardSeal, CardSpec, CardTier } from "@/lib/player-card";
import { splitName } from "@/lib/player-card";
import { playerHeadshotUrl, sameOrigin, teamLogoUrl } from "@/lib/nba-cdn";
import { SILHOUETTE } from "@/lib/silhouette";
import { chamfer, circle, DISPLAY, faceGeometry, fit, frameGeometry, makeCanvas, metal, outline, shadowed, slabGeometry, spaced, TAU, texture } from "./card-kit";
import { paintLayer } from "./huella-paint";

export const CARD_W = 2.5;
export const CARD_H = 3.5;
const BORDER = 0.115;
const IW = CARD_W - BORDER * 2;
const IH = CARD_H - BORDER * 2;

/** Brillo de fondo de cada material en el escenario. */
export const CARD_GLOW: Record<CardTier, string> = {
  legend: "rgba(231,189,90,.24)",
  elite: "rgba(167,139,250,.3)",
  great: "rgba(16,185,129,.24)",
  good: "rgba(59,130,246,.28)",
  base: "rgba(249,115,22,.16)",
};

export type CardImages = { photo: CanvasImageSource; crest: CanvasImageSource | null };

function loadImage(src: string, size?: number): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    if (size) img.width = img.height = size;
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Foto (del mismo origen, para poder pintarla en WebGL) y escudo; sin foto, la silueta propia. */
export async function loadCardImages(spec: CardSpec): Promise<CardImages> {
  const [photo, crest] = await Promise.all([
    loadImage(sameOrigin(playerHeadshotUrl(spec.id))),
    spec.team ? loadImage(teamLogoUrl(spec.team.id), 320) : Promise.resolve(null),
  ]);
  return { photo: photo ?? (await loadImage(SILHOUETTE, 1040)) ?? makeCanvas(8, 8, () => undefined), crest };
}

function shade(hex: string, k: number): string {
  const c = new THREE.Color(hex);
  const hsl = c.getHSL({ h: 0, s: 0, l: 0 });
  c.setHSL(hsl.h, hsl.s, Math.min(1, hsl.l * k));
  return `#${c.getHexString()}`;
}

const colors = (spec: CardSpec) => ({ c1: spec.team?.c1 ?? "#1e293b", c2: spec.team?.c2 ?? "#f97316" });

// ---------------------------------------------------------------- arte (fondo hundido)

const PX = 1024;
const PY = Math.round((PX * IH) / IW);
const ART_ASPECT = IH / IW;
const CX = PX / 2;
const CY = PY * 0.4;

/** Huella sin atributos (aún no ha jugado): la misma silueta tranquila para todos. */
const NEUTRAL = [0.35, 0.35, 0.35, 0.35, 0.35, 0.35];

function drawArtHuella(ctx: CanvasRenderingContext2D, huella: Huella, width: number) {
  paintLayer(ctx, huella.main, { scale: PX, unit: width });
  paintLayer(ctx, huella.accent, { scale: PX, unit: width });
}

function radial(ctx: CanvasRenderingContext2D, stops: [number, string][]) {
  const g = ctx.createRadialGradient(CX, PY * 0.4, 0, CX, PY * 0.4, PY * 0.9 * 0.75);
  for (const [at, color] of stops) g.addColorStop(at, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, PX, PY);
}

function buildArt(spec: CardSpec, values: number[]): THREE.Group {
  const { tier } = spec;
  const { c1 } = colors(spec);
  const g = new THREE.Group();
  const huella = buildHuella(tier, values, { aspect: ART_ASPECT });
  const geo = faceGeometry(outline(tier, IW + 0.02, IH + 0.02, 0.94), IW + 0.02, IH + 0.02);
  const lines = (color: string, width: number) =>
    texture(
      makeCanvas(PX, PY, (ctx) => {
        ctx.strokeStyle = color;
        drawArtHuella(ctx, huella, width);
      })
    );
  const bumpOf = (width: number, blur = 0) =>
    texture(
      makeCanvas(PX, PY, (ctx) => {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, PX, PY);
        ctx.strokeStyle = "#fff";
        if (blur) ctx.filter = `blur(${blur}px)`;
        drawArtHuella(ctx, huella, width);
      }),
      false
    );
  const layer = (material: THREE.Material, z: number, noShadow = false) => {
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.z = z;
    mesh.userData.noShadow = noShadow;
    g.add(mesh);
  };

  if (tier === "legend") {
    const map = texture(makeCanvas(PX, PY, (ctx) => radial(ctx, [[0, "#e8b04a"], [0.32, "#8d5a15"], [0.7, "#3a2108"], [1, "#150b03"]])));
    layer(new THREE.MeshPhysicalMaterial({ map, metalness: 1, roughness: 0.42, bumpMap: bumpOf(3, 0.6), bumpScale: 5 }), -0.115);
    layer(new THREE.MeshPhysicalMaterial({ map: lines("#ffdf93", 2.1), metalness: 1, roughness: 0.16, transparent: true, depthWrite: false, envMapIntensity: 1.5 }), -0.075, true);
  } else if (tier === "elite") {
    const map = texture(
      makeCanvas(PX, PY, (ctx) => {
        radial(ctx, [[0, shade(c1, 1.7)], [0.45, shade(c1, 0.85)], [1, shade(c1, 0.25)]]);
        ctx.globalCompositeOperation = "screen";
        const n = 72;
        for (let i = 0; i < n; i++) {
          const ray = ctx.createRadialGradient(CX, CY, PX * 0.06, CX, CY, PY * 0.7);
          ray.addColorStop(0, `hsla(${(i * 137.5) % 360}, 100%, 50%, .8)`);
          ray.addColorStop(1, `hsla(${(i * 137.5 + 70) % 360}, 100%, 46%, .5)`);
          ctx.fillStyle = ray;
          ctx.globalAlpha = 0.08 + 0.55 * Math.pow(Math.abs(Math.sin(i * 1.7)), 2);
          ctx.beginPath();
          ctx.moveTo(CX, CY);
          ctx.arc(CX, CY, PY, (i / n) * TAU, ((i + 1.02) / n) * TAU);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      })
    );
    const prism = makeCanvas(PX, PY, (ctx) => {
      const k = ctx.createConicGradient(0.4, CX, CY);
      ["#67e8f9", "#a78bfa", "#f472b6", "#fde047", "#4ade80", "#22d3ee", "#c084fc", "#67e8f9"].forEach((c, i) => k.addColorStop(i / 7, c));
      ctx.strokeStyle = k;
      drawArtHuella(ctx, huella, 2.6);
    });
    // Espesor de la lámina por sectores: al girar, cada rayo cambia de color por su cuenta
    const film = texture(
      makeCanvas(PX, PY, (ctx) => {
        const n = 72;
        for (let i = 0; i < n; i++) {
          const v = Math.round(60 + 190 * Math.abs(Math.sin(i * 2.399)));
          ctx.fillStyle = `rgb(${v},${v},${v})`;
          ctx.beginPath();
          ctx.moveTo(CX, CY);
          ctx.arc(CX, CY, PY, (i / n) * TAU, ((i + 1.04) / n) * TAU);
          ctx.fill();
        }
      }),
      false
    );
    layer(
      new THREE.MeshPhysicalMaterial({
        map,
        metalness: 0.85,
        roughness: 0.3,
        iridescence: 0.55,
        iridescenceIOR: 1.7,
        iridescenceThicknessRange: [180, 760],
        iridescenceThicknessMap: film,
        emissive: "#ffffff",
        emissiveMap: map,
        emissiveIntensity: 0.3,
        envMapIntensity: 1.35,
      }),
      -0.115
    );
    const prismMap = texture(prism);
    layer(
      new THREE.MeshPhysicalMaterial({ map: prismMap, emissive: "#ffffff", emissiveMap: prismMap, emissiveIntensity: 0.75, metalness: 0.7, roughness: 0.2, iridescence: 0.4, transparent: true, depthWrite: false, envMapIntensity: 1.8 }),
      -0.07,
      true
    );
  } else if (tier === "great") {
    const map = texture(makeCanvas(PX, PY, (ctx) => radial(ctx, [[0, "#16c490"], [0.4, "#067452"], [0.8, "#02362a"], [1, "#011510"]])));
    layer(new THREE.MeshPhysicalMaterial({ map, metalness: 0.6, roughness: 0.28, clearcoat: 0.35, clearcoatRoughness: 0.12, bumpMap: bumpOf(9, 5), bumpScale: 5 }), -0.115);
    layer(new THREE.MeshPhysicalMaterial({ map: lines("#d9fff0", 2.4), metalness: 1, roughness: 0.2, transparent: true, depthWrite: false, envMapIntensity: 1.6 }), -0.085, true);
  } else if (tier === "good") {
    // Talla de verdad: cada faceta a su altura, más alta donde es mejor
    const pos: number[] = [];
    const col: number[] = [];
    const deep = new THREE.Color("#0a2f8f");
    const mid = new THREE.Color("#1f7bf0");
    const high = new THREE.Color("#9fe0ff");
    for (const f of facetsOf(values, ART_ASPECT)) {
      const u = Math.min(1, Math.max(0, f.height));
      const c = u < 0.5 ? deep.clone().lerp(mid, u * 2) : mid.clone().lerp(high, (u - 0.5) * 2);
      for (const k of [0, 2, 1]) {
        pos.push(f.points[k * 2] * IW - IW / 2, IH / 2 - f.points[k * 2 + 1] * IW, -0.125 + f.z[k] * 0.105);
        col.push(c.r, c.g, c.b);
      }
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    fg.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    fg.computeVertexNormals();
    g.add(
      new THREE.Mesh(
        fg,
        new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 0.42, roughness: 0.16, clearcoat: 0.7, clearcoatRoughness: 0.04, iridescence: 0.4, iridescenceIOR: 1.6, flatShading: true, envMapIntensity: 1.5 })
      )
    );
  } else {
    const map = texture(
      makeCanvas(PX, PY, (ctx) => {
        parquet(ctx, PX, PY);
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = c1;
        drawArtHuella(ctx, huella, 4);
        ctx.globalAlpha = 1;
        const v = ctx.createRadialGradient(CX, CY, PX * 0.3, CX, CY, PX * 0.95);
        v.addColorStop(0, "rgba(0,0,0,0)");
        v.addColorStop(1, "rgba(20,8,0,.6)");
        ctx.fillStyle = v;
        ctx.fillRect(0, 0, PX, PY);
      })
    );
    layer(new THREE.MeshPhysicalMaterial({ map, metalness: 0, roughness: 0.48, clearcoat: 0.75, clearcoatRoughness: 0.2, envMapIntensity: 0.8 }), -0.115);
  }
  return g;
}

/** Tablas de parquet con su veta (siempre las mismas). */
function parquet(ctx: CanvasRenderingContext2D, w: number, h: number) {
  let seed = 5;
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const row = 58;
  for (let y = 0; y < h; y += row) {
    let x = -r() * 260;
    while (x < w) {
      const len = 170 + r() * 170;
      ctx.fillStyle = `hsl(${28 + r() * 6} ${46 + r() * 10}% ${46 + r() * 14}%)`;
      ctx.fillRect(x, y, len - 2, row - 2);
      ctx.globalAlpha = 0.14;
      ctx.strokeStyle = "#3b1d06";
      for (let i = 0; i < 6; i++) {
        const gy = y + 5 + r() * (row - 12);
        ctx.beginPath();
        ctx.moveTo(x, gy);
        ctx.bezierCurveTo(x + len * 0.3, gy + (r() - 0.5) * 12, x + len * 0.7, gy + (r() - 0.5) * 12, x + len - 2, gy + (r() - 0.5) * 8);
        ctx.lineWidth = 1 + r() * 2;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      x += len;
    }
  }
}

// ---------------------------------------------------------------- marco

function rainbow(geo: THREE.BufferGeometry) {
  const stops = ["#67e8f9", "#a78bfa", "#f472b6", "#fde047", "#4ade80", "#22d3ee", "#c084fc"].map((c) => new THREE.Color(c));
  const p = geo.attributes.position;
  const out = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const t = ((p.getX(i) * 0.5 - p.getY(i)) / (CARD_W * 0.5 + CARD_H) + 0.5) * (stops.length - 1);
    const a = Math.max(0, Math.min(stops.length - 2, Math.floor(t)));
    const c = stops[a].clone().lerp(stops[a + 1], Math.min(1, Math.max(0, t - a)));
    out.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(out, 3));
}

function paperBump() {
  let seed = 3;
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return texture(
    makeCanvas(256, 256, (ctx) => {
      const im = ctx.createImageData(256, 256);
      for (let i = 0; i < im.data.length; i += 4) {
        const v = 110 + r() * 90;
        im.data.set([v, v, v, 255], i);
      }
      ctx.putImageData(im, 0, 0);
    }),
    false
  );
}

function buildFrame(spec: CardSpec): THREE.Group {
  const { tier } = spec;
  const { c1 } = colors(spec);
  const g = new THREE.Group();
  const outer = frameGeometry(tier, CARD_W, CARD_H, BORDER * 0.66, -0.17, 0.07, tier === "base" ? 0.012 : 0.026);
  const inner = frameGeometry(tier, CARD_W - BORDER * 1.18, CARD_H - BORDER * 1.18, BORDER * 0.5, -0.17, tier === "base" ? 0.058 : 0.035, 0.012);
  const mats: Record<CardTier, () => [THREE.Material, THREE.Material]> = {
    legend: () => [metal("gold", { roughness: 0.23 }), metal("gold", { color: "#8a5a18", roughness: 0.3 })],
    elite: () => [
      new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 0.62, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05, iridescence: 0.5, iridescenceIOR: 1.9, iridescenceThicknessRange: [200, 460], envMapIntensity: 1.5 }),
      metal("dark", { color: "#0a0d18", roughness: 0.2 }),
    ],
    great: () => [metal("steel", { color: "#17a275", roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 }), metal("gold", { roughness: 0.22 })],
    good: () => [metal("steel", { color: "#3b8fe6", roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.06 }), metal("silver", { roughness: 0.14 })],
    base: () => [new THREE.MeshStandardMaterial({ color: "#f3eddf", roughness: 0.92, bumpMap: paperBump(), bumpScale: 0.7 }), new THREE.MeshStandardMaterial({ color: c1, roughness: 0.6 })],
  };
  const [outerMat, innerMat] = mats[tier]();
  if (tier === "elite") rainbow(outer);
  g.add(new THREE.Mesh(outer, outerMat), new THREE.Mesh(inner, innerMat));
  return g;
}

// ---------------------------------------------------------------- foto, placa, media, escudo

const HALO: Record<CardTier, string> = { legend: "rgba(255,205,96,.75)", elite: "rgba(196,181,253,.75)", great: "rgba(110,231,183,.6)", good: "rgba(125,211,252,.65)", base: "rgba(0,0,0,.45)" };

function buildPhoto(spec: CardSpec, image: CanvasImageSource): THREE.Mesh {
  const w = 1.24 * CARD_W;
  const h = (w * 570) / 780;
  const bottom = -CARD_H / 2 + 0.74;
  const c = makeCanvas(1560, 1140, (ctx) => {
    if (spec.tier === "legend") ctx.filter = "sepia(.3) saturate(1.08) contrast(1.04)";
    ctx.shadowColor = HALO[spec.tier];
    ctx.shadowBlur = 46;
    ctx.drawImage(image, 0, 0, 1560, 1140);
  });
  const map = texture(c);
  const u = IW / w;
  const geo = new THREE.PlaneGeometry(IW, h);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, 0.5 + (uv.getX(i) - 0.5) * u);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map, transparent: true, alphaTest: 0.01, toneMapped: false, depthWrite: false }));
  mesh.position.set(0, bottom + h / 2, 0.0);
  mesh.castShadow = true;
  mesh.userData.noShadow = true;
  mesh.renderOrder = 2;
  mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.6 });
  return mesh;
}

function buildPlate(spec: CardSpec): THREE.Mesh {
  const { tier } = spec;
  const { c1, c2 } = colors(spec);
  const { first, last } = splitName(spec.name);
  const w = IW + 0.02;
  const h = 0.94;
  const cw = 1024;
  const ch = Math.round((cw * h) / w);
  const style = {
    legend: { bg: "#140b03", ink: ["#fff6d8", "#e7bd5a"], sub: "#fde7ab" },
    elite: { bg: "#06070f", ink: ["#ffffff", "#d8ccff"], sub: "#fef08a" },
    great: { bg: "#02140f", ink: ["#ffffff", "#c8ffe9"], sub: "#86efc6" },
    good: { bg: "#03102c", ink: ["#ffffff", "#cdeaff"], sub: "#a5dcff" },
    base: { bg: "#f3eddf", ink: ["#14120d", "#14120d"], sub: "#4b4436" },
  }[tier];
  const solid = tier === "base";
  const center = tier === "legend";
  const map = texture(
    makeCanvas(cw, ch, (ctx) => {
      const bg = ctx.createLinearGradient(0, 0, 0, ch);
      const top = solid ? 0.2 : 0.02;
      bg.addColorStop(0, "rgba(0,0,0,0)");
      bg.addColorStop(top, solid ? style.bg : "rgba(0,0,0,0)");
      bg.addColorStop(solid ? top + 0.001 : 0.36, style.bg);
      bg.addColorStop(1, style.bg);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, cw, ch);
      ctx.textBaseline = "alphabetic";
      const x = center ? cw / 2 : 64;
      if (!solid && !center) {
        // Franja del equipo bajo el apellido
        ctx.save();
        const k = ctx.createLinearGradient(0, 0, cw, 0);
        k.addColorStop(0, c1);
        k.addColorStop(1, shade(c1, 0.5));
        ctx.fillStyle = k;
        ctx.transform(1, 0, -0.22, 1, 0, 0);
        ctx.fillRect(-20, ch * 0.47, cw * 0.86, ch * 0.3);
        ctx.fillStyle = c2;
        ctx.fillRect(cw * 0.86 - 20, ch * 0.47, 16, ch * 0.3);
        ctx.restore();
      }
      if (solid) {
        ctx.fillStyle = c1;
        ctx.fillRect(0, ch * 0.2, cw, 14);
      }
      ctx.fillStyle = center ? style.sub : style.ink[0];
      ctx.font = DISPLAY(600, 50);
      ctx.shadowColor = solid ? "transparent" : "rgba(0,0,0,.9)";
      ctx.shadowBlur = 10;
      if (first) spaced(ctx, first.toUpperCase(), x, ch * 0.43, center ? 16 : 10, center ? "center" : "left");
      const surname = last.toUpperCase();
      const size = fit(ctx, surname, 800, center ? 150 : 128, cw * (center ? 0.8 : 0.74));
      const ink = ctx.createLinearGradient(0, ch * 0.5, 0, ch * 0.78);
      if (center) {
        ink.addColorStop(0, "#fff8dc");
        ink.addColorStop(0.45, "#f1c767");
        ink.addColorStop(0.55, "#b97d1e");
        ink.addColorStop(1, "#ffe9a6");
      } else {
        ink.addColorStop(0, style.ink[0]);
        ink.addColorStop(1, style.ink[1]);
      }
      ctx.fillStyle = ink;
      ctx.font = DISPLAY(800, size);
      ctx.textAlign = center ? "center" : "left";
      ctx.fillText(surname, x, ch * 0.62 + size * 0.36);
      ctx.shadowBlur = 0;
      ctx.fillStyle = style.sub;
      ctx.font = DISPLAY(600, 46);
      const line = spec.line.toUpperCase();
      const lineWidth = spaced(ctx, line, tier === "good" ? 128 : x, ch * 0.915, 3, center ? "center" : "left");
      if (!center && spec.position && spec.line !== spec.position && lineWidth < cw * 0.55) {
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = style.ink[0];
        spaced(ctx, spec.position.toUpperCase(), cw - 64, ch * 0.915, 3, "right");
        ctx.globalAlpha = 1;
      }
    })
  );
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map, transparent: true, toneMapped: false, depthWrite: false }));
  mesh.position.set(0, -CARD_H / 2 + BORDER + h / 2 - 0.012, 0.018);
  mesh.renderOrder = 3;
  mesh.userData.noShadow = true;
  return mesh;
}

const METAL_TEXT: Record<CardTier, string[]> = {
  legend: ["#fffbe6", "#f3cf6b", "#a8701a", "#ffe9a6"],
  elite: ["#ffffff", "#a5f3fc", "#c4b5fd", "#ffffff"],
  great: ["#ffffff", "#9df5d0", "#1fbf86", "#eafff6"],
  good: ["#ffffff", "#bfe6ff", "#3f9ff0", "#f0faff"],
  base: ["#14120d", "#14120d", "#14120d", "#14120d"],
};

function buildBadge(spec: CardSpec): THREE.Group {
  const { tier } = spec;
  const { c1 } = colors(spec);
  const g = new THREE.Group();
  const legend = tier === "legend";
  const w = legend ? 1.1 : 0.64;
  const h = legend ? 0.3 : 0.84;
  const x = w / 2;
  const y = h / 2;
  const pts = legend
    ? chamfer(w, h, 0.06)
    : ([[x, y], [-x, y], [-x, -y + 0.17], [0, -y], [x, -y + 0.17]] as const).map(([a, b]) => new THREE.Vector2(a, b));
  const rim: Record<CardTier, () => THREE.Material> = {
    legend: () => metal("gold"),
    elite: () => metal("silver", { color: "#dccfff" }),
    great: () => metal("gold"),
    good: () => metal("silver"),
    base: () => new THREE.MeshStandardMaterial({ color: c1, roughness: 0.6 }),
  };
  g.add(new THREE.Mesh(slabGeometry(pts, 0, 0.055, 0.016), rim[tier]()));
  const map = texture(
    makeCanvas(512, Math.round((512 * h) / w), (ctx, cw, ch) => {
      ctx.fillStyle = tier === "base" ? "#f3eddf" : legend ? "#1a0f03" : "#05070f";
      ctx.fillRect(0, 0, cw, ch);
      const s = METAL_TEXT[tier];
      const grad = ctx.createLinearGradient(0, 0, 0, ch * 0.7);
      grad.addColorStop(0.1, s[0]);
      grad.addColorStop(0.42, s[1]);
      grad.addColorStop(0.58, s[2]);
      grad.addColorStop(0.9, s[3]);
      ctx.fillStyle = grad;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      if (legend) {
        ctx.font = DISPLAY(800, 92);
        spaced(ctx, "LEYENDA", cw / 2, ch * 0.74, 16, "center");
        return;
      }
      if (typeof spec.overall === "number") {
        ctx.font = DISPLAY(800, 400);
        ctx.fillText(String(spec.overall), cw / 2, ch * 0.52);
      } else {
        // Aún sin partidos esta temporada: nunca la media del año pasado
        ctx.font = DISPLAY(800, 300);
        ctx.fillText("–", cw / 2, ch * 0.45);
      }
      ctx.fillStyle = tier === "base" ? "#14120d" : "#ffffffe0";
      ctx.font = DISPLAY(700, 92);
      spaced(ctx, "MEDIA", cw / 2, ch * 0.68, 16, "center");
    })
  );
  const face = new THREE.Mesh(faceGeometry(pts, w, h), new THREE.MeshBasicMaterial({ map, toneMapped: false }));
  face.scale.setScalar(legend ? 0.95 : 0.93);
  face.position.z = 0.057;
  g.add(face);
  if (legend) g.position.set(0, CARD_H / 2 - 0.36, 0.045);
  else g.position.set(-IW / 2 + x + 0.1, CARD_H / 2 - BORDER - y + 0.015, 0.05);
  return g;
}

function buildCrest(spec: CardSpec, image: CanvasImageSource): THREE.Group {
  const { tier } = spec;
  const { c1 } = colors(spec);
  const g = new THREE.Group();
  const r = 0.235;
  const ring = tier === "base" ? new THREE.MeshStandardMaterial({ color: c1, roughness: 0.6 }) : tier === "elite" ? metal("silver", { color: "#c9b8ff" }) : tier === "great" ? metal("gold") : metal("silver");
  g.add(new THREE.Mesh(slabGeometry(circle(r, 72), 0, 0.05, 0.016), ring));
  const map = texture(
    makeCanvas(384, 384, (ctx) => {
      ctx.fillStyle = tier === "base" ? "#f3eddf" : "#070b16";
      ctx.fillRect(0, 0, 384, 384);
      ctx.drawImage(image, 52, 52, 280, 280);
    })
  );
  const face = new THREE.Mesh(
    faceGeometry(circle(r * 0.88, 72), r * 2 * 0.88, r * 2 * 0.88),
    new THREE.MeshPhysicalMaterial({ map, roughness: 0.6, clearcoat: 0.25, clearcoatRoughness: 0.2, envMapIntensity: 0.5 })
  );
  face.position.z = 0.052;
  g.add(face);
  g.position.set(IW / 2 - r - 0.1, CARD_H / 2 - BORDER - r - 0.09, 0.02);
  return g;
}

// ---------------------------------------------------------------- sellos

function hexagon(r: number) {
  return Array.from({ length: 6 }, (_, i) => new THREE.Vector2(r * Math.cos(Math.PI / 6 + (i / 6) * TAU), r * Math.sin(Math.PI / 6 + (i / 6) * TAU)));
}

function star(r: number, inner = 0.58, n = 5) {
  return Array.from({ length: n * 2 }, (_, i) => {
    const k = i % 2 ? r * inner : r;
    const a = Math.PI / 2 + (i / (n * 2)) * TAU;
    return new THREE.Vector2(k * Math.cos(a), k * Math.sin(a));
  });
}

function diamond(r: number) {
  return ([[r * 0.82, 0], [0, r * 1.12], [-r * 0.82, 0], [0, -r * 1.12]] as const).map(([x, y]) => new THREE.Vector2(x, y));
}

/** Sello en relieve: hechos conocidos, nunca nada del último partido. */
export function buildSeal(seal: CardSeal): THREE.Group {
  const g = new THREE.Group();
  const r = 0.2;
  const text = (pts: THREE.Vector2[], w: number, bg: string, ink: string, big: string, small: string | null, mk = 0.8) => {
    const map = texture(
      makeCanvas(256, 256, (ctx) => {
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, 256, 256);
        ctx.fillStyle = ink;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        if (small) {
          ctx.font = DISPLAY(800, big.length > 1 ? 104 : 112);
          ctx.fillText(big, 128, 112);
          ctx.font = DISPLAY(800, 46);
          spaced(ctx, small, 128, 182, 3, "center");
        } else {
          ctx.font = DISPLAY(800, big.length > 1 ? 112 : 130);
          ctx.fillText(big, 128, 138);
        }
      })
    );
    const f = new THREE.Mesh(faceGeometry(pts, w, w), new THREE.MeshPhysicalMaterial({ map, roughness: 0.6, clearcoat: 0.2, clearcoatRoughness: 0.2, envMapIntensity: 0.4 }));
    f.scale.setScalar(mk);
    f.position.z = 0.072;
    g.add(f);
  };
  if (seal.kind === "rookie") {
    g.add(new THREE.Mesh(slabGeometry(hexagon(r * 1.08), 0, 0.07, 0.02), metal("silver", { color: "#ff9a4d", roughness: 0.24 })));
    text(hexagon(r * 1.08), r * 2.16, "#1a0b02", "#ffb27a", "RC", `’${String(seal.year).slice(-2)}`);
  } else if (seal.kind === "spain") {
    g.add(new THREE.Mesh(slabGeometry(circle(r), 0, 0.07, 0.02), metal("gold")));
    const map = texture(
      makeCanvas(256, 256, (ctx) => {
        ctx.fillStyle = "#c8102e";
        ctx.fillRect(0, 0, 256, 256);
        ctx.fillStyle = "#ffc400";
        ctx.fillRect(0, 64, 256, 128);
      })
    );
    const f = new THREE.Mesh(faceGeometry(circle(r * 0.84), r * 1.68, r * 1.68), new THREE.MeshPhysicalMaterial({ map, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05 }));
    f.position.z = 0.072;
    g.add(f);
  } else if (seal.kind === "ring") {
    const torus = new THREE.Mesh(new THREE.TorusGeometry(r * 0.82, 0.04, 16, 64), metal("gold"));
    torus.position.z = 0.05;
    g.add(torus, new THREE.Mesh(slabGeometry(circle(r * 0.8), 0, 0.05, 0.01), metal("dark", { color: "#120a02" })));
    text(circle(r * 0.8), r * 1.6, "#120a02", "#ffe39a", String(seal.count), null, 0.95);
  } else if (seal.kind === "mvp") {
    g.add(new THREE.Mesh(slabGeometry(diamond(r * 1.12), 0, 0.07, 0.024), metal("gold")));
    text(diamond(r * 1.12), r * 2.5, "#160c02", "#ffe9a6", String(seal.count), "MVP", 0.82);
  } else {
    g.add(new THREE.Mesh(slabGeometry(star(r * 1.2), 0, 0.07, 0.018), metal("silver", { color: "#ffd34d", roughness: 0.2 })));
    text(star(r * 1.2), r * 2.4, "#160c02", "#ffe9a6", String(seal.count), null, 0.8);
  }
  return g;
}

// ---------------------------------------------------------------- reverso

const BACK: Record<CardTier, { bg: [string, string]; ink: string; hi: string; soft: string; line: string }> = {
  legend: { bg: ["#4a2c0b", "#150b03"], ink: "#fde7ab", hi: "#f3cf6b", soft: "#c79a4a", line: "#f3cf6b" },
  elite: { bg: ["#2a1648", "#05060f"], ink: "#ffffff", hi: "#c4b5fd", soft: "#a5b4fc", line: "#a5f3fc" },
  great: { bg: ["#075c43", "#01120d"], ink: "#eafff6", hi: "#6ee7b7", soft: "#86c9b0", line: "#34d399" },
  good: { bg: ["#0d3f96", "#030c22"], ink: "#f0faff", hi: "#7dd3fc", soft: "#93b8e0", line: "#60a5fa" },
  base: { bg: ["#f6f1e4", "#e2dac6"], ink: "#1b1811", hi: "#0b5f2c", soft: "#6b6250", line: "#0b5f2c" },
};

export const BACK_WIDTH = 1024;
export const BACK_HEIGHT = Math.round((BACK_WIDTH * CARD_H) / CARD_W);

const decimal = (v: number) => v.toFixed(1).replace(".", ",");

/** Reverso en un canvas 2D: también es la versión plana del inspector (sin WebGL). */
export function drawBack(spec: CardSpec, values: number[] | null): HTMLCanvasElement {
  const s = BACK[spec.tier];
  const { first, last } = splitName(spec.name);
  const { back } = spec;
  return makeCanvas(BACK_WIDTH, BACK_HEIGHT, (ctx, cw, ch) => {
    const bg = ctx.createLinearGradient(0, 0, 0, ch);
    bg.addColorStop(0, s.bg[0]);
    bg.addColorStop(1, s.bg[1]);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cw, ch);
    // La huella, tenue, también detrás
    ctx.globalAlpha = spec.tier === "base" ? 0.14 : 0.22;
    ctx.strokeStyle = s.line;
    const huella = buildHuella(spec.tier, values ?? NEUTRAL);
    const scale = 400 / huella.radius;
    paintLayer(ctx, huella.main, { scale, unit: 2, ox: cw / 2 - huella.cx * scale, oy: 500 - huella.cy * scale });
    ctx.globalAlpha = 1;
    ctx.strokeStyle = s.hi;
    ctx.lineWidth = 3;
    ctx.strokeRect(58, 58, cw - 116, ch - 116);

    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = s.soft;
    ctx.font = DISPLAY(600, 42);
    if (first) spaced(ctx, first.toUpperCase(), 100, 150, 8);
    ctx.fillStyle = s.ink;
    const size = fit(ctx, last.toUpperCase(), 800, 118, 780);
    ctx.font = DISPLAY(800, size);
    ctx.fillText(last.toUpperCase(), 100, 250);
    ctx.fillStyle = s.hi;
    ctx.font = DISPLAY(600, 36);
    if (back.bio) spaced(ctx, back.bio.toUpperCase(), 100, 308, 2);

    // Radar (o palmarés en las leyendas)
    const cx = cw / 2;
    const cy = 578;
    const R = 170;
    for (const k of [1, 0.66, 0.33]) {
      ctx.strokeStyle = s.soft;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 2;
      ctx.beginPath();
      PEAKS.forEach((a, i) => (i ? ctx.lineTo(cx + Math.cos(a) * R * k, cy + Math.sin(a) * R * k) : ctx.moveTo(cx + Math.cos(a) * R * k, cy + Math.sin(a) * R * k)));
      ctx.closePath();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (values) {
      ctx.beginPath();
      PEAKS.forEach((a, i) => {
        const k = Math.max(0.04, values[i]);
        if (i) ctx.lineTo(cx + Math.cos(a) * R * k, cy + Math.sin(a) * R * k);
        else ctx.moveTo(cx + Math.cos(a) * R * k, cy + Math.sin(a) * R * k);
      });
      ctx.closePath();
      ctx.fillStyle = s.hi;
      ctx.globalAlpha = 0.32;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = s.hi;
      ctx.lineWidth = 5;
      ctx.stroke();
    } else {
      ctx.fillStyle = s.ink;
      ctx.font = DISPLAY(700, 40);
      ctx.textAlign = "center";
      ctx.fillText("AÚN NO HA JUGADO", cx, cy - 6);
      ctx.fillStyle = s.soft;
      ctx.font = DISPLAY(600, 30);
      ctx.fillText("ESTA TEMPORADA", cx, cy + 34);
      ctx.textAlign = "left";
    }
    PEAKS.forEach((a, i) => {
      const x = cx + Math.cos(a) * (R + 44);
      const y = cy + Math.sin(a) * (R + 40);
      const align = Math.abs(Math.cos(a)) < 0.1 ? "center" : Math.cos(a) > 0 ? "left" : "right";
      ctx.fillStyle = s.ink;
      ctx.font = DISPLAY(800, 50);
      ctx.textAlign = align;
      ctx.fillText(values ? String(back.values[i] ?? "–") : "–", x, y + 8);
      ctx.fillStyle = s.soft;
      ctx.font = DISPLAY(600, 29);
      spaced(ctx, (back.labels[i] ?? "").toUpperCase(), x, y + 42, 2, align);
    });
    ctx.textAlign = "left";

    // Temporadas
    let y = 900;
    const cols = [100, 320, 500, 640, 780, 924];
    ctx.font = DISPLAY(600, 30);
    ctx.fillStyle = s.soft;
    ["TEMPORADA", "EQUIPO", "PJ", "PTS", "REB", "AST"].forEach((t, i) => {
      ctx.textAlign = i < 2 ? "left" : "right";
      ctx.fillText(t, cols[i], y);
    });
    for (const row of back.rows) {
      y += 58;
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = s.soft;
      ctx.fillRect(100, y - 44, 824, 2);
      ctx.globalAlpha = 1;
      ctx.fillStyle = s.ink;
      row.forEach((v, i) => {
        ctx.font = DISPLAY(i === 3 ? 800 : 600, 40);
        ctx.textAlign = i < 2 ? "left" : "right";
        ctx.fillText(i > 2 ? decimal(Number(v)) : String(v), cols[i], y);
      });
    }
    if (back.rows.length === 0) {
      y += 58;
      ctx.fillStyle = s.soft;
      ctx.font = DISPLAY(600, 36);
      ctx.fillText("Sin temporadas guardadas todavía", 100, y);
    }
    ctx.textAlign = "left";
    y += 70;
    ctx.fillStyle = s.hi;
    ctx.font = DISPLAY(600, 36);
    for (const t of back.honours.slice(0, 3)) {
      ctx.fillText(t, 100, y);
      y += 46;
    }
    ctx.fillStyle = s.ink;
    ctx.font = DISPLAY(800, 44);
    ctx.textAlign = "right";
    ctx.fillText("HOOPMETER.COM", cw - 100, ch - 92);
  });
}

function buildBack(spec: CardSpec, values: number[] | null): THREE.Mesh {
  const map = texture(drawBack(spec, values));
  const face = new THREE.Mesh(
    faceGeometry(outline(spec.tier, CARD_W - 0.05, CARD_H - 0.05), CARD_W - 0.05, CARD_H - 0.05, true),
    new THREE.MeshPhysicalMaterial({ map, roughness: spec.tier === "base" ? 0.85 : 0.4, metalness: 0, clearcoat: 0, side: THREE.BackSide, envMapIntensity: 0.45 })
  );
  face.position.z = -0.174;
  return face;
}

/** Carta completa, de frente hacia +z y el reverso hacia −z. */
export function buildCard(spec: CardSpec, images: CardImages): THREE.Group {
  const values = spec.huella;
  const g = new THREE.Group();
  const slab = new THREE.Mesh(
    slabGeometry(outline(spec.tier, CARD_W - 0.02, CARD_H - 0.02), -0.172, -0.13, 0.004),
    spec.tier === "base" ? new THREE.MeshStandardMaterial({ color: "#ddd5c2", roughness: 0.95 }) : metal("dark", { color: "#0c111c" })
  );
  g.add(slab, buildArt(spec, values ?? NEUTRAL), buildFrame(spec), buildPlate(spec), buildBadge(spec));
  if (spec.team && images.crest) g.add(buildCrest(spec, images.crest));
  spec.seals.forEach((seal, i) => {
    const mesh = buildSeal(seal);
    mesh.position.set(IW / 2 - 0.21, (spec.team ? CARD_H / 2 - 0.9 : CARD_H / 2 - 0.92) - i * 0.5, 0.04);
    g.add(mesh);
  });
  shadowed(g);
  g.add(buildPhoto(spec, images.photo));
  g.add(buildBack(spec, values));
  return g;
}
