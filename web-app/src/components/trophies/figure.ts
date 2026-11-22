// Figuras de jugador de los trofeos (las de los trofeos de cristal y la del Michael Jordan Trophy):
// un esqueleto sencillo (dirección de cada hueso) que se convierte en una sola malla continua.
// Mirando a cámara (+z); su izquierda queda a la derecha de la pantalla (+x). Altura ≈ 1, pies en y = 0.

import * as THREE from "three";
import { MarchingCubes } from "three/examples/jsm/objects/MarchingCubes.js";

export type FigurePose = "reach" | "defense" | "palming" | "runner" | "hook" | "jumper" | "handshake";

type V = [number, number, number];

type Pose = {
  spine: V;
  neck?: V;
  /** Brazo izquierdo de la figura (derecha de la pantalla): hombro→codo y codo→mano. */
  armL: [V, V];
  armR: [V, V];
  /** Muslo y pierna. */
  legL: [V, V];
  legR: [V, V];
  /** Dirección del pie (por defecto, hacia delante). */
  footL?: V;
  footR?: V;
  balls?: ("handL" | "handR" | "overhead")[];
};

const POSES: Record<Exclude<FigurePose, "handshake">, Pose> & { handshake: Pose } = {
  // Michael Jordan Trophy: sale de la roca estirándose hacia el balón de cristal
  reach: {
    spine: [-0.05, 1, -0.05],
    neck: [-0.04, 1, -0.35],
    armR: [
      [-0.1, 1, 0.04],
      [-0.03, 1, 0.06],
    ],
    armL: [
      [0.32, -1, -0.12],
      [0.18, -1, 0.3],
    ],
    legL: [
      [0.05, -1, 0.02],
      [0, -1, -0.04],
    ],
    legR: [
      [-0.04, -1, 0.22],
      [0.02, -1, -0.55],
    ],
    footR: [0, -0.8, -0.6],
  },
  // Hakeem Olajuwon: defensa, rodillas flexionadas, una mano arriba y otra abajo
  defense: {
    spine: [0, 1, 0.32],
    neck: [0, 1, 0.15],
    armL: [
      [0.8, 0.5, 0.15],
      [0.25, 1, 0.08],
    ],
    armR: [
      [-0.85, -0.35, 0.25],
      [-0.75, -0.5, 0.45],
    ],
    legL: [
      [0.6, -0.8, 0.28],
      [0.18, -1, -0.12],
    ],
    legR: [
      [-0.6, -0.8, 0.28],
      [-0.18, -1, -0.12],
    ],
  },
  // Wilt Chamberlain: un balón en cada mano
  palming: {
    spine: [0, 1, 0.02],
    armL: [
      [0.7, -0.62, 0.12],
      [0.55, -0.15, 0.55],
    ],
    armR: [
      [-0.7, -0.62, 0.12],
      [-0.55, -0.15, 0.55],
    ],
    legL: [
      [0.12, -1, 0],
      [0.02, -1, 0],
    ],
    legR: [
      [-0.12, -1, 0],
      [-0.02, -1, 0],
    ],
    balls: ["handL", "handR"],
  },
  // John Havlicek: tiro en carrera, en el aire con una rodilla arriba
  runner: {
    spine: [0.04, 1, 0.06],
    armL: [
      [0.35, 0.85, 0.4],
      [-0.3, 1, 0.12],
    ],
    armR: [
      [-0.3, 0.9, 0.4],
      [0.3, 1, 0.12],
    ],
    legL: [
      [0.06, -0.5, 0.86],
      [0, -1, -0.12],
    ],
    legR: [
      [-0.05, -1, -0.18],
      [0, -1, -0.45],
    ],
    footL: [0, -0.9, 0.45],
    footR: [0, -1, -0.2],
    balls: ["overhead"],
  },
  // George Mikan: gancho en bandeja, con la rodilla arriba y el balón en lo alto
  hook: {
    spine: [-0.3, 1, 0.04],
    neck: [-0.2, 1, 0.1],
    armR: [
      [-0.32, 1, 0.06],
      [-0.06, 1, 0.12],
    ],
    armL: [
      [-0.5, 0.5, 0.55],
      [-0.65, 0.7, 0.2],
    ],
    legR: [
      [-0.25, -0.4, 0.75],
      [0.1, -1, 0.05],
    ],
    legL: [
      [0.45, -1, -0.1],
      [0.35, -1, -0.3],
    ],
    footL: [0.2, -1, -0.15],
    balls: ["handR"],
  },
  // Jerry West: tiro en suspensión, los dos brazos arriba
  jumper: {
    spine: [0, 1, 0.02],
    armL: [
      [0.28, 1, 0.3],
      [-0.12, 1, 0.02],
    ],
    armR: [
      [-0.28, 1, 0.3],
      [0.12, 1, 0.02],
    ],
    legL: [
      [0.05, -1, 0.02],
      [0, -1, -0.04],
    ],
    legR: [
      [-0.05, -1, 0.02],
      [0, -1, -0.04],
    ],
    footL: [0, -1, 0.55],
    footR: [0, -1, 0.55],
    balls: ["overhead"],
  },
  // Joe Dumars: apretón de manos (una de las dos figuras; la otra es la misma girada)
  handshake: {
    spine: [0, 1, 0.04],
    armR: [
      [0.3, -0.75, 0.6],
      [0.45, 0.2, 1],
    ],
    armL: [
      [0.14, -1, -0.02],
      [0.04, -1, 0.12],
    ],
    legL: [
      [0.07, -1, 0],
      [0, -1, 0],
    ],
    legR: [
      [-0.07, -1, 0],
      [0, -1, 0],
    ],
  },
};

