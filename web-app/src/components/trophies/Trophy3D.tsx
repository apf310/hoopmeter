"use client";

// Trofeos de la vitrina: peana de obsidiana con placa grabada + el trofeo de cada premio. Los premios
// con trofeo físico usan el real de la NBA (`RealTrophies.tsx`); los que no lo tienen, una pieza propia.
// Escala: la peana ocupa y ∈ [-0.5, 0] y el trofeo y ∈ [0, ~1.8].

import { useLayoutEffect, useMemo, useRef } from "react";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import {
  BillRussellTrophy,
  ConferenceMvpTrophy,
  CrystalTrophy,
  CupBallTrophy,
  CupMvpTrophy,
  HallOfFameRing,
  JordanTrophy,
  KobeTrophy,
  LarryOBrienTrophy,
} from "./RealTrophies";
import { engravedYear, type Metal, type TrophyGroup } from "./trophy-catalog";
import {
  Ball,
  displayFont,
  enamelMat,
  extrude,
  flameCoreMat,
  flameMat,
  graphiteMat,
  METAL_COLOR,
  METAL_ROUGHNESS,
  metalMat,
  obsidianMat,
  ribbonMat,
  ribbonStripeMat,
  Star,
  starShape,
} from "./trophy-kit";

export { Studio, TROPHY_CAMERA, TROPHY_LOOK_AT } from "./trophy-kit";

// ---------------------------------------------------------------------------
// Piezas propias (premios sin trofeo físico)

/** Columna torneada sobre la que se apoya cada pieza. */
function Stand({ h, metal, foot = 0.3 }: { h: number; metal: Metal; foot?: number }) {
  const geometry = useMemo(() => {
    const p = [
      [0, 0],
      [foot, 0],
      [foot, 0.035],
      [foot * 0.78, 0.065],
      [0.1, 0.11],
      [0.065, Math.max(0.14, h - 0.07)],
      [0.11, h - 0.025],
      [0.11, h],
      [0, h],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    return new THREE.LatheGeometry(p, 48);
  }, [h, foot]);
  return <mesh geometry={geometry} material={metalMat(metal)} />;
}


// ---------------------------------------------------------------------------
// Una pieza por premio

type PieceProps = { metal: Metal };

/** All-Rookie Team: un brote que acaba en balón. */
function SproutPiece({ metal, sparkle }: PieceProps & { sparkle?: boolean }) {
  const m = metalMat(metal);
  const [stem, leaf, star] = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.05, 0),
      new THREE.Vector3(0.07, 0.38, 0),
      new THREE.Vector3(-0.05, 0.75, 0),
      new THREE.Vector3(0.0, 1.08, 0),
    ]);
    const leafShape = new THREE.Shape();
    leafShape.moveTo(0, 0);
    leafShape.quadraticCurveTo(0.16, 0.12, 0, 0.4);
    leafShape.quadraticCurveTo(-0.16, 0.12, 0, 0);
    return [new THREE.TubeGeometry(curve, 48, 0.035, 12), extrude(leafShape, 0.012, 0.012, false), extrude(starShape(0.16, 0.05, 4), 0.02, 0.012)];
  }, []);
  return (
    <group>
      <mesh material={obsidianMat()} scale={[1, 0.35, 1]}>
        <sphereGeometry args={[0.36, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      <mesh geometry={stem} material={m} />
      <mesh geometry={leaf} material={m} position={[0.05, 0.42, 0]} rotation={[0, 0.3, -1.0]} />
      <mesh geometry={leaf} material={m} position={[-0.03, 0.62, 0]} rotation={[0, -0.3, 0.95]} />
      <group position={[0, 1.24, 0]}>
        <Ball r={0.18} metal={metal} />
      </group>
      {sparkle && <mesh geometry={star} material={metalMat("gold")} position={[0.42, 1.48, 0]} rotation={[0, 0, 0.2]} />}
    </group>
  );
}


/** Regreso del Año: flecha que da la vuelta alrededor del balón. */
function ComebackPiece({ metal }: PieceProps) {
  const [tube, head] = useMemo(() => {
    const start = -Math.PI / 2 + 0.5;
    const end = start + Math.PI * 1.55;
    const r = 0.42;
    const pts = Array.from({ length: 40 }, (_, i) => {
      const a = start + ((end - start) * i) / 39;
      return new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0);
    });
    // Punta plana (extruida) de cara a la cámara: un cono reflejaba el fondo y se veía negro
    const tip = new THREE.Shape();
    tip.moveTo(0, 0.17);
    tip.lineTo(-0.15, -0.09);
    tip.lineTo(0.15, -0.09);
    tip.closePath();
    const head = extrude(tip, 0.08, 0.02);
    // La punta sigue la tangente al final del arco
    head.rotateZ(end);
    head.translate(Math.cos(end) * r - Math.sin(end) * 0.1, Math.sin(end) * r + Math.cos(end) * 0.1, 0);
    return [new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, 0.055, 14), head];
  }, []);
  const m = metalMat(metal);
  return (
    <group>
      <Stand h={0.3} metal={metal} />
      <group position={[0, 0.88, 0]}>
        <mesh geometry={tube} material={m} />
        <mesh geometry={head} material={m} />
        <Ball r={0.2} />
      </group>
    </group>
  );
}


