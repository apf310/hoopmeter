"use client";

// Piezas comunes de los trofeos 3D: materiales (compartidos entre escenas), estudio de luces propio,
// balón con canales y texturas dibujadas en canvas (red de los trofeos, grabados, rótulos).

import { useMemo } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Metal } from "./trophy-catalog";

// ---------------------------------------------------------------------------
// Materiales

export const METAL_COLOR: Record<Metal, string> = { gold: "#f5c35c", silver: "#e4e8ef", bronze: "#d58d58", steel: "#aeb8c7" };
export const METAL_ROUGHNESS: Record<Metal, number> = { gold: 0.2, silver: 0.15, bronze: 0.28, steel: 0.3 };
const SEAM_COLOR: Record<Metal, string> = { gold: "#5a3a08", silver: "#3c424c", bronze: "#4a2611", steel: "#2f3742" };

const materials = new Map<string, THREE.Material>();
export function material<T extends THREE.Material>(key: string, make: () => T): T {
  let m = materials.get(key) as T | undefined;
  if (!m) {
    m = make();
    materials.set(key, m);
  }
  return m;
}

export const metalMat = (metal: Metal) =>
  material(`metal:${metal}`, () => new THREE.MeshStandardMaterial({ color: METAL_COLOR[metal], metalness: 1, roughness: METAL_ROUGHNESS[metal] }));
export const seamMat = (metal: Metal) =>
  material(`seam:${metal}`, () => new THREE.MeshStandardMaterial({ color: SEAM_COLOR[metal], metalness: 1, roughness: 0.55 }));
/** Plata satinada de los canales enmascarados (balón y red del Larry O'Brien). */
export const channelSilverMat = () =>
  material("channelSilver", () => new THREE.MeshStandardMaterial({ color: "#e9edf3", metalness: 1, roughness: 0.42 }));
export const graphiteMat = () =>
  material("graphite", () => new THREE.MeshPhysicalMaterial({ color: "#2a3140", metalness: 0.15, roughness: 0.45, clearcoat: 1, clearcoatRoughness: 0.12 }));
export const obsidianMat = () =>
  material("obsidian", () => new THREE.MeshPhysicalMaterial({ color: "#070b14", metalness: 0.2, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08 }));
/** Cerámica negra lacada (Copa NBA). */
export const ceramicMat = () =>
  material("ceramic", () => new THREE.MeshPhysicalMaterial({ color: "#0b0c10", metalness: 0.1, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06 }));
export const enamelMat = () =>
  material("enamel", () => new THREE.MeshPhysicalMaterial({ color: "#0d1830", metalness: 0.1, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.15 }));
export const leatherMat = () =>
  material("leather", () => new THREE.MeshPhysicalMaterial({ color: "#f97316", metalness: 0, roughness: 0.5, clearcoat: 0.6, clearcoatRoughness: 0.35 }));
export const leatherSeamMat = () => material("leatherSeam", () => new THREE.MeshStandardMaterial({ color: "#1a0c04", roughness: 0.8 }));
export const diamondMat = () =>
  material("diamond", () => new THREE.MeshStandardMaterial({ color: "#ffffff", metalness: 0.9, roughness: 0.05, envMapIntensity: 2.6, emissive: "#c7d2fe", emissiveIntensity: 0.35, flatShading: true }));
/** Cristal tallado: transmite (se ve lo de dentro, refractado) y las facetas reflejan el estudio. */
export const crystalMat = () =>
  material(
    "crystal",
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#ffffff",
        metalness: 0,
        roughness: 0.02,
        transmission: 1,
        // Poco espesor óptico: la figura se ve una vez y en su sitio (si no, cada faceta la desdobla)
        thickness: 0.06,
        ior: 1.5,
        dispersion: 0.35,
        clearcoat: 0.6,
        attenuationColor: new THREE.Color("#e6eef8"),
        attenuationDistance: 2.5,
        envMapIntensity: 2.6,
        emissive: new THREE.Color("#94a3b8"),
        emissiveIntensity: 0.09,
        flatShading: true,
      })
  );
/** Las tallas del cristal (la red): líneas más claras y mates. */
export const crystalCutMat = () =>
  material("crystalCut", () => new THREE.MeshStandardMaterial({ color: "#f4f8ff", metalness: 0, roughness: 0.18, transparent: true, opacity: 0.42, envMapIntensity: 2.2, depthWrite: false }));