// Medidas (altura 1)
const M = {
  torso: 0.27,
  shoulder: 0.105,
  hip: 0.056,
  upperArm: 0.165,
  foreArm: 0.15,
  thigh: 0.245,
  calf: 0.245,
  head: 0.06,
  ball: 0.052,
};

const v = (a: V) => new THREE.Vector3(...a).normalize();

// ---------------------------------------------------------------------------
// El cuerpo es una superficie continua: huesos (conos redondeados) y volúmenes (elipsoides) fundidos
// con una unión suave, y triangulados con marching cubes. Así sale una escultura, no un maniquí.

type Prim =
  | { kind: "cone"; a: THREE.Vector3; b: THREE.Vector3; ra: number; rb: number; k: number }
  | { kind: "ellipsoid"; c: THREE.Vector3; r: V; x: THREE.Vector3; y: THREE.Vector3; z: THREE.Vector3; k: number };

const SMOOTH = 0.03;

function cone(a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number, k = SMOOTH): Prim {
  return { kind: "cone", a, b, ra, rb, k };
}

function ellipsoid(c: THREE.Vector3, r: V, up: THREE.Vector3, forward = new THREE.Vector3(0, 0, 1), k = SMOOTH): Prim {
  const y = up.clone().normalize();
  let x = new THREE.Vector3().crossVectors(y, forward);
  if (x.lengthSq() < 1e-4) x = new THREE.Vector3(1, 0, 0);
  x.normalize();
  const z = new THREE.Vector3().crossVectors(x, y).normalize();
  return { kind: "ellipsoid", c, r, x, y, z, k };
}

function bounds(p: Prim): [THREE.Vector3, THREE.Vector3] {
  if (p.kind === "cone") {
    const r = Math.max(p.ra, p.rb) + p.k;
    return [p.a.clone().min(p.b).subScalar(r), p.a.clone().max(p.b).addScalar(r)];
  }
  const r = Math.max(...p.r) + p.k;
  return [p.c.clone().subScalar(r), p.c.clone().addScalar(r)];
}

