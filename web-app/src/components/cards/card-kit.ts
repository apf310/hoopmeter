// Piezas comunes de la carta 3D (Tarea 7.11, del prototipo aprobado el 25-nov): estudio de luces, texturas dibujadas
// en canvas, siluetas de cada material y metales. Solo navegador; Three.js llega con import dinámico.
import * as THREE from "three";
import type { CardTier } from "@/lib/player-card";

export const TAU = Math.PI * 2;

/** Familia de Barlow Condensed tal como la registra next/font. */
export function displayFamily(): string {
  if (typeof document === "undefined") return "sans-serif";
  const family = getComputedStyle(document.body).getPropertyValue("--font-barlow-condensed").trim();
  return family || "'Barlow Condensed', 'Arial Narrow', sans-serif";
}

let family = "";
export const DISPLAY = (weight: number, px: number) => `${weight} ${px}px ${(family ||= displayFamily())}`;

/** Carga los pesos de Barlow que usan las texturas (sin ellos, las letras salen con la de reserva). */
export async function loadCardFonts(): Promise<void> {
  await Promise.all([600, 700, 800].map((w) => document.fonts.load(DISPLAY(w, 40), "ABCÉŽŠĆ123").catch(() => [])));
}

export function makeCanvas(w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!, w, h);
  return c;
}

export function texture(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Texto con espaciado entre letras, centrado o alineado. */
export function spaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number, align: "left" | "center" | "right" = "left"): number {
  const chars = [...text];
  const width = chars.reduce((w, ch) => w + ctx.measureText(ch).width + spacing, -spacing);
  let cx = align === "center" ? x - width / 2 : align === "right" ? x - width : x;
  const before = ctx.textAlign;
  ctx.textAlign = "left";
  for (const ch of chars) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
  ctx.textAlign = before;
  return width;
}

/** Baja el tamaño hasta que el texto quepa. */
export function fit(ctx: CanvasRenderingContext2D, text: string, weight: number, px: number, max: number): number {
  let size = px;
  do {
    ctx.font = DISPLAY(weight, size);
    if (ctx.measureText(text).width <= max) break;
    size -= 2;
  } while (size > 10);
  return size;
}

// ---------------------------------------------------------------- estudio

/** Paneles de luz alrededor de la carta: reflejos de estudio en los metales (entorno PMREM). */
export function studio(renderer: THREE.WebGLRenderer): THREE.Texture {
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20), new THREE.MeshBasicMaterial({ color: "#0a0e18", side: THREE.BackSide })));
  const panel = (w: number, h: number, color: string, k: number, pos: [number, number, number], rot: [number, number, number]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.rotation.set(...rot);
    scene.add(m);
  };
  panel(8, 8, "#ffffff", 2.6, [0, 9, 0], [Math.PI / 2, 0, 0]);
  panel(1.6, 13, "#ffffff", 6, [-8, 2, 2], [0, Math.PI / 2, 0]);
  panel(1.2, 13, "#dbeafe", 4.2, [8, 2, -1], [0, -Math.PI / 2, 0]);
  panel(18, 3.4, "#e2e8f0", 1.2, [0, 6.6, 8.4], [0, Math.PI, 0]);
  panel(18, 2, "#94a3b8", 0.22, [0, -1, 9], [0, Math.PI, 0]);
  panel(1.4, 10, "#ffffff", 4, [-5, 2, 7], [0, Math.PI * 0.78, 0]);
  panel(1, 10, "#fff1e0", 3, [5.5, 2, 6.5], [0, -Math.PI * 0.78, 0]);
  panel(9, 1.6, "#f97316", 2, [0, -3, -9], [0, 0, 0]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const t = pmrem.fromScene(scene, 0.015).texture;
  pmrem.dispose();
  scene.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  });
  return t;
}

// ---------------------------------------------------------------- siluetas (centradas, en sentido antihorario)

const v2 = (x: number, y: number) => new THREE.Vector2(x, y);

