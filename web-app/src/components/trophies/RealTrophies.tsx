"use client";

// Los trofeos reales de la NBA, modelados en código a partir de las fotos oficiales (proporciones,
// materiales y detalles). Sin el logo de la NBA ni marcas de patrocinadores. Escala: el trofeo se
// apoya en y = 0 (encima de la peana de la vitrina) y llega a y ≈ 1.6-1.8.

import { useLayoutEffect, useMemo, useRef } from "react";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { figureGeometry, type FigurePose } from "./figure";
import {
  Ball,
  bandMaterial,
  ceramicMat,
  channelSilverMat,
  crystalCutMat,
  crystalMat,
  diamondMat,
  displayFont,
  etchedMaterial,
  lathe,
  loft,
  material,
  METAL_COLOR,
  metalMat,
  netMaterial,
  obsidianMat,
  polygonRadius,
  profile,
  sphereMaterial,
  starShape,
} from "./trophy-kit";

const goldDouble = () =>
  material("goldDouble", () => new THREE.MeshStandardMaterial({ color: METAL_COLOR.gold, metalness: 1, roughness: 0.18, side: THREE.DoubleSide }));
const ceramicDouble = () =>
  material("ceramicDouble", () => new THREE.MeshPhysicalMaterial({ color: "#0b0c10", metalness: 0.1, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06, side: THREE.DoubleSide }));
const obsidianFacets = () =>
  material("obsidianFacets", () => new THREE.MeshPhysicalMaterial({ color: "#06080d", metalness: 0.25, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.05, flatShading: true }));
/** Cristal estriado del Kobe Bryant Trophy: algo más luminoso (si no, sobre el fondo oscuro se ve negro). */
const kobeCrystal = () =>
  material("kobeCrystal", () => {
    const m = (crystalMat() as THREE.MeshPhysicalMaterial).clone();
    m.emissiveIntensity = 0.22;
    m.envMapIntensity = 3.2;
    return m;
  });
/** Oro vermeil con los canales de plata de la red (Larry O'Brien y Bill Russell). */
const goldNet = () => netMaterial("goldSilver", { base: METAL_COLOR.gold, line: "#e8ecf2", cols: 9, rows: 4, width: 8 });
/** Red dorada en relieve (Larry Bird y Magic Johnson). */
const goldRelief = () => netMaterial("goldRelief", { base: METAL_COLOR.gold, line: "#a87a26", cols: 12, rows: 5, width: 6, lineRoughness: 0.32 });

/** Libera las geometrías creadas con useMemo al desmontar. */
function useDispose(...geometries: (THREE.BufferGeometry | undefined)[]) {
  useLayoutEffect(
    () => () => geometries.forEach((g) => g?.dispose()),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se crean una vez por montaje
    []
  );
}

/** Banda cilíndrica con texto (abierta), con el texto centrado de frente. */
function Band({ r, y, h, mat }: { r: number; y: number; h: number; mat: THREE.Material }) {
  return (
    <mesh position={[0, y, 0]} material={mat}>
      <cylinderGeometry args={[r, r, h, 128, 1, true, Math.PI]} />
    </mesh>
  );
}