/** Distancia con signo a un cono redondeado (Inigo Quilez). */
function coneDistance(p: Extract<Prim, { kind: "cone" }>) {
  const bax = p.b.x - p.a.x;
  const bay = p.b.y - p.a.y;
  const baz = p.b.z - p.a.z;
  const l2 = bax * bax + bay * bay + baz * baz || 1e-9;
  const rr = p.ra - p.rb;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  return (x: number, y: number, z: number) => {
    const pax = x - p.a.x;
    const pay = y - p.a.y;
    const paz = z - p.a.z;
    const t = pax * bax + pay * bay + paz * baz;
    const u = t - l2;
    const qx = pax * l2 - bax * t;
    const qy = pay * l2 - bay * t;
    const qz = paz * l2 - baz * t;
    const x2 = qx * qx + qy * qy + qz * qz;
    const y2 = t * t * l2;
    const z2 = u * u * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(u) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - p.rb;
    if (Math.sign(t) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - p.ra;
    return (Math.sqrt(x2 * a2 * il2) + t * rr) * il2 - p.ra;
  };
}

/** Distancia aproximada a un elipsoide orientado. */
function ellipsoidDistance(p: Extract<Prim, { kind: "ellipsoid" }>) {
  const [rx, ry, rz] = p.r;
  return (x: number, y: number, z: number) => {
    const dx = x - p.c.x;
    const dy = y - p.c.y;
    const dz = z - p.c.z;
    const lx = dx * p.x.x + dy * p.x.y + dz * p.x.z;
    const ly = dx * p.y.x + dy * p.y.y + dz * p.y.z;
    const lz = dx * p.z.x + dy * p.z.y + dz * p.z.z;
    const k0 = Math.hypot(lx / rx, ly / ry, lz / rz);
    const k1 = Math.hypot(lx / (rx * rx), ly / (ry * ry), lz / (rz * rz));
    return k1 === 0 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
  };
}

/** Une todas las piezas en una superficie (unión suave) y la triangula. */
function polygonize(prims: Prim[], resolution: number, roughen?: (x: number, y: number, z: number) => number): THREE.BufferGeometry {
  const lo = new THREE.Vector3(Infinity, Infinity, Infinity);
  const hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (const p of prims) {
    const [a, b] = bounds(p);
    lo.min(a);
    hi.max(b);
  }
  const N = resolution;
  const center = lo.clone().add(hi).multiplyScalar(0.5);
  // marching cubes trabaja en [-1, 1]³ con N celdas: índice i ↔ x = (i - N/2) / (N/2)
  const half = (Math.max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z) / 2) * 1.08;
  const cell = half / (N / 2);
  const toIndex = (w: number, c: number) => ((w - c) / half) * (N / 2) + N / 2;
  const toWorld = (i: number, c: number) => c + ((i - N / 2) / (N / 2)) * half;

  const field = new Float32Array(N * N * N).fill(4 * cell);
  for (const p of prims) {
    const dist = p.kind === "cone" ? coneDistance(p) : ellipsoidDistance(p);
    const [a, b] = bounds(p);
    const margin = 3;
    const i0 = Math.max(0, Math.floor(toIndex(a.x, center.x)) - margin);
    const i1 = Math.min(N - 1, Math.ceil(toIndex(b.x, center.x)) + margin);
    const j0 = Math.max(0, Math.floor(toIndex(a.y, center.y)) - margin);
    const j1 = Math.min(N - 1, Math.ceil(toIndex(b.y, center.y)) + margin);
    const k0 = Math.max(0, Math.floor(toIndex(a.z, center.z)) - margin);
    const k1 = Math.min(N - 1, Math.ceil(toIndex(b.z, center.z)) + margin);
    const k = p.k;
    for (let kz = k0; kz <= k1; kz++) {
      const z = toWorld(kz, center.z);
      for (let jy = j0; jy <= j1; jy++) {
        const y = toWorld(jy, center.y);
        let idx = i0 + jy * N + kz * N * N;
        for (let ix = i0; ix <= i1; ix++, idx++) {
          const d = dist(toWorld(ix, center.x), y, z);
          const cur = field[idx];
          // Unión suave (smin polinómica)
          const h = Math.max(k - Math.abs(cur - d), 0) / k;
          field[idx] = Math.min(cur, d) - h * h * k * 0.25;
        }
      }
    }
  }

  // Superficie en bruto (bronce fundido): se desplaza el campo cerca de la superficie
  if (roughen) {
    for (let kz = 0; kz < N; kz++) {
      const z = toWorld(kz, center.z);
      for (let jy = 0; jy < N; jy++) {
        const y = toWorld(jy, center.y);
        let idx = jy * N + kz * N * N;
        for (let ix = 0; ix < N; ix++, idx++) {
          if (Math.abs(field[idx]) < 5 * cell) field[idx] += roughen(toWorld(ix, center.x), y, z);
        }
      }
    }
  }

  const mc = new MarchingCubes(N, new THREE.MeshBasicMaterial(), false, false, 500000);
  mc.isolation = 0;
  for (let i = 0; i < field.length; i++) mc.field[i] = -field[i];
  mc.update();
  const count = mc.count;
  const src = mc.geometry.attributes.position.array as Float32Array;
  const nrm = mc.geometry.attributes.normal.array as Float32Array;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = center.x + src[i * 3] * half;
    positions[i * 3 + 1] = center.y + src[i * 3 + 1] * half;
    positions[i * 3 + 2] = center.z + src[i * 3 + 2] * half;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(nrm.slice(0, count * 3), 3));
  geometry.normalizeNormals();
  mc.geometry.dispose();
  (mc.material as THREE.Material).dispose();
  return geometry;
}