/** All-NBA: medallón con el quinteto (cinco estrellas) y el balón. */
function QuintetPiece({ metal }: PieceProps) {
  const m = metalMat(metal);
  return (
    <group>
      <Stand h={0.3} metal={metal} />
      <group position={[0, 0.88, 0]}>
        <mesh material={m} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.58, 0.58, 0.1, 64]} />
        </mesh>
        {/* Las dos caras iguales: al girarlo no aparece un disco liso */}
        {[0, Math.PI].map((turn) => (
          <group key={turn} rotation={[0, turn, 0]}>
            <mesh material={m} position={[0, 0, 0.05]}>
              <torusGeometry args={[0.55, 0.035, 12, 80]} />
            </mesh>
            <mesh material={enamelMat()} position={[0, 0, 0.051]}>
              <circleGeometry args={[0.5, 64]} />
            </mesh>
            {[150, 120, 90, 60, 30].map((deg) => {
              const a = (deg * Math.PI) / 180;
              return (
                <group key={deg} position={[Math.cos(a) * 0.33, Math.sin(a) * 0.33 - 0.04, 0.08]}>
                  <Star outer={0.095} inner={0.04} depth={0.025} bevel={0.01} mat={m} />
                </group>
              );
            })}
            <group position={[0, -0.14, 0.06]} scale={[1, 1, 0.6]}>
              <Ball r={0.17} />
            </group>
          </group>
        ))}
      </group>
    </group>
  );
}

/** All-Defensive Team: el cerrojo. */
function PadlockPiece({ metal }: PieceProps) {
  const m = metalMat(metal);
  return (
    <group>
      <RoundedBox args={[0.82, 0.68, 0.32]} radius={0.08} smoothness={4} position={[0, 0.42, 0]} material={m} />
      <mesh material={m} position={[0, 0.88, 0]}>
        <torusGeometry args={[0.25, 0.065, 16, 48, Math.PI]} />
      </mesh>
      {[-0.25, 0.25].map((x) => (
        <mesh key={x} material={m} position={[x, 0.8, 0]}>
          <cylinderGeometry args={[0.065, 0.065, 0.16, 20]} />
        </mesh>
      ))}
      <mesh material={metalMat("gold")} position={[0, 0.42, 0.165]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.15, 0.15, 0.02, 40]} />
      </mesh>
      <mesh material={enamelMat()} position={[0, 0.46, 0.177]}>
        <circleGeometry args={[0.05, 24]} />
      </mesh>
      <mesh material={enamelMat()} position={[0, 0.38, 0.177]}>
        <planeGeometry args={[0.04, 0.12]} />
      </mesh>
    </group>
  );
}

/** All-Star: estrella con el balón en el centro. */
function StarPiece({ metal }: PieceProps) {
  return (
    <group>
      <Stand h={0.34} metal={metal} />
      <group position={[0, 0.81, 0]}>
        <Star outer={0.6} inner={0.26} depth={0.12} bevel={0.045} mat={metalMat(metal)} />
        <group position={[0, 0, 0.09]} scale={[1, 1, 0.55]}>
          <Ball r={0.16} />
        </group>
      </group>
    </group>
  );
}