function Rim({ r, y, tube = 0.012, mat }: { r: number; y: number; tube?: number; mat?: THREE.Material }) {
  return (
    <mesh position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} material={mat ?? metalMat("gold")}>
      <torusGeometry args={[r, tube, 12, 96]} />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// Larry O'Brien Trophy (campeón): balón de oro con canales de plata sobre la red, inclinada hacia
// delante, y base de dos discos con los campeones grabados.

const CHAMPION_YEARS = Array.from({ length: 75 }, (_, i) => String(1947 + i));
const NEW_ERA_YEARS = ["2022", "2023", "2024", "2025", "2026"];

export function LarryOBrienTrophy() {
  const g = useMemo(
    () => ({
      lower: profile([
        [0, 0],
        [0.4, 0],
        [0.418, 0.012],
        [0.418, 0.073],
        [0.405, 0.085],
        [0, 0.085],
      ]),
      upper: profile([
        [0, 0.085],
        [0.322, 0.085],
        [0.335, 0.096],
        [0.335, 0.176],
        [0.322, 0.188],
        [0, 0.188],
      ]),
      collar: profile([
        [0, 0.186],
        [0.165, 0.186],
        [0.17, 0.196],
        [0.15, 0.21],
        [0.133, 0.228],
        [0, 0.228],
      ]),
      body: lathe((t) => 0.128 + 0.112 * Math.pow(t, 1.35), 0.2, 1.12),
    }),
    []
  );
  useDispose(g.lower, g.upper, g.collar, g.body);
  const gold = metalMat("gold");
  return (
    <group>
      <mesh geometry={g.lower} material={gold} />
      <Band r={0.4185} y={0.043} h={0.05} mat={bandMaterial("lob-new", { lines: [NEW_ERA_YEARS.join("    ")], style: "engraved", width: 4096, height: 110 })} />
      <mesh geometry={g.upper} material={gold} />
      <Band
        r={0.3355}
        y={0.136}
        h={0.07}
        mat={bandMaterial("lob-champions", {
          lines: [CHAMPION_YEARS.slice(0, 38).join("  "), CHAMPION_YEARS.slice(38).join("  ")],
          style: "engraved",
          width: 4096,
          height: 170,
        })}
      />
      <mesh geometry={g.collar} material={gold} />
      {/* La red y el balón, inclinados hacia delante */}
      <group position={[0, 0.2, 0]} rotation={[0.07, 0, 0]}>
        <group position={[0, -0.2, 0]}>
          <mesh geometry={g.body} material={goldNet()} />
          <Rim r={0.24} y={1.12} />
          <group position={[0, 1.3, 0.025]} rotation={[0.35, 0.55, 0.2]}>
            <Ball r={0.3} body={gold} seam={channelSilverMat()} seamWidth={0.026} />
          </group>
        </group>
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Bill Russell Trophy (MVP de las Finales): balón de oro sobre una copa de red, todo en vermeil.

export function BillRussellTrophy() {
  const g = useMemo(
    () => ({
      base: profile([
        [0, 0],
        [0.29, 0],
        [0.3, 0.01],
        [0.3, 0.05],
        [0.285, 0.058],
        [0.272, 0.06],
        [0.272, 0.125],
        [0.25, 0.13],
        [0.235, 0.15],
        [0.17, 0.165],
        [0.12, 0.19],
        [0, 0.19],
      ]),
      body: lathe((t) => 0.07 + 0.17 * Math.pow(t, 2.2), 0.19, 1.02),
    }),
    []
  );
  useDispose(g.base, g.body);
  const gold = metalMat("gold");
  return (
    <group scale={1.12}>
      <mesh geometry={g.base} material={gold} />
      <Band r={0.2725} y={0.0925} h={0.05} mat={bandMaterial("russell", { lines: ["THE BILL RUSSELL TROPHY"], style: "engraved", repeat: 2, width: 2048, height: 96 })} />
      <Rim r={0.085} y={0.24} tube={0.02} />
      <mesh geometry={g.body} material={goldNet()} />
      <Rim r={0.24} y={1.02} />
      <group position={[0, 1.145, 0]} rotation={[0.25, -0.5, 0.15]}>
        <Ball r={0.27} body={gold} seam={channelSilverMat()} seamWidth={0.032} />
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Larry Bird Trophy y Magic Johnson Trophy (MVP de las finales de conferencia): balón de plata
// sobre una copa de red dorada y base negra.

export function ConferenceMvpTrophy({ name }: { name: string }) {
  const g = useMemo(
    () => ({
      base: profile([
        [0, 0],
        [0.25, 0],
        [0.262, 0.012],
        [0.262, 0.082],
        [0.25, 0.094],
        [0, 0.094],
      ]),
      plate: profile([
        [0, 0.092],
        [0.232, 0.092],
        [0.236, 0.1],
        [0.236, 0.108],
        [0, 0.108],
      ]),
      collar: profile([
        [0, 0.106],
        [0.13, 0.106],
        [0.12, 0.122],
        [0.09, 0.14],
        [0.07, 0.16],
        [0, 0.16],
      ]),
      body: lathe((t) => 0.058 + 0.16 * Math.pow(t, 2), 0.15, 0.92),
    }),
    []
  );
  useDispose(g.base, g.plate, g.collar, g.body);
  const gold = metalMat("gold");
  return (
    <group scale={1.25}>
      <mesh geometry={g.base} material={obsidianMat()} />
      <Band r={0.2625} y={0.047} h={0.05} mat={bandMaterial(`conf:${name}`, { lines: [`THE ${name.toUpperCase()}`], style: "gilded", repeat: 2, width: 2048, height: 96 })} />
      <Rim r={0.256} y={0.006} tube={0.007} />
      <mesh geometry={g.plate} material={gold} />
      <mesh geometry={g.collar} material={gold} />
      <mesh geometry={g.body} material={goldRelief()} />
      <Rim r={0.218} y={0.92} tube={0.011} />
      <group position={[0, 1.02, 0]} rotation={[0.3, 0.4, -0.2]}>
        <Ball r={0.24} metal="silver" />
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Michael Jordan Trophy (MVP): figura de bronce que sale de una roca y se estira hacia un balón de
// cristal, sobre una base negra de cinco lados inclinada 15°. La pátina va de bruto (abajo) a pulido.

const BASE_H = 0.24;

export function JordanTrophy() {
  const g = useMemo(() => {
    // Base: tronco de pirámide de cinco caras, con la tapa inclinada 15° (más alta detrás)
    const base = new THREE.CylinderGeometry(0.36, 0.46, BASE_H, 5, 1, false, -Math.PI / 5);
    base.translate(0, BASE_H / 2, 0);
    const pos = base.attributes.position;
    const slope = Math.tan((15 * Math.PI) / 180);
    const front = 0.36 * Math.cos(Math.PI / 5);
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) > BASE_H - 1e-4) pos.setY(i, pos.getY(i) + (front - pos.getZ(i)) * slope);
    }
    base.computeVertexNormals();

    // La escultura: figura y roca en una sola pieza, de bruto (abajo) a pulido (arriba)
    const figure = figureGeometry("reach", 144, true);

    // Placa de seis lados, alargada
    const hex = new THREE.Shape();
    hex.moveTo(-0.165, 0);
    hex.lineTo(-0.135, 0.05);
    hex.lineTo(0.135, 0.05);
    hex.lineTo(0.165, 0);
    hex.lineTo(0.135, -0.05);
    hex.lineTo(-0.135, -0.05);
    hex.closePath();
    const badge = new THREE.ExtrudeGeometry(hex, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2 });
    return { base, figure, badge };
  }, []);
  useDispose(g.base, g.badge);
  const bronze = useMemo(() => {
    // Bronce: el atributo `polish` lleva la rugosidad de mate (bruto) a espejo (pulido)
    const m = new THREE.MeshStandardMaterial({ color: METAL_COLOR.gold, vertexColors: true, metalness: 1, roughness: 0.2 });
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float polish;\nvarying float vPolish;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvPolish = polish;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vPolish;")
        .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(0.62, roughnessFactor, vPolish);");
    };
    m.customProgramCacheKey = () => "bronze-polish";
    return m;
  }, []);
  useLayoutEffect(() => () => bronze.dispose(), [bronze]);

  // Figura alargada, como la escultura: más alta y más estrecha que una persona
  const s = new THREE.Vector3(0.86, 1.18, 0.86);
  const feet = 0.2;
  const hand = g.figure.reachHand.clone().multiply(s).add(new THREE.Vector3(0, feet, 0.02));
  // Cara frontal de la base: inclinada hacia atrás por el tronco de pirámide
  const faceTilt = Math.atan(((0.46 - 0.36) * Math.cos(Math.PI / 5)) / BASE_H);
  return (
    <group>
      <mesh geometry={g.base} material={obsidianFacets()} />
      <group position={[0, 0.115, 0.334]} rotation={[-faceTilt, 0, 0]}>
        <mesh geometry={g.badge} material={metalMat("gold")} position={[0, 0, -0.006]} />
        <mesh position={[0, 0, 0.0095]} material={bandMaterial("jordan-badge", { lines: ["THE MICHAEL JORDAN TROPHY", "MOST VALUABLE PLAYER"], style: "gilded", width: 1024, height: 220 })}>
          <planeGeometry args={[0.27, 0.075]} />
        </mesh>
      </group>
      <mesh geometry={g.figure.geometry} material={bronze} position={[0, feet, 0.02]} scale={s} />
      <mesh position={[hand.x, hand.y + 0.09, hand.z]} rotation={[0.3, 0.5, 0.1]} material={diamondMat()} userData={{ noShadow: true }}>
        <icosahedronGeometry args={[0.088, 1]} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Trofeos de cristal (Hakeem Olajuwon, Wilt Chamberlain, John Havlicek, George Mikan, Jerry West y
// Joe Dumars): una red tallada en un bloque de cristal de 15", con la figura dorada dentro y el
// nombre grabado abajo en la cara frontal, que es plana.

// Corte: cara frontal ancha y plana (por ella se ve la figura), biseles a los lados y trasera igual
const CUT_DEG = [30, 68, 112, 150, 210, 248, 292, 330];
const CUT = CUT_DEG.map((d) => (d * Math.PI) / 180);

const CRYSTAL: [number, number][] = [
  [0, 0],
  [0.262, 0],
  [0.282, 0.028],
  [0.272, 0.15],
  [0.256, 0.4],
  [0.252, 0.62],
  [0.268, 0.86],
  [0.305, 1.1],
  [0.352, 1.34],
  [0.382, 1.5],
  [0.374, 1.545],
  [0.33, 1.56],
  [0, 1.56],
];
function crystalRadius(y: number) {
  for (let i = 1; i < CRYSTAL.length - 2; i++) {
    const [r0, y0] = CRYSTAL[i];
    const [r1, y1] = CRYSTAL[i + 1];
    if (y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0 || 1);
  }
  return CRYSTAL[CRYSTAL.length - 3][0];
}

/** Palabras en renglones de como mucho `max` letras. */
function wrap(text: string, max: number) {
  const out: string[] = [];
  for (const word of text.toUpperCase().split(" ")) {
    const last = out[out.length - 1];
    if (last && last.length + word.length + 1 <= max) out[out.length - 1] = `${last} ${word}`;
    else out.push(word);
  }
  return out;
}

export function CrystalTrophy({ pose, label, award }: { pose: FigurePose; label: string; award: string }) {
  const g = useMemo(() => {
    const body = loft(CUT, CRYSTAL);
    // Tallas de la red: hélices en los dos sentidos que forman rombos sobre las caras
    const cuts: THREE.BufferGeometry[] = [];
    for (const sense of [-1, 1]) {
      for (let k = 0; k < 8; k++) {
        const points = Array.from({ length: 41 }, (_, i) => {
          const t = i / 40;
          const y = 0.035 + t * 1.47;
          const phi = (k * Math.PI * 2) / 8 + sense * t * Math.PI * 0.55;
          const r = polygonRadius(CUT, phi) * crystalRadius(y) + 0.0025;
          return new THREE.Vector3(r * Math.sin(phi), y, r * Math.cos(phi));
        });
        cuts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 80, 0.0055, 4, false));
      }
    }
    // Aristas del tallado: los cantos verticales brillan como en las fotos
    for (const a of CUT) {
      const points = CRYSTAL.slice(2, -2).map(([r, y]) => new THREE.Vector3(r * Math.sin(a), y, r * Math.cos(a)));
      cuts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.1), 60, 0.0045, 4, false));
    }
    const net = mergeGeometries(cuts);
    cuts.forEach((c) => c.dispose());
    const figure = figureGeometry(pose, 96).geometry;
    const box = figure.boundingBox!;
    const w = box.max.x - box.min.x;
    const h = box.max.y - box.min.y;
    const scale = Math.min(0.56 / h, 0.44 / w);
    return { body, net, figure, scale, h: h * scale };
  }, [pose]);
  useDispose(g.body, g.net);

  const etch = etchedMaterial(`${label}|${award}`, [
    ...["THE", ...wrap(label, 12)].map((text) => ({ text, weight: 500, size: 58 })),
    ...wrap(award, 11).map((text) => ({ text, weight: 800, size: 86 })),
  ]);
  const tilt = Math.atan(((0.272 - 0.256) / 0.25) * Math.cos(CUT[0]));
  return (
    <group>
      <mesh geometry={g.figure} material={metalMat("gold")} position={[0, 1.13 - g.h / 2, 0]} scale={g.scale} />
      <mesh geometry={g.body} material={crystalMat()} userData={{ noShadow: true }} />
      <mesh geometry={g.net} material={crystalCutMat()} userData={{ noShadow: true }} />
      <mesh position={[0, 0.24, crystalRadius(0.24) * Math.cos(CUT[0]) + 0.002]} rotation={[-tilt, 0, 0]} material={etch} userData={{ noShadow: true }}>
        <planeGeometry args={[0.18, 0.316]} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Kobe Bryant Trophy (MVP del All-Star): torre de cristal estriado en cuatro niveles sobre una
// base negra de ocho lados con 18 estrellas alrededor.

const KOBE_TIERS: { n: number; outer: number; inner: number; y: number; h: number }[] = [
  { n: 24, outer: 0.36, inner: 0.338, y: 0.24, h: 0.8 },
  { n: 18, outer: 0.276, inner: 0.258, y: 1.05, h: 0.25 },
  { n: 12, outer: 0.186, inner: 0.172, y: 1.31, h: 0.22 },
  { n: 5, outer: 0.108, inner: 0.07, y: 1.54, h: 0.17 },
];

export function KobeTrophy() {
  // Filo brillante en el borde de arriba de cada nivel
  const rims = useMemo(() => {
    const lines = KOBE_TIERS.map(({ n, outer, inner, y, h }) => {
      const pts = starShape(outer + 0.004, inner + 0.004, n)
        .getPoints(1)
        .map((p) => new THREE.Vector3(p.x, y + h + 0.006, -p.y));
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true, "catmullrom", 0), n * 8, 0.004, 4, true);
    });
    const merged = mergeGeometries(lines);
    lines.forEach((l) => l.dispose());
    return merged;
  }, []);
  const tiers = useMemo(
    () =>
      KOBE_TIERS.map(({ n, outer, inner, y, h }) => {
        const geo = new THREE.ExtrudeGeometry(starShape(outer, inner, n), {
          depth: h,
          bevelEnabled: true,
          bevelThickness: 0.008,
          bevelSize: 0.006,
          bevelSegments: 1,
          curveSegments: 1,
        });
        geo.rotateX(-Math.PI / 2);
        geo.translate(0, y, 0);
        return geo;
      }),
    []
  );
  useDispose(rims, ...tiers);
  const apothem = 0.41 * Math.cos(Math.PI / 8);
  const text = bandMaterial("kobe-text", { lines: ["THE KOBE BRYANT TROPHY", "ALL-STAR GAME", "MOST VALUABLE PLAYER"], style: "gilded", width: 1024, height: 300 });
  const stars = bandMaterial("kobe-stars", { lines: ["★  ★  ★"], style: "gilded", metal: "silver", width: 512, height: 128 });
  return (
    <group>
      <mesh material={obsidianFacets()} position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.41, 0.41, 0.24, 8, 1, false, Math.PI / 8]} />
      </mesh>
      {Array.from({ length: 8 }, (_, k) => (
        <group key={k} rotation={[0, (k * Math.PI) / 4, 0]}>
          <mesh position={[0, 0.12, apothem + 0.002]} material={k % 4 === 0 ? text : stars} userData={{ noShadow: true }}>
            <planeGeometry args={k % 4 === 0 ? [0.29, 0.13] : [0.24, 0.06]} />
          </mesh>
        </group>
      ))}
      {tiers.map((geo, i) => (
        <mesh key={i} geometry={geo} material={kobeCrystal()} userData={{ noShadow: true }} />
      ))}
      <mesh geometry={rims} material={crystalCutMat()} userData={{ noShadow: true }} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// MVP de la Copa NBA: dos tallos dorados sostienen un balón abierto de paneles negros con