// ---------------------------------------------------------------------------
// Esqueleto → piezas (con anatomía: pectorales, escápulas, trapecios, glúteos, bíceps, cuádriceps, gemelos)

type Built = { prims: Prim[]; hands: { left: THREE.Vector3; right: THREE.Vector3 }; ankles: THREE.Vector3[] };

function buildFigure(pose: Pose, clothed = true): Built {
  const prims: Prim[] = [];
  const spine = v(pose.spine);
  const neckDir = v(pose.neck ?? pose.spine);
  // Lado izquierdo de la figura (+x) perpendicular a la columna
  const side = new THREE.Vector3().crossVectors(spine, new THREE.Vector3(0, 0, 1)).normalize();
  const forward = new THREE.Vector3().crossVectors(side, spine).normalize();
  const pelvis = new THREE.Vector3(0, 0, 0);
  const at = (base: THREE.Vector3, dir: THREE.Vector3, len: number) => base.clone().add(dir.clone().multiplyScalar(len));
  const fwd = (base: THREE.Vector3, d: number) => at(base, forward, d);
  const lat = (base: THREE.Vector3, d: number) => at(base, side, d);

  const chest = at(pelvis, spine, M.torso);
  const neckBase = at(pelvis, spine, M.torso + 0.01);
  const head = at(neckBase, neckDir, 0.085);

  // Tronco: caja torácica, abdomen y pelvis; músculos a cada lado
  prims.push(ellipsoid(at(pelvis, spine, 0.2), [0.108, 0.092, 0.064], spine, forward, 0.05));
  prims.push(ellipsoid(at(pelvis, spine, 0.1), [0.083, 0.1, 0.057], spine, forward, 0.05));
  prims.push(ellipsoid(at(pelvis, spine, 0.005), [0.096, 0.068, 0.062], spine, forward, 0.04));
  for (const s of [1, -1]) {
    prims.push(ellipsoid(fwd(lat(at(pelvis, spine, 0.212), s * 0.05), 0.03), [0.05, 0.036, 0.026], spine, forward, 0.03)); // pectoral
    prims.push(ellipsoid(fwd(lat(at(pelvis, spine, 0.19), s * 0.055), -0.032), [0.05, 0.065, 0.028], spine, forward, 0.03)); // dorsal
    prims.push(cone(lat(neckBase, s * 0.022), lat(at(pelvis, spine, M.torso - 0.018), s * (M.shoulder - 0.012)), 0.032, 0.028, 0.04)); // trapecio
    prims.push(ellipsoid(fwd(lat(at(pelvis, spine, -0.025), s * 0.045), -0.032), [0.048, 0.05, 0.04], spine, forward, 0.03)); // glúteo
  }
  if (clothed) prims.push(ellipsoid(at(pelvis, spine, -0.008), [0.112, 0.078, 0.072], spine, forward, 0.02)); // pantalón
  prims.push(cone(neckBase, at(neckBase, neckDir, 0.045), 0.029, 0.025, 0.02));
  // Cabeza: cráneo y mandíbula
  prims.push(ellipsoid(head, [0.044, 0.053, 0.049], neckDir, forward, 0.02));
  prims.push(ellipsoid(fwd(at(head, neckDir, -0.03), 0.014), [0.034, 0.028, 0.034], neckDir, forward, 0.02));

  const arm = (s: 1 | -1, [upper, fore]: [V, V]) => {
    const shoulder = chest.clone().add(side.clone().multiplyScalar(s * M.shoulder)).add(spine.clone().multiplyScalar(-0.02));
    const u = v(upper);
    const f = v(fore);
    const elbow = at(shoulder, u, M.upperArm);
    const wrist = at(elbow, f, M.foreArm);
    prims.push(ellipsoid(at(shoulder, u, 0.02), [0.042, 0.05, 0.042], u, forward, 0.035)); // deltoides
    prims.push(cone(shoulder, elbow, 0.03, 0.022));
    prims.push(ellipsoid(fwd(at(shoulder, u, 0.092), 0.006), [0.03, 0.05, 0.029], u, forward, 0.02)); // bíceps
    prims.push(cone(elbow, wrist, 0.024, 0.016, 0.02));
    prims.push(ellipsoid(at(elbow, f, 0.045), [0.027, 0.048, 0.024], f, forward, 0.02)); // antebrazo
    prims.push(ellipsoid(at(wrist, f, 0.032), [0.022, 0.038, 0.011], f, forward, 0.012)); // mano
    return at(wrist, f, 0.04);
  };
  const ankles: THREE.Vector3[] = [];
  const leg = (s: 1 | -1, [thigh, calf]: [V, V], foot?: V) => {
    const hip = pelvis.clone().add(side.clone().multiplyScalar(s * M.hip));
    const t = v(thigh);
    const c = v(calf);
    const knee = at(hip, t, M.thigh);
    const ankle = at(knee, c, M.calf);
    ankles.push(ankle);
    prims.push(cone(hip, knee, 0.054, 0.035));
    prims.push(ellipsoid(fwd(at(hip, t, 0.1), 0.012), [0.05, 0.085, 0.046], t, forward, 0.03)); // cuádriceps
    if (clothed) prims.push(cone(hip, at(hip, t, M.thigh * 0.55), 0.07, 0.062, 0.02)); // pantalón
    prims.push(cone(knee, ankle, 0.034, 0.021, 0.025));
    prims.push(ellipsoid(fwd(at(knee, c, 0.075), -0.012), [0.035, 0.065, 0.036], c, forward, 0.03)); // gemelo
    const f = foot ? v(foot) : forward.clone().add(new THREE.Vector3(0, -0.25, 0)).normalize();
    prims.push(ellipsoid(at(ankle, f, 0.042), [0.028, 0.058, 0.022], f, UP_VECTOR, 0.02));
  };

  const left = arm(1, pose.armL);
  const right = arm(-1, pose.armR);
  leg(1, pose.legL, pose.footL);
  leg(-1, pose.legR, pose.footR);

  for (const which of pose.balls ?? []) {
    let c: THREE.Vector3;
    if (which === "overhead") c = left.clone().add(right).multiplyScalar(0.5).add(new THREE.Vector3(0, M.ball * 0.9, 0.01));
    else {
      const h = which === "handL" ? left : right;
      const above = which === "handR" ? pose.armR[1][1] > 0.5 : pose.armL[1][1] > 0.5;
      // Balón bajo la palma (Wilt) o encima de la mano (gancho)
      c = h.clone().add(new THREE.Vector3(0, above ? M.ball * 0.85 : -M.ball * 0.95, 0));
    }
    prims.push(cone(c, c, M.ball, M.ball, 0.004));
  }
  return { prims, hands: { left, right }, ankles };
}