/** Medalla con cinta (oro, plata y bronce olímpicos; también el premio desconocido). */
function MedalPiece({ metal }: PieceProps) {
  const m = metalMat(metal);
  return (
    <group>
      <Stand h={0.32} metal={metal} />
      <group position={[0, 0.8, 0]}>
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 0.15, 0.68, -0.03]} rotation={[0, 0, s * 0.32]}>
            <mesh material={ribbonMat()}>
              <boxGeometry args={[0.18, 0.66, 0.015]} />
            </mesh>
            <mesh material={ribbonStripeMat()} position={[0, 0, 0.009]}>
              <boxGeometry args={[0.045, 0.66, 0.005]} />
            </mesh>
          </group>
        ))}
        <mesh material={m} position={[0, 0.44, 0]}>
          <torusGeometry args={[0.06, 0.018, 10, 24]} />
        </mesh>
        <mesh material={m} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.42, 0.42, 0.07, 64]} />
        </mesh>
        {/* Anverso con estrella y reverso con el balón, como una medalla de verdad */}
        {[0, Math.PI].map((turn) => (
          <group key={turn} rotation={[0, turn, 0]}>
            <mesh material={m} position={[0, 0, 0.035]}>
              <torusGeometry args={[0.4, 0.03, 12, 80]} />
            </mesh>
            <mesh material={m} position={[0, 0, 0.04]}>
              <torusGeometry args={[0.29, 0.012, 8, 80]} />
            </mesh>
            {turn === 0 ? (
              <group position={[0, 0, 0.06]}>
                <Star outer={0.19} inner={0.08} depth={0.03} bevel={0.012} mat={m} />
              </group>
            ) : (
              <group position={[0, 0, 0.035]} scale={[1, 1, 0.35]}>
                <Ball r={0.2} metal={metal} />
              </group>
            )}
          </group>
        ))}
      </group>
    </group>
  );
}

/** Juegos Olímpicos (participación): antorcha con su llama. */
function TorchPiece({ metal }: PieceProps) {
  const handle = useMemo(() => {
    const p = [
      [0, 0],
      [0.3, 0],
      [0.3, 0.05],
      [0.1, 0.1],
      [0.075, 0.2],
      [0.1, 0.78],
      [0.21, 1.08],
      [0.24, 1.13],
      [0.2, 1.14],
      [0, 1.12],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    return new THREE.LatheGeometry(p, 48);
  }, []);
  const flame = useMemo(() => {
    const p = [
      [0, 0],
      [0.13, 0.04],
      [0.2, 0.15],
      [0.19, 0.28],
      [0.13, 0.42],
      [0.06, 0.56],
      [0, 0.7],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    return new THREE.LatheGeometry(p, 40);
  }, []);
  return (
    <group>
      <mesh geometry={handle} material={metalMat(metal)} />
      {[0.45, 0.6].map((y) => (
        <mesh key={y} material={metalMat("gold")} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.088, 0.018, 10, 40]} />
        </mesh>
      ))}
      <mesh geometry={flame} material={flameMat()} position={[0, 1.1, 0]} userData={{ noShadow: true }} />
      <mesh geometry={flame} material={flameCoreMat()} position={[0, 1.12, 0.06]} scale={[0.55, 0.6, 0.55]} userData={{ noShadow: true }} />
      <pointLight position={[0, 1.4, 0.4]} intensity={1.2} distance={2} color="#fb923c" />
    </group>
  );
}

