"use client";

// Logo Hoopmeter (E1) en 3D, con las mismas coordenadas que `assets/logo.svg` / `LogoMark.tsx`
// (1 unidad = 100 px del SVG, origen en su centro): balón esférico, arco blanco y las cinco pestañas.
// Y el logotipo: HOOP en blanco y METER en naranja, en Barlow Condensed ExtraBold extruida
// (solo los contornos de esas letras, en `hoopmeter-glyphs.json`, de la fuente con licencia OFL).

import { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { FontLoader, type FontData } from "three/examples/jsm/loaders/FontLoader.js";
import { Ball } from "@/components/trophies/trophy-kit";
import { BRAND } from "@/lib/brand";
import glyphs from "./hoopmeter-glyphs.json";

const svg = (x: number, y: number) => new THREE.Vector3((x - 256) / 100, (247 - y) / 100, 0);

const LASHES: { from: [number, number]; to: [number, number]; color: string }[] = [
  { from: [128.1, 287.3], to: [101.7, 325], color: "#ef4444" },
  { from: [191.9, 320.7], to: [176.7, 364.1], color: "#f59e0b" },
  { from: [256, 332], to: [256, 378], color: "#f59e0b" },
  { from: [320.1, 320.7], to: [335.3, 364.1], color: "#10b981" },
  { from: [383.9, 287.3], to: [410.3, 325], color: "#10b981" },
];

const plastic = (color: string) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.2 });

export function LogoMark3D() {
  const { arc, white, lashes } = useMemo(() => {
    const curve = new THREE.QuadraticBezierCurve3(svg(96, 262), svg(256, 402), svg(416, 262));
    return {
      arc: new THREE.TubeGeometry(curve, 96, 0.17, 24),
      white: plastic("#f8fafc"),
      lashes: LASHES.map(({ from, to, color }) => {
        const a = svg(...from);
        const b = svg(...to);
        const dir = b.clone().sub(a);
        return {
          position: a.clone().add(b).multiplyScalar(0.5).setZ(-0.04),
          length: dir.length(),
          rotation: Math.atan2(dir.y, dir.x) - Math.PI / 2,
          material: plastic(color),
        };
      }),
    };
  }, []);

  return (
    <group>
      <group position={svg(256, 172)}>
        <Ball r={0.7} />
      </group>
      <mesh geometry={arc} material={white} />
      {[svg(96, 262), svg(416, 262)].map((p, i) => (
        <mesh key={i} position={p} material={white}>
          <sphereGeometry args={[0.17, 24, 16]} />
        </mesh>
      ))}
      {lashes.map((l, i) => (
        <mesh key={i} position={l.position} rotation={[0, 0, l.rotation]} material={l.material}>
          <capsuleGeometry args={[0.14, l.length, 8, 20]} />
        </mesh>
      ))}
    </group>
  );
}

let font: ReturnType<FontLoader["parse"]> | null = null;

/** Una palabra extruida, letra a letra (con el espaciado `tracking-wide` del logotipo de la app). */
function wordGeometry(text: string, size: number, x0: number) {
  font ??= new FontLoader().parse(glyphs as unknown as FontData);
  const data = glyphs as unknown as { glyphs: Record<string, { ha: number }>; resolution: number };
  const tracking = size * 0.025;
  const parts: THREE.BufferGeometry[] = [];
  let x = x0;
  for (const ch of text) {
    const g = new THREE.ExtrudeGeometry(font.generateShapes(ch, size), {
      depth: size * 0.26,
      curveSegments: 8,
      bevelEnabled: true,
      bevelThickness: size * 0.035,
      bevelSize: size * 0.022,
      bevelSegments: 3,
    });
    g.translate(x, 0, -size * 0.13);
    parts.push(g);
    x += (data.glyphs[ch].ha / data.resolution) * size + tracking;
  }
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return { geometry: merged, end: x - tracking };
}

/** HOOPMETER en 3D, centrado en el origen (alto de las mayúsculas ≈ `size` × 0.7). */
export function Wordmark3D({ size = 1 }: { size?: number }) {
  const { lead, accent, white, orange } = useMemo(() => {
    const lead = wordGeometry(BRAND.lead.toUpperCase(), size, 0);
    const accent = wordGeometry(BRAND.accent.toUpperCase(), size, lead.end + size * 0.025);
    const width = accent.end;
    lead.geometry.translate(-width / 2, 0, 0);
    accent.geometry.translate(-width / 2, 0, 0);
    return { lead: lead.geometry, accent: accent.geometry, white: plastic("#f8fafc"), orange: plastic("#f97316") };
  }, [size]);
  useLayoutEffect(
    () => () => {
      lead.dispose();
      accent.dispose();
      white.dispose();
      orange.dispose();
    },
    [lead, accent, white, orange]
  );
  return (
    <group>
      <mesh geometry={lead} material={white} />
      <mesh geometry={accent} material={orange} />
    </group>
  );
}

/** Logo completo: el balón con el arco y, debajo (o al lado), HOOPMETER. */
export function LogoLockup3D({ layout = "stacked" }: { layout?: "stacked" | "inline" }) {
  if (layout === "inline") {
    return (
      <group>
        <group position={[-3.15, 0.05, 0]} scale={0.56}>
          <LogoMark3D />
        </group>
        <group position={[1.15, -0.46, 0]}>
          <Wordmark3D size={1.3} />
        </group>
      </group>
    );
  }
  return (
    <group>
      <group position={[0, 0.95, 0]}>
        <LogoMark3D />
      </group>
      <group position={[0, -1.75, 0]}>
        <Wordmark3D size={1.3} />
      </group>
    </group>
  );
}