/** Silueta de cada material, la misma que la carta de la página. `k` = escala de las esquinas. */
export function outline(kind: CardTier, w: number, h: number, k = 1): THREE.Vector2[] {
  const q = (w / 100) * k;
  const x = w / 2;
  const y = h / 2;
  const pts: THREE.Vector2[] = [];
  const add = (px: number, py: number) => pts.push(v2(px, py));
  if (kind === "legend") {
    const s = 3 * q;
    const corner = (sx: number, sy: number, flip: boolean) => {
      const list: [number, number][] = [
        [x, y - 3 * s],
        [x - s, y - 3 * s],
        [x - s, y - 2 * s],
        [x - 2 * s, y - 2 * s],
        [x - 2 * s, y - s],
        [x - 3 * s, y - s],
        [x - 3 * s, y],
      ];
      for (const [px, py] of flip ? list.reverse() : list) add(sx * px, sy * py);
    };
    corner(1, 1, false);
    corner(-1, 1, true);
    corner(-1, -1, false);
    corner(1, -1, true);
  } else if (kind === "elite") {
    const a = 5 * q;
    const n = 2 * q;
    const list: [number, number][] = [
      [x, -y + a], [x, -0.07 * h], [x - n, -0.045 * h], [x - n, 0.045 * h], [x, 0.07 * h], [x, y - a],
      [x - a, y], [0.14 * w, y], [0.11 * w, y - n], [-0.11 * w, y - n], [-0.14 * w, y], [-x + a, y],
      [-x, y - a], [-x, 0.07 * h], [-x + n, 0.045 * h], [-x + n, -0.045 * h], [-x, -0.07 * h], [-x, -y + a],
      [-x + a, -y], [-0.14 * w, -y], [-0.11 * w, -y + n], [0.11 * w, -y + n], [0.14 * w, -y], [x - a, -y],
    ];
    for (const [px, py] of list) add(px, py);
  } else if (kind === "great") {
    const a = 7 * q;
    for (const [px, py] of [[x, -y + a], [x, y - a], [x - a, y], [-x + a, y], [-x, y - a], [-x, -y + a], [-x + a, -y], [x - a, -y]]) add(px, py);
  } else if (kind === "good") {
    const a = 11 * q;
    for (const [px, py] of [[x, -y], [x, y - a], [x - a, y], [-x, y], [-x, -y + a], [-x + a, -y]]) add(px, py);
  } else {
    const r = 2.6 * q;
    for (const [cx, cy, from] of [[x - r, y - r, 0], [-x + r, y - r, 1], [-x + r, -y + r, 2], [x - r, -y + r, 3]])
      for (let i = 0; i <= 8; i++) {
        const t = (from + i / 8) * (Math.PI / 2);
        add(cx + r * Math.cos(t), cy + r * Math.sin(t));
      }
  }
  return pts;
}

/** Marco: silueta exterior con ventana, entre z0 y z1. */
export function frameGeometry(kind: CardTier, w: number, h: number, border: number, z0: number, z1: number, bevel = 0.02): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape(outline(kind, w, h));
  const hole = outline(kind, w - border * 2, h - border * 2, kind === "base" ? 0.6 : 0.94);
  shape.holes.push(new THREE.Path(hole.slice().reverse()));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: z1 - z0 - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.85,
    bevelOffset: -bevel * 0.85,
    bevelSegments: 4,
    curveSegments: 12,
  });
  g.translate(0, 0, z0 + bevel);
  return g;
}

/** Plancha maciza con la silueta. */
export function slabGeometry(points: THREE.Vector2[], z0: number, z1: number, bevel = 0.015, segments = 3): THREE.ExtrudeGeometry {
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(points), {
    depth: Math.max(0.001, z1 - z0 - bevel * 2),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: segments,
    curveSegments: 24,
  });
  g.translate(0, 0, z0 + bevel);
  return g;
}

/** Cara plana con la silueta y UV 0-1 sobre su caja (para texturas dibujadas a medida). */
export function faceGeometry(points: THREE.Vector2[], w: number, h: number, flip = false): THREE.ShapeGeometry {
  const g = new THREE.ShapeGeometry(new THREE.Shape(points), 16);
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, flip ? 1 - (p.getX(i) / w + 0.5) : p.getX(i) / w + 0.5, p.getY(i) / h + 0.5);
  return g;
}

export function circle(r: number, n = 64): THREE.Vector2[] {
  return Array.from({ length: n }, (_, i) => v2(r * Math.cos((i / n) * TAU), r * Math.sin((i / n) * TAU)));
}

export function chamfer(w: number, h: number, a: number): THREE.Vector2[] {
  const x = w / 2;
  const y = h / 2;
  return [[x, -y + a], [x, y - a], [x - a, y], [-x + a, y], [-x, y - a], [-x, -y + a], [-x + a, -y], [x - a, -y]].map(([px, py]) => v2(px, py));
}

// ---------------------------------------------------------------- materiales

const METALS = {
  gold: { color: "#f3bf58", roughness: 0.2 },
  silver: { color: "#e3e8f0", roughness: 0.17 },
  steel: { color: "#8f9bac", roughness: 0.3 },
  dark: { color: "#2b3342", roughness: 0.34 },
} as const;

export const metal = (name: keyof typeof METALS, extra: THREE.MeshPhysicalMaterialParameters = {}) =>
  new THREE.MeshPhysicalMaterial({ metalness: 1, ...METALS[name], ...extra });

export function shadowed<T extends THREE.Object3D>(object: T): T {
  object.traverse((o) => {
    if (o instanceof THREE.Mesh && !o.userData.noShadow) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return object;
}

/** Libera geometrías, materiales y texturas de un objeto. */
export function dispose(object: THREE.Object3D) {
  object.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.geometry.dispose();
    for (const m of ([] as THREE.Material[]).concat(o.material)) {
      for (const value of Object.values(m)) if (value instanceof THREE.Texture) value.dispose();
      m.dispose();
    }
    if (o.customDepthMaterial) o.customDepthMaterial.dispose();
  });
}