/** Premio IBM (el de los números): hexágono con barras de estadística. */
function HexagonPiece({ metal }: PieceProps) {
  const m = metalMat(metal);
  return (
    <group>
      <Stand h={0.3} metal={metal} />
      <group position={[0, 0.84, 0]}>
        <mesh material={m} rotation={[Math.PI / 2, Math.PI / 6, 0]}>
          <cylinderGeometry args={[0.56, 0.56, 0.12, 6]} />
        </mesh>
        <mesh material={enamelMat()} position={[0, 0, 0.061]} rotation={[0, 0, Math.PI / 6]}>
          <circleGeometry args={[0.46, 6]} />
        </mesh>
        {[0.16, 0.28, 0.4].map((h, i) => (
          <mesh key={i} material={metalMat("gold")} position={[-0.16 + i * 0.16, -0.2 + h / 2, 0.09]}>
            <boxGeometry args={[0.1, h, 0.05]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** J. Walter Kennedy Citizenship Award: corazón. */
function HeartPiece({ metal }: PieceProps) {
  const geometry = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(5, 5);
    s.bezierCurveTo(5, 5, 4, 0, 0, 0);
    s.bezierCurveTo(-6, 0, -6, 7, -6, 7);
    s.bezierCurveTo(-6, 11, -3, 15.4, 5, 19);
    s.bezierCurveTo(12, 15.4, 16, 11, 16, 7);
    s.bezierCurveTo(16, 7, 16, 0, 10, 0);
    s.bezierCurveTo(7, 0, 5, 5, 5, 5);
    const g = extrude(s, 3, 1.4);
    g.rotateZ(Math.PI);
    g.scale(0.047, 0.047, 0.047);
    return g;
  }, []);
  return (
    <group>
      <Stand h={0.36} metal={metal} />
      <mesh geometry={geometry} material={metalMat(metal)} position={[0, 0.82, 0]} />
      <group position={[0, 0.88, 0.1]} scale={[1, 1, 0.5]}>
        <Ball r={0.12} />
      </group>
    </group>
  );
}


type ModelGroup = Pick<TrophyGroup, "design" | "metal" | "label" | "trophy" | "award" | "pose" | "seasons">;

function Piece({ group }: { group: ModelGroup }) {
  const props = { metal: group.metal };
  switch (group.design) {
    case "larryOBrien":
      return <LarryOBrienTrophy />;
    case "jordan":
      return <JordanTrophy />;
    case "billRussell":
      return <BillRussellTrophy />;
    case "crystal":
      return <CrystalTrophy pose={group.pose ?? "jumper"} label={group.trophy ?? group.label} award={group.award ?? ""} />;
    case "confMvp":
      return <ConferenceMvpTrophy name={group.trophy ?? group.label} />;
    case "kobe":
      return <KobeTrophy />;
    case "cupMvp":
      return <CupMvpTrophy />;
    case "cupBall":
      return <CupBallTrophy />;
    case "ring":
      return <HallOfFameRing />;
    case "sprout":
      return <SproutPiece {...props} sparkle={group.metal === "gold"} />;
    case "comeback":
      return <ComebackPiece {...props} />;
    case "quintet":
      return <QuintetPiece {...props} />;
    case "padlock":
      return <PadlockPiece {...props} />;
    case "star":
      return <StarPiece {...props} />;
    case "torch":
      return <TorchPiece {...props} />;
    case "hexagon":
      return <HexagonPiece {...props} />;
    case "heart":
      return <HeartPiece {...props} />;
    case "medal":
    default:
      return <MedalPiece {...props} />;
  }
}

// ---------------------------------------------------------------------------
// Peana con la placa grabada

/** Años seguidos en tramos: 2005, 2006, 2007, 2009 -> "2005–2007 · 2009". */
export function compactYears(seasons: string[]): string {
  const years = [...new Set(seasons.map(engravedYear))].sort();
  const parts: string[] = [];
  for (let i = 0; i < years.length; ) {
    let j = i;
    while (j + 1 < years.length && Number(years[j + 1]) === Number(years[j]) + 1) j++;
    parts.push(j - i >= 2 ? `${years[i]}–${years[j]}` : years.slice(i, j + 1).join(" · "));
    i = j + 1;
  }
  return parts.join(" · ");
}

/** Espera a la Barlow de la app antes de grabar las placas (si no, el canvas usaría otra letra). */
export async function loadPlaqueFont(): Promise<void> {
  const font = displayFont();
  try {
    await Promise.all([document.fonts.load(`800 40px ${font}`), document.fonts.load(`600 40px ${font}`)]);
  } catch {
    // Sin la fuente se graba con la de reserva: nunca bloquea la vitrina
  }
}

/** Textura de la placa: blanco = metal, gris oscuro = letra grabada (también hace de relieve). */
function plaqueTexture(name: string | undefined, title: string, years: string) {
  const W = 1024;
  const H = 200;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const font = displayFont();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  // Filete grabado a 10 px del borde
  ctx.strokeStyle = "#5b5b5b";
  ctx.lineWidth = 3;
  ctx.strokeRect(12, 12, W - 24, H - 24);
  ctx.fillStyle = "#3a3a3a";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const fit = (text: string, weight: number, size: number, min: number) => {
    let s = size;
    ctx.font = `${weight} ${s}px ${font}`;
    while (ctx.measureText(text).width > W - 90 && s > min) {
      s -= 2;
      ctx.font = `${weight} ${s}px ${font}`;
    }
  };
  const rows: [string, number, number, number][] = [];
  if (name) rows.push([name.toUpperCase().split("").join(" "), 700, 38, 24]);
  rows.push([title.toUpperCase(), 800, name ? 88 : 100, 40]);
  if (years) rows.push([years, 700, 50, 26]);
  const ys = rows.length === 3 ? [42, 104, 166] : rows.length === 2 ? [76, 150] : [100];
  rows.forEach(([text, weight, size, min], i) => {
    fit(text, weight, size, min);
    ctx.fillText(text, W / 2, ys[i]);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function Pedestal({ metal, name, title, years }: { metal: Metal; name?: string; title: string; years: string }) {
  const texture = useMemo(() => plaqueTexture(name, title, years), [name, title, years]);
  const plaque = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: METAL_COLOR[metal],
        metalness: 1,
        roughness: METAL_ROUGHNESS[metal] + 0.08,
        map: texture,
        bumpMap: texture,
        bumpScale: 1.5,
      }),
    [metal, texture]
  );
  useLayoutEffect(
    () => () => {
      texture.dispose();
      plaque.dispose();
    },
    [texture, plaque]
  );
  const obsidian = obsidianMat();
  return (
    <group>
      <RoundedBox args={[1.72, 0.4, 1.1]} radius={0.05} smoothness={4} position={[0, -0.3, 0]} material={obsidian} />
      <mesh material={metalMat(metal)} position={[0, -0.098, 0]}>
        <boxGeometry args={[1.5, 0.012, 0.96]} />
      </mesh>
      <RoundedBox args={[1.44, 0.1, 0.92]} radius={0.035} smoothness={4} position={[0, -0.05, 0]} material={graphiteMat()} />
      <RoundedBox args={[1.52, 0.31, 0.02]} radius={0.008} smoothness={2} position={[0, -0.3, 0.553]} material={metalMat(metal)} />
      <mesh material={plaque} position={[0, -0.3, 0.5645]}>
        <planeGeometry args={[1.46, 0.285]} />
      </mesh>
    </group>
  );
}

/** Sombra suave bajo la peana (sin pasadas extra de render). */
function SoftShadow() {
  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
    g.addColorStop(0, "rgba(0,0,0,0.75)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }, []);
  return (
    <mesh position={[0, -0.501, 0.05]} rotation={[-Math.PI / 2, 0, 0]} userData={{ noShadow: true }}>
      <planeGeometry args={[3, 2]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  );
}

/** Ángulo de reposo: los de cristal, de frente (por su cara plana se ve la figura sin desdoblarse). */
export function restAngle(design: TrophyGroup["design"]) {
  return design === "crystal" ? 0.04 : 0.32;
}

export type TrophyModelProps = {
  group: ModelGroup & Pick<TrophyGroup, "count">;
  /** Nombre grabado en la placa (la vitrina de un jugador). */
  name?: string;
};

/** El trofeo completo: peana con placa grabada + el trofeo del premio. */
export function TrophyModel({ group, name }: TrophyModelProps) {
  const title = group.count > 1 ? `${group.label} ×${group.count}` : group.label;
  const ref = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    ref.current?.traverse((o) => {
      if (o instanceof THREE.Mesh && !o.userData.noShadow) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }, [group.design, group.metal, group.pose]);
  return (
    <group ref={ref}>
      <SoftShadow />
      <Pedestal metal={group.metal} name={name} title={title} years={compactYears(group.seasons)} />
      <Piece group={group} />
    </group>
  );
}