export const ribbonMat = () => material("ribbon", () => new THREE.MeshStandardMaterial({ color: "#ea580c", roughness: 0.75 }));
export const ribbonStripeMat = () => material("ribbonStripe", () => new THREE.MeshStandardMaterial({ color: "#f8fafc", roughness: 0.75 }));
export const flameMat = () =>
  material("flame", () => new THREE.MeshStandardMaterial({ color: "#f97316", emissive: "#f97316", emissiveIntensity: 2.2, roughness: 1, toneMapped: false }));
export const flameCoreMat = () =>
  material("flameCore", () => new THREE.MeshStandardMaterial({ color: "#fde68a", emissive: "#fde68a", emissiveIntensity: 2.5, roughness: 1, toneMapped: false }));

// ---------------------------------------------------------------------------
// Estudio: entorno de luces propio (reflejos del metal), sin descargar HDR de ningún CDN

const studioCache = new WeakMap<THREE.WebGLRenderer, THREE.Texture>();

function studioEnvironment(gl: THREE.WebGLRenderer): THREE.Texture {
  const cached = studioCache.get(gl);
  if (cached) return cached;
  const scene = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20), new THREE.MeshBasicMaterial({ color: "#0a0e18", side: THREE.BackSide }));
  scene.add(room);
  const panel = (w: number, h: number, color: string, intensity: number, pos: [number, number, number], rot: [number, number, number]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.rotation.set(...rot);
    scene.add(m);
  };
  panel(7, 7, "#ffffff", 2.4, [0, 9, 0], [Math.PI / 2, 0, 0]); // softbox cenital
  panel(1.6, 12, "#ffffff", 5, [-8, 2, 2], [0, Math.PI / 2, 0]); // tira principal izquierda
  panel(1.2, 12, "#dbeafe", 3.5, [8, 2, -1], [0, -Math.PI / 2, 0]); // contra derecha, fría
  panel(18, 7, "#e2e8f0", 1.5, [0, 4.5, 9], [0, Math.PI, 0]); // gran relleno frontal: las caras planas reflejan luz, no negro
  panel(18, 3, "#94a3b8", 0.6, [0, -1.5, 9], [0, Math.PI, 0]); // horizonte más oscuro abajo (degradado en el metal)
  panel(2, 10, "#ffffff", 3, [-6, 2, 6], [0, Math.PI * 0.75, 0]); // tira delantera izquierda
  panel(2, 10, "#ffffff", 2.2, [6, 2, 6], [0, -Math.PI * 0.75, 0]); // tira delantera derecha
  panel(8, 1.5, "#f97316", 1.6, [0, -2, -9], [0, 0, 0]); // acento naranja de la marca, abajo detrás
  const pmrem = new THREE.PMREMGenerator(gl);
  const texture = pmrem.fromScene(scene, 0.02).texture;
  pmrem.dispose();
  scene.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  });
  studioCache.set(gl, texture);
  return texture;
}

/** Luces del estudio: entorno para los reflejos + una luz con sombra. Va dentro de cada `<Canvas>`. */
export function Studio() {
  const gl = useThree((s) => s.gl);
  const environment = useMemo(() => studioEnvironment(gl), [gl]);
  return (
    <>
      <primitive object={environment} attach="environment" />
      <ambientLight intensity={0.15} />
      <directionalLight position={[2.2, 6, 3.5]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0004} shadow-normalBias={0.025}>
        <orthographicCamera attach="shadow-camera" args={[-1.4, 1.4, 2.2, -0.8, 1, 14]} />
      </directionalLight>
    </>
  );
}

const backdrops = new Map<string, THREE.Texture>();

/**
 * Fondo del escenario dentro de la escena (el mismo degradado que el CSS de la vitrina: haz cenital,
 * halo del metal y reflejo en el suelo). Hace falta para el cristal: three refracta lo que hay en la
 * escena, y con el lienzo transparente el cristal se vería blanco lechoso.
 */