const UP_VECTOR = new THREE.Vector3(0, 1, 0);

function transformPrim(p: Prim, m: THREE.Matrix4): Prim {
  const rot = new THREE.Matrix3().setFromMatrix4(m);
  if (p.kind === "cone") return { ...p, a: p.a.clone().applyMatrix4(m), b: p.b.clone().applyMatrix4(m) };
  return { ...p, c: p.c.clone().applyMatrix4(m), x: p.x.clone().applyMatrix3(rot), y: p.y.clone().applyMatrix3(rot), z: p.z.clone().applyMatrix3(rot) };
}

/** Roca: bultos grandes y aristas suaves (determinista: la misma figura siempre). */
function rockNoise(x: number, y: number, z: number) {
  return (
    0.6 * Math.sin(13 * x + 1.7) * Math.sin(17 * y + 0.3) * Math.sin(15 * z + 2.2) +
    0.4 * Math.sin(29 * x + 4.1) * Math.sin(23 * y + 1.3) * Math.sin(31 * z + 0.7)
  );
}

/** Piel de bronce fundido en bruto: grano fino. */
function castNoise(x: number, y: number, z: number) {
  return (
    0.55 * Math.sin(37 * x + 1.7) * Math.sin(31 * y + 0.3) * Math.sin(41 * z + 2.2) +
    0.3 * Math.sin(83 * x + 4.1) * Math.sin(71 * y + 1.3) * Math.sin(97 * z + 0.7) +
    0.15 * Math.sin(151 * x + y * 137 + z * 113)
  );
}