// filo dorado, sobre una base negra y dorada.

function bladeGeometry(side: 1 | -1) {
  const U = 18;
  const V = 28;
  const y0 = 0.255;
  const y1 = 1.14;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let j = 0; j <= V; j++) {
    const v = j / V;
    // Medio cilindro (su mitad izquierda o derecha) con los cantos de delante y de detrás
    // recortados en diagonal: abajo casi se tocan en el centro, arriba quedan dos tiras finas
    const front = 0.2 + 1.05 * v;
    const back = Math.PI - front;
    const r = 0.2 - 0.025 * v;
    for (let i = 0; i <= U; i++) {
      const phi = front + (back - front) * (i / U);
      positions.push(side * r * Math.sin(phi), y0 + (y1 - y0) * v, r * Math.cos(phi));
    }
  }
  for (let j = 0; j < V; j++) {
    for (let i = 0; i < U; i++) {
      const a = j * (U + 1) + i;
      indices.push(a, a + 1, a + U + 1, a + 1, a + U + 2, a + U + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function CupMvpTrophy() {
  const g = useMemo(
    () => ({
      bottom: profile([
        [0, 0],
        [0.33, 0],
        [0.34, 0.01],
        [0.34, 0.042],
        [0.33, 0.052],
        [0, 0.052],
      ]),
      top: profile([
        [0, 0.19],
        [0.27, 0.19],
        [0.276, 0.2],
        [0.276, 0.232],
        [0.266, 0.242],
        [0, 0.242],
      ]),
      plate: profile([
        [0, 0.24],
        [0.215, 0.24],
        [0.222, 0.247],
        [0.222, 0.258],
        [0, 0.258],
      ]),
      blades: [bladeGeometry(1), bladeGeometry(-1)],
    }),
    []
  );
  useDispose(g.bottom, g.top, g.plate, ...g.blades);
  const gold = metalMat("gold");
  const R = 0.29;
  const panels = useMemo(() => {
    const out: { key: string; dir: THREE.Vector3; phiStart: number; thetaStart: number }[] = [];
    for (let q = 0; q < 4; q++) {
      for (const lower of [false, true]) {
        const phiMid = q * (Math.PI / 2) + Math.PI / 4;
        const thetaMid = lower ? (3 * Math.PI) / 4 : Math.PI / 4;
        out.push({
          key: `${q}${lower}`,
          dir: new THREE.Vector3(-Math.cos(phiMid) * Math.sin(thetaMid), Math.cos(thetaMid), Math.sin(phiMid) * Math.sin(thetaMid)),
          phiStart: q * (Math.PI / 2),
          thetaStart: lower ? Math.PI / 2 : 0,
        });
      }
    }
    return out;
  }, []);
  return (
    <group>
      <mesh geometry={g.bottom} material={ceramicMat()} />
      <Rim r={0.335} y={0.047} tube={0.006} />
      <Band r={0.305} y={0.121} h={0.138} mat={bandMaterial("cupmvp", { lines: ["NBA CUP MOST VALUABLE PLAYER"], style: "gilded", repeat: 2, width: 2048, height: 120 })} />
      <Rim r={0.305} y={0.19} tube={0.008} />
      <mesh geometry={g.top} material={ceramicMat()} />
      <mesh geometry={g.plate} material={gold} />
      {g.blades.map((b, i) => (
        <mesh key={i} geometry={b} material={goldDouble()} />
      ))}
      {/* Balón abierto: ocho paneles separados del centro, con filo dorado */}
      <group position={[0, 1.38, 0]}>
        {panels.map((p) => (
          <group key={p.key} position={p.dir.clone().multiplyScalar(0.045)}>
            <mesh material={goldDouble()}>
              <sphereGeometry args={[R - 0.004, 14, 10, p.phiStart + 0.05, Math.PI / 2 - 0.1, p.thetaStart + 0.05, Math.PI / 2 - 0.1]} />
            </mesh>
            <mesh material={ceramicDouble()}>
              <sphereGeometry args={[R, 14, 10, p.phiStart + 0.09, Math.PI / 2 - 0.18, p.thetaStart + 0.09, Math.PI / 2 - 0.18]} />
            </mesh>
          </group>
        ))}
        <mesh material={gold}>
          <torusGeometry args={[R * 0.9, 0.012, 10, 80]} />
        </mesh>
        <mesh material={gold} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[R * 0.9, 0.012, 10, 80]} />
        </mesh>
        <mesh material={gold} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[R * 0.9, 0.012, 10, 80]} />
        </mesh>
        <mesh material={gold}>
          <sphereGeometry args={[0.04, 16, 12]} />
        </mesh>
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Quinteto ideal de la Copa NBA: balón de cristal negro con canales dorados y el cuadro del torneo.

function drawCupBall(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = "#07080b";
  ctx.fillRect(0, 0, w, h);
  // Cuadro de eliminatorias en el casquete superior
  ctx.strokeStyle = "#4a5160";
  ctx.lineWidth = 3;
  for (let row = 0; row < 7; row++) {
    const y = 22 + row * 40;
    const cell = 86 - row * 4;
    for (let x = (row % 2) * (cell / 2); x < w; x += cell) {
      ctx.strokeRect(x + 6, y, cell - 22, 24);
      ctx.beginPath();
      ctx.moveTo(x + cell - 16, y + 12);
      ctx.lineTo(x + cell - 4, y + 12);
      ctx.stroke();
    }
  }
  // Rótulo de frente (u = 0 con el balón girado: se dibuja en los dos bordes)
  ctx.fillStyle = METAL_COLOR.gold;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const font = getComputedStyle(document.body).getPropertyValue("--font-barlow-condensed").trim() || "sans-serif";
  for (const cx of [0, w]) {
    ctx.font = `800 64px ${font}`;
    ctx.fillText("NBA CUP", cx, 600);
    ctx.font = `800 46px ${font}`;
    ctx.fillText("ALL-TOURNAMENT TEAM", cx, 668);
  }
}

export function CupBallTrophy() {
  const g = useMemo(
    () =>
      profile([
        [0, 0],
        [0.26, 0],
        [0.27, 0.01],
        [0.27, 0.058],
        [0.26, 0.068],
        [0, 0.068],
      ]),
    []
  );
  useDispose(g);
  const body = sphereMaterial("cupball", drawCupBall, { roughness: 0.08, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.04 });
  const r = 0.5;
  return (
    <group>
      <mesh geometry={g} material={ceramicMat()} />
      <Rim r={0.2} y={0.09} tube={0.022} />
      <group position={[0, 0.09 + Math.sqrt(r * r - 0.04), 0]} rotation={[0, Math.PI / 2, 0]}>
        <Ball r={r} body={body} seam={metalMat("gold")} seamWidth={0.03} />
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Hall of Fame: el anillo de los elegidos, en su estuche abierto. Caña que se ensancha hacia la
// cabeza, balón esmaltado en el centro con "HALL OF FAME" grabado alrededor, dos coronas de brillantes
// (talla brillante, con fuego) y más brillantes por los hombros.

const RING_R = 0.3;

/** Perfil de la caña en el ángulo `th` (0 = cabeza): medio ancho y grosor. */
function bandAt(th: number) {
  const top = Math.pow((Math.cos(th) + 1) / 2, 2.5);
  return { w: 0.065 + 0.15 * top, t: 0.05 + 0.07 * top };
}

function ringBandGeometry() {
  const U = 180;
  const V = 32;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= U; i++) {
    const th = (i / U) * Math.PI * 2;
    const { w, t } = bandAt(th);
    for (let j = 0; j <= V; j++) {
      // Sección: rectángulo de esquinas redondeadas (superelipse)
      const ph = (j / V) * Math.PI * 2;
      const c = Math.cos(ph);
      const s = Math.sin(ph);
      const sx = Math.sign(c) * Math.sqrt(Math.abs(c));
      const sy = Math.sign(s) * Math.sqrt(Math.abs(s));
      const rho = RING_R + t / 2 + (t / 2) * sy;
      positions.push(w * sx, rho * Math.cos(th), rho * Math.sin(th));
    }
  }
  for (let i = 0; i < U; i++) {
    for (let j = 0; j < V; j++) {
      const a = i * (V + 1) + j;
      const b = a + V + 1;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Talla brillante (tabla arriba, culata abajo), radio 1. */
function brilliantGeometry() {
  return profile(
    [
      [0, -0.62],
      [1, -0.02],
      [1, 0.03],
      [0.56, 0.3],
      [0, 0.3],
    ],
    8
  );
}

const brilliantMat = () =>
  material(
    "brilliant",
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#ffffff",
        metalness: 0,
        roughness: 0,
        transmission: 1,
        thickness: 0.03,
        ior: 2.42,
        dispersion: 4,
        envMapIntensity: 3.2,
        emissive: new THREE.Color("#e2e8f0"),
        emissiveIntensity: 0.12,
        flatShading: true,
      })
  );

/** Engaste: posición y dirección hacia fuera de cada brillante (en el sistema del anillo). */
function settings() {
  const out: { p: THREE.Vector3; n: THREE.Vector3; s: number }[] = [];
  const headY = RING_R + bandAt(0).t;
  // Dos coronas alrededor del balón
  for (const [r, n] of [
    [0.142, 24],
    [0.174, 30],
  ] as const) {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + (r > 0.15 ? Math.PI / n : 0);
      out.push({ p: new THREE.Vector3(Math.cos(a) * r, headY + 0.052, Math.sin(a) * r), n: new THREE.Vector3(0, 1, 0), s: 0.0125 });
    }
  }
  // Hombros: tres filas por lado, bajando por la caña
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const th = side * (0.62 + i * 0.13);
      const { w, t } = bandAt(th);
      const rho = RING_R + t + 0.002;
      const n = new THREE.Vector3(0, Math.cos(th), Math.sin(th));
      for (const fx of [-0.55, 0, 0.55]) {
        out.push({ p: new THREE.Vector3(fx * w, rho * Math.cos(th), rho * Math.sin(th)), n, s: 0.0105 - i * 0.0009 });
      }
    }
  }
  return out;
}

function Brilliants() {
  const { geo, items } = useMemo(() => ({ geo: brilliantGeometry(), items: settings() }), []);
  useDispose(geo);
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    items.forEach(({ p, n, s }, i) => {
      q.setFromUnitVectors(up, n);
      m.compose(p, q, new THREE.Vector3(s, s, s));
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items]);
  return <instancedMesh ref={ref} args={[geo, brilliantMat(), items.length]} userData={{ noShadow: true }} />;
}

/** "HALL OF FAME · BASKETBALL ·" grabado en círculo alrededor del balón. */
function ringTextMaterial() {
  return material("hofRingText", () => {
    const size = 1024;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#3a3a3a";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `800 92px ${displayFont()}`;
    const text = "HALL OF FAME  ★  BASKETBALL  ★  ";
    const chars = [...text];
    const step = (Math.PI * 2) / chars.length;
    chars.forEach((ch, k) => {
      ctx.save();
      ctx.translate(size / 2, size / 2);
      ctx.rotate(k * step);
      ctx.fillText(ch, 0, -420);
      ctx.restore();
    });
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return new THREE.MeshStandardMaterial({ color: METAL_COLOR.gold, metalness: 1, roughness: 0.22, map: t, bumpMap: t, bumpScale: 2 });
  });
}

const leatherBoxMat = () =>
  material("boxLeather", () => new THREE.MeshPhysicalMaterial({ color: "#0b0e15", metalness: 0, roughness: 0.62, clearcoat: 0.35, clearcoatRoughness: 0.4 }));
const velvetMat = () => material("boxVelvet", () => new THREE.MeshPhysicalMaterial({ color: "#141c33", roughness: 1, sheen: 1, sheenColor: new THREE.Color("#4b5a8a"), sheenRoughness: 0.5 }));

/** Forro de raso de la tapa, con el nombre estampado en oro. */
function liningMaterial() {
  return material("boxLining", () => {
    const W = 1024;
    const H = 720;
    const map = document.createElement("canvas");
    const metal = document.createElement("canvas");
    map.width = metal.width = W;
    map.height = metal.height = H;
    const ctx = map.getContext("2d")!;
    const mctx = metal.getContext("2d")!;
    const g = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.7);
    g.addColorStop(0, "#f4efe4");
    g.addColorStop(1, "#cfc6b4");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    mctx.fillStyle = "#000000";
    mctx.fillRect(0, 0, W, H);
    const font = displayFont();
    const gold = "#c99a3a";
    for (const [c, color] of [
      [ctx, gold],
      [mctx, "#ffffff"],
    ] as const) {
      c.strokeStyle = color;
      c.fillStyle = color;
      c.lineWidth = 6;
      c.strokeRect(60, 60, W - 120, H - 120);
      c.lineWidth = 2;
      c.strokeRect(78, 78, W - 156, H - 156);
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.font = `600 44px ${font}`;
      c.fillText("N A I S M I T H   M E M O R I A L", W / 2, 230);
      c.font = `800 118px ${font}`;
      c.fillText("BASKETBALL", W / 2, 330);
      c.fillText("HALL OF FAME", W / 2, 440);
      c.font = `600 36px ${font}`;
      c.fillText("S P R I N G F I E L D ,   M A S S A C H U S E T T S", W / 2, 540);
    }
    const tex = (cv: HTMLCanvasElement, srgb: boolean) => {
      const t = new THREE.CanvasTexture(cv);
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      return t;
    };
    return new THREE.MeshPhysicalMaterial({
      color: "#ffffff",
      map: tex(map, true),
      metalness: 1,
      metalnessMap: tex(metal, false),
      roughness: 0.42,
      sheen: 0.6,
      sheenColor: new THREE.Color("#ffffff"),
    });
  });
}

export function HallOfFameRing() {
  const g = useMemo(
    () => ({
      band: ringBandGeometry(),
      plate: profile([
        [0, -0.03],
        [0.2, -0.03],
        [0.212, -0.012],
        [0.212, 0.03],
        [0.2, 0.046],
        [0, 0.046],
      ]),
    }),
    []
  );
  useDispose(g.band, g.plate);
  const gold = metalMat("gold");
  const headY = RING_R + bandAt(0).t;
  const LID = 1.86; // apertura de la tapa (rad)
  return (
    <group scale={1.38}>
      {/* Estuche: caja de piel negra con filete dorado, cojín de terciopelo y tapa abierta */}
      <RoundedBox args={[0.98, 0.34, 0.72]} radius={0.04} smoothness={4} position={[0, 0.17, 0]} material={leatherBoxMat()} />
      <mesh position={[0, 0.3, 0]} material={gold}>
        <boxGeometry args={[0.986, 0.01, 0.726]} />
      </mesh>
      <mesh position={[0, 0.336, 0]} material={velvetMat()}>
        <boxGeometry args={[0.9, 0.012, 0.64]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, 0.37, s * 0.078]} rotation={[0, 0, Math.PI / 2]} material={velvetMat()}>
          <capsuleGeometry args={[0.07, 0.72, 8, 24]} />
        </mesh>
      ))}
      <group position={[0, 0.34, -0.36]} rotation={[-LID, 0, 0]}>
        <RoundedBox args={[0.98, 0.13, 0.72]} radius={0.04} smoothness={4} position={[0, 0.065, 0.36]} material={leatherBoxMat()} />
        <mesh position={[0, -0.002, 0.36]} rotation={[Math.PI / 2, 0, 0]} material={liningMaterial()}>
          <planeGeometry args={[0.88, 0.62]} />
        </mesh>
      </group>

      {/* El anillo, inclinado hacia delante con la cabeza mirando a la vitrina */}
      <group position={[0, 0.6, 0.15]} rotation={[0.5, 0, 0]}>
        <mesh geometry={g.band} material={gold} />
        <group position={[0, headY, 0]}>
          <mesh geometry={g.plate} material={gold} />
          <mesh position={[0, 0.0465, 0]} rotation={[-Math.PI / 2, 0, 0]} material={ringTextMaterial()}>
            <ringGeometry args={[0.076, 0.124, 96]} />
          </mesh>
          <mesh position={[0, 0.047, 0]} rotation={[Math.PI / 2, 0, 0]} material={gold}>
            <torusGeometry args={[0.197, 0.009, 10, 96]} />
          </mesh>
          <mesh position={[0, 0.047, 0]} rotation={[Math.PI / 2, 0, 0]} material={gold}>
            <torusGeometry args={[0.128, 0.006, 10, 96]} />
          </mesh>
          <group position={[0, 0.05, 0]} scale={[1, 0.5, 1]}>
            <Ball r={0.072} />
          </group>
        </group>
        <Brilliants />
      </group>
    </group>
  );
}