function stageBackdrop(glow: string): THREE.Texture {
  const cached = backdrops.get(glow);
  if (cached) return cached;
  const size = 512;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#020617";
  ctx.fillRect(0, 0, size, size);
  // Elipses en % del lienzo, como `radial-gradient(ellipse rx ry at cx cy)` (de abajo arriba)
  const ellipse = (cx: number, cy: number, rx: number, ry: number, color: string, stop: number) => {
    ctx.save();
    ctx.translate(cx * size, cy * size);
    ctx.scale(rx * size, ry * size);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, color);
    g.addColorStop(stop, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(-2, -2, 4, 4);
    ctx.restore();
  };
  ellipse(0.5, 0.91, 0.34, 0.07, glow, 0.75);
  ellipse(0.5, 0.4, 0.58, 0.52, glow, 0.7);
  ellipse(0.5, -0.08, 0.26, 0.75, "rgba(255,255,255,0.075)", 0.72);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  backdrops.set(glow, t);
  return t;
}

export function Backdrop({ glow }: { glow: string }) {
  return <primitive object={stageBackdrop(glow)} attach="background" />;
}

/** Cámara común: encuadra la peana y el trofeo (y ∈ [-0.5, 1.9]). */
export const TROPHY_CAMERA = { position: [0, 0.85, 6.4] as [number, number, number], fov: 25 };
export const TROPHY_LOOK_AT = new THREE.Vector3(0, 0.68, 0);

// ---------------------------------------------------------------------------
// Geometría

/** Balón con costuras o canales: las laterales como en el logo, ")(" vistas de frente. */
export function Ball({ r, metal, body, seam, seamWidth = 0.028 }: { r: number; metal?: Metal; body?: THREE.Material; seam?: THREE.Material; seamWidth?: number }) {
  const bodyMat = body ?? (metal ? metalMat(metal) : leatherMat());
  const seamM = seam ?? (metal ? seamMat(metal) : leatherSeamMat());
  const t = r * seamWidth;
  const rho = 0.95;
  const side = r * Math.sin(rho);
  const offset = r * Math.cos(rho);
  return (
    <group>
      <mesh material={bodyMat}>
        <sphereGeometry args={[r, 48, 32]} />
      </mesh>
      <mesh material={seamM} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[r - t * 0.55, t, 8, 96]} />
      </mesh>
      <mesh material={seamM} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[r - t * 0.55, t, 8, 96]} />
      </mesh>
      {[-1, 1].map((s) => {
        const ux = s * 0.929;
        const uz = 0.371;
        return (
          <mesh key={s} material={seamM} position={[ux * offset, 0, uz * offset]} rotation={[0, Math.atan2(ux, uz), 0]}>
            <torusGeometry args={[side - t * 0.3, t, 8, 80]} />
          </mesh>
        );
      })}
    </group>
  );
}

export function starShape(outer: number, inner: number, n = 5) {
  const shape = new THREE.Shape();
  for (let i = 0; i < n * 2; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / n;
    const r = i % 2 ? inner : outer;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  return shape;
}

export function extrude(shape: THREE.Shape | THREE.Shape[], depth: number, bevel: number, center = true) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 4,
    curveSegments: 32,
  });
  if (center) g.center();
  return g;
}

export function Star({ outer, inner, depth, bevel, mat }: { outer: number; inner: number; depth: number; bevel: number; mat: THREE.Material }) {
  const geometry = useMemo(() => extrude(starShape(outer, inner), depth, bevel), [outer, inner, depth, bevel]);
  return <mesh geometry={geometry} material={mat} />;
}

/** Superficie de revolución muestreada de forma uniforme en altura (para que la textura de red no se estire). */
export function lathe(radius: (t: number) => number, y0: number, y1: number, steps = 40, segments = 96, phiStart = 0) {
  const points = Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    return new THREE.Vector2(radius(t), y0 + (y1 - y0) * t);
  });
  return new THREE.LatheGeometry(points, segments, phiStart);
}

/** Ángulos (radianes, 0 = frente) de un polígono: corte de las piezas de cristal facetado. */
export type Polygon = number[];

/** Distancia al eje del polígono (de radio 1 en sus vértices) en la dirección `phi`. */
export function polygonRadius(poly: Polygon, phi: number) {
  const d = new THREE.Vector2(Math.sin(phi), Math.cos(phi));
  for (let i = 0; i < poly.length; i++) {
    const a = new THREE.Vector2(Math.sin(poly[i]), Math.cos(poly[i]));
    const b = new THREE.Vector2(Math.sin(poly[(i + 1) % poly.length]), Math.cos(poly[(i + 1) % poly.length]));
    const e = b.clone().sub(a);
    const den = d.cross(e);
    if (Math.abs(den) < 1e-9) continue;
    const t = a.cross(e) / den;
    const s = a.cross(d) / den;
    if (t > 0 && s >= -1e-6 && s <= 1 + 1e-6) return t;
  }
  return 1;
}