export type FigureResult = {
  /** Una sola malla con toda la figura (y los balones), pies en y = 0, centrada en x. */
  geometry: THREE.BufferGeometry;
  /** Mano que sostiene el balón (Michael Jordan Trophy: el cristal va aparte). */
  reachHand: THREE.Vector3;
};

const cache = new Map<string, FigureResult>();

/**
 * Figura de una pose (se calcula una vez por sesión y se reutiliza: no se libera al desmontar).
 * `sculpture`: la del Michael Jordan Trophy, sin ropa y saliendo de una roca fundida con las piernas;
 * de bruto (rugosa) abajo a pulida arriba, con los atributos `color` y `polish` (0 bruto, 1 pulido).
 */
export function figureGeometry(name: FigurePose, resolution = 96, sculpture = false): FigureResult {
  const key = `${name}:${resolution}:${sculpture}`;
  const cached = cache.get(key);
  if (cached) return cached;
  let prims: Prim[];
  let reachHand = new THREE.Vector3();
  let roughen: ((x: number, y: number, z: number) => number) | undefined;
  let polish: ((y: number) => number) | undefined;
  if (name === "handshake") {
    // Dos figuras frente a frente que se dan la mano derecha
    prims = [];
    for (const s of [1, -1] as const) {
      const one = buildFigure(POSES.handshake);
      const m = new THREE.Matrix4().makeTranslation(-s * 0.2, 0, 0).multiply(new THREE.Matrix4().makeRotationY((s * Math.PI) / 2));
      prims.push(...one.prims.map((p) => transformPrim(p, m)));
    }
  } else {
    const built = buildFigure(POSES[name], !sculpture);
    prims = built.prims;
    reachHand = built.hands.right;
    if (sculpture) {
      // La roca de la que sale: un bloque irregular fundido con los pies y las piernas
      const floor = Math.min(...built.ankles.map((a) => a.y));
      const rockY = floor + 0.01;
      prims.push(ellipsoid(new THREE.Vector3(0, rockY, 0.02), [0.25, 0.07, 0.2], UP_VECTOR, new THREE.Vector3(0, 0, 1), 0.07));
      prims.push(ellipsoid(new THREE.Vector3(-0.08, rockY + 0.04, -0.04), [0.12, 0.06, 0.11], UP_VECTOR, new THREE.Vector3(0, 0, 1), 0.06));
      prims.push(ellipsoid(new THREE.Vector3(0.11, rockY + 0.02, 0.07), [0.1, 0.05, 0.09], UP_VECTOR, new THREE.Vector3(0, 0, 1), 0.06));
      const smooth = THREE.MathUtils.smoothstep;
      roughen = (x, y, z) => {
        const rock = 1 - smooth(y, rockY + 0.03, rockY + 0.16);
        const raw = 1 - smooth(y, -0.32, 0.06);
        return rockNoise(x, y, z) * 0.022 * rock + castNoise(x, y, z) * 0.004 * raw;
      };
      polish = (y) => smooth(y, -0.28, 0.14);
    }
  }
  const geometry = polygonize(prims, resolution, roughen);
  if (polish) {
    const pos = geometry.attributes.position;
    const raw = new THREE.Color("#6e4c26");
    const shine = new THREE.Color("#ffffff");
    const tmp = new THREE.Color();
    const colors = new Float32Array(pos.count * 3);
    const amount = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const t = polish(pos.getY(i));
      amount[i] = t;
      tmp.copy(raw).lerp(shine, t);
      colors.set([tmp.r, tmp.g, tmp.b], i * 3);
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("polish", new THREE.BufferAttribute(amount, 1));
  }
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const dx = -(box.min.x + box.max.x) / 2;
  const dy = -box.min.y;
  geometry.translate(dx, dy, 0);
  geometry.computeBoundingBox();
  reachHand.add(new THREE.Vector3(dx, dy, 0));
  const result = { geometry, reachHand };
  cache.set(key, result);
  return result;
}