/** Sólido facetado: el polígono escalado a lo largo de un perfil [radio, altura], con tapas. */
export function loft(poly: Polygon, rings: [number, number][]) {
  const positions: number[] = [];
  const indices: number[] = [];
  const n = poly.length;
  for (const [r, y] of rings) {
    for (const a of poly) positions.push(r * Math.sin(a), y, r * Math.cos(a));
  }
  for (let j = 0; j < rings.length - 1; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * n + i;
      const b = j * n + ((i + 1) % n);
      // Sentido antihorario visto desde fuera: las normales miran hacia fuera
      indices.push(a, b, a + n, b, b + n, a + n);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  const flat = geo.toNonIndexed();
  geo.dispose();
  flat.computeVertexNormals();
  return flat;
}

/** Lathe de un perfil dado como pares [radio, altura]. */
export function profile(points: [number, number][], segments = 96, phiStart = 0) {
  return new THREE.LatheGeometry(
    points.map(([x, y]) => new THREE.Vector2(x, y)),
    segments,
    phiStart
  );
}

// ---------------------------------------------------------------------------
// Texturas en canvas

export function displayFont(): string {
  if (typeof document === "undefined") return "sans-serif";
  const family = getComputedStyle(document.body).getPropertyValue("--font-barlow-condensed").trim();
  return family || "'Barlow Condensed', sans-serif";
}

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
}

function texture(c: HTMLCanvasElement, srgb: boolean, repeatX = false) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeatX) t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/**
 * Red de rombos de los trofeos (canales grabados): `map` con el color del metal y el de los canales,
 * `bumpMap` (los canales, hundidos) y `roughnessMap` (canales satinados). Se repite sin costura alrededor.
 */
export function netMaterial(key: string, { base, line, cols, rows, width = 7, sag = 0.18, lineRoughness = 0.45 }: { base: string; line: string; cols: number; rows: number; width?: number; sag?: number; lineRoughness?: number }) {
  return material(`net:${key}`, () => {
    const W = 1024;
    const H = 1024;
    const [cMap, map] = canvas(W, H);
    const [cBump, bump] = canvas(W, H);
    const [cRough, rough] = canvas(W, H);
    map.fillStyle = base;
    map.fillRect(0, 0, W, H);
    bump.fillStyle = "#ffffff";
    bump.fillRect(0, 0, W, H);
    const r0 = Math.round(0.18 * 255);
    rough.fillStyle = `rgb(${r0},${r0},${r0})`;
    rough.fillRect(0, 0, W, H);
    const cw = W / cols;
    const draw = (ctx: CanvasRenderingContext2D, color: string, lw: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.lineCap = "round";
      for (const dir of [-1, 1]) {
        for (let k = -rows - 1; k <= cols + rows + 1; k++) {
          ctx.beginPath();
          for (let s = 0; s <= 48; s++) {
            const t = s / 48;
            // Los hilos de la red cuelgan un poco: curva suave entre nudos
            const x = (k + dir * t * rows) * cw + Math.sin(t * rows * Math.PI * 2) * cw * sag * 0.25;
            const y = (1 - t) * H;
            if (s === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }
    };
    draw(map, line, width);
    draw(bump, "#000000", width * 1.25);
    const r1 = Math.round(lineRoughness * 255);
    draw(rough, `rgb(${r1},${r1},${r1})`, width);
    return new THREE.MeshStandardMaterial({
      color: "#ffffff",
      metalness: 1,
      roughness: 1,
      map: texture(cMap, true, true),
      bumpMap: texture(cBump, false, true),
      bumpScale: 2,
      roughnessMap: texture(cRough, false, true),
      side: THREE.DoubleSide,
    });
  });
}

type BandOptions = {
  /** Texto (se repite alrededor si `repeat`). */
  lines: string[];
  /** Fondo y letra: metal grabado (fondo metal, letra oscura) o rótulo (fondo negro, letra dorada). */
  style: "engraved" | "gilded";
  metal?: Metal;
  width?: number;
  height?: number;
  repeat?: number;
  /** Separación entre repeticiones. */
  sep?: string;
  weight?: number;
};

/**
 * Banda de texto alrededor de una pieza cilíndrica (o una placa): grabado en el metal o letras doradas sobre negro.
 * El texto queda centrado en u = 0.5 (de frente si la geometría empieza en la espalda).
 */
export function bandMaterial(key: string, { lines, style, metal = "gold", width = 2048, height = 128, repeat = 1, sep = "   ·   ", weight = 700 }: BandOptions) {
  return material(`band:${key}`, () => {
    const [cMap, map] = canvas(width, height);
    const [cMetal, metalCtx] = canvas(width, height);
    const font = displayFont();
    const gilded = style === "gilded";
    map.fillStyle = gilded ? "#0b0c10" : "#ffffff";
    map.fillRect(0, 0, width, height);
    metalCtx.fillStyle = gilded ? "#262626" : "#ffffff";
    metalCtx.fillRect(0, 0, width, height);
    const rowH = height / lines.length;
    for (const ctx of [map, metalCtx]) {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
    }
    lines.forEach((text, i) => {
      const cell = width / repeat;
      let size = rowH * 0.62;
      const full = Array.from({ length: repeat }, () => text).join(sep);
      map.font = `${weight} ${size}px ${font}`;
      while (map.measureText(full).width > width * 0.96 && size > 8) {
        size -= 1;
        map.font = `${weight} ${size}px ${font}`;
      }
      metalCtx.font = map.font;
      for (let k = 0; k < repeat; k++) {
        const x = cell * (k + 0.5);
        const y = rowH * (i + 0.5);
        map.fillStyle = gilded ? METAL_COLOR[metal] : "#4a4a4a";
        map.fillText(text, x, y);
        metalCtx.fillStyle = gilded ? "#ffffff" : "#ffffff";
        metalCtx.fillText(text, x, y);
      }
    });
    const mapTexture = texture(cMap, true, true);
    if (gilded) {
      return new THREE.MeshPhysicalMaterial({
        color: "#ffffff",
        map: mapTexture,
        metalness: 1,
        metalnessMap: texture(cMetal, false, true),
        roughness: 0.25,
        clearcoat: 1,
        clearcoatRoughness: 0.1,
      });
    }
    return new THREE.MeshStandardMaterial({
      color: METAL_COLOR[metal],
      metalness: 1,
      roughness: METAL_ROUGHNESS[metal] + 0.06,
      map: mapTexture,
      bumpMap: mapTexture,
      bumpScale: 1.2,
    });
  });
}

/** Letras grabadas al ácido en el cristal (blancas y esmeriladas), en una placa transparente. */
export function etchedMaterial(key: string, rows: { text: string; weight: number; size: number }[], w = 512, h = 900) {
  return material(`etch:${key}`, () => {
    const [c, ctx] = canvas(w, h);
    const font = displayFont();
    ctx.clearRect(0, 0, w, h);
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#ffffff";
    const total = rows.reduce((sum, r) => sum + r.size * 0.92, 0);
    let y = h - total - 20;
    for (const row of rows) {
      let size = row.size;
      ctx.font = `${row.weight} ${size}px ${font}`;
      while (ctx.measureText(row.text).width > w * 0.94 && size > 10) {
        size -= 2;
        ctx.font = `${row.weight} ${size}px ${font}`;
      }
      y += row.size * 0.92;
      ctx.globalAlpha = row.weight >= 700 ? 0.95 : 0.7;
      ctx.fillText(row.text, w / 2, y);
    }
    return new THREE.MeshBasicMaterial({ map: texture(c, true), transparent: true, depthWrite: false, toneMapped: false, opacity: 0.85 });
  });
}

/** Mapa equirectangular (para esferas): `draw` pinta sobre el lienzo; u = 0.25 es el frente (+z). */
export function sphereMaterial(key: string, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, params: THREE.MeshPhysicalMaterialParameters) {
  return material(`sphere:${key}`, () => {
    const [c, ctx] = canvas(2048, 1024);
    draw(ctx, 2048, 1024);
    return new THREE.MeshPhysicalMaterial({ ...params, map: texture(c, true, true) });
  });
}
