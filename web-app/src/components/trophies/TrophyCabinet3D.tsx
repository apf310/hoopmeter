"use client";

// Vitrina 3D: un escenario con el trofeo elegido (se gira arrastrando, `frameloop="demand"`: sin
// dibujar nada mientras no se toca) y miniaturas renderizadas una sola vez con el mismo modelo.
// Al aparecer en pantalla el trofeo da una vuelta completa y, al pararse, un destello recorre el metal.
// Solo se carga bajo demanda (next/dynamic desde `TrophyShowcase`).

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { Canvas, useFrame, useThree, type RootState } from "@react-three/fiber";
import * as THREE from "three";
import { cn } from "@/lib/utils";
import { loadPlaqueFont, restAngle, TrophyModel } from "./Trophy3D";
import { Backdrop, Studio, TROPHY_CAMERA, TROPHY_LOOK_AT } from "./trophy-kit";
import { TrophyIcon } from "./TrophyIcon";
import type { Metal, TrophyGroup } from "./trophy-catalog";

type Spin = {
  angle: number;
  velocity: number;
  dragging: boolean;
  intro: { t: number; from: number; seconds: number } | null;
  /** Segundos desde que empezó el destello (null = sin destello). */
  glint: number | null;
};

const GLINT_SECONDS = 0.85;

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

let glintTextureCache: THREE.Texture | null = null;
/** Estrella de cuatro puntas con halo, para el destello. */
function glintTexture() {
  if (glintTextureCache) return glintTextureCache;
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const mid = size / 2;
  const halo = ctx.createRadialGradient(mid, mid, 0, mid, mid, mid * 0.45);
  halo.addColorStop(0, "rgba(255,250,230,1)");
  halo.addColorStop(0.25, "rgba(255,230,170,0.55)");
  halo.addColorStop(1, "rgba(255,200,120,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, size, size);
  // Rayos largos en cruz y cortos en diagonal
  for (const [w, len, turn] of [
    [7, mid, 0],
    [4, mid * 0.55, Math.PI / 4],
  ] as const) {
    for (let k = 0; k < 2; k++) {
      ctx.save();
      ctx.translate(mid, mid);
      ctx.rotate((k * Math.PI) / 2 + turn);
      const ray = ctx.createLinearGradient(-len, 0, len, 0);
      ray.addColorStop(0, "rgba(255,255,255,0)");
      ray.addColorStop(0.5, "rgba(255,255,255,1)");
      ray.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = ray;
      ctx.beginPath();
      ctx.moveTo(-len, 0);
      ctx.quadraticCurveTo(0, -w, len, 0);
      ctx.quadraticCurveTo(0, w, -len, 0);
      ctx.fill();
      ctx.restore();
    }
  }
  glintTextureCache = new THREE.CanvasTexture(c);
  glintTextureCache.colorSpace = THREE.SRGBColorSpace;
  return glintTextureCache;
}

const raycaster = new THREE.Raycaster();
const box = new THREE.Box3();

/** Punto de la superficie del trofeo (no de la peana) arriba a la derecha, visto desde la cámara: ahí brilla el destello. */
function glintPoint(root: THREE.Object3D, camera: THREE.Camera): THREE.Vector3 | null {
  root.updateMatrixWorld(true);
  box.setFromObject(root);
  const top = box.max.y;
  if (top <= 0.2) return null;
  const width = box.max.x - box.min.x;
  for (const [fx, fy] of [
    [0.16, 0.86],
    [0.08, 0.74],
    [0, 0.9],
    [-0.1, 0.7],
    [0.12, 0.55],
  ]) {
    const target = new THREE.Vector3(box.min.x + width * (0.5 + fx), top * fy, box.max.z).project(camera);
    raycaster.setFromCamera(new THREE.Vector2(target.x, target.y), camera);
    const hit = raycaster.intersectObject(root, true).find((h) => h.point.y > 0.05 && h.object.type === "Mesh");
    if (hit) return hit.point.clone().add(raycaster.ray.direction.clone().multiplyScalar(-0.05));
  }
  return null;
}

/** Gira el trofeo (entrada, arrastre e inercia) y dispara el destello. Pide fotogramas solo mientras algo se mueve. */
function Spinner({ spinRef, rest, children }: { spinRef: MutableRefObject<Spin>; rest: number; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const glintRef = useRef<THREE.Sprite>(null);
  const camera = useThree((s) => s.camera);
  const glintMaterial = useMemo(
    () => new THREE.SpriteMaterial({ map: glintTexture(), blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, toneMapped: false }),
    []
  );

  useFrame((state, delta) => {
    const s = spinRef.current;
    const dt = Math.min(delta, 0.1);
    if (s.intro) {
      s.intro.t += dt;
      const t = Math.min(1, s.intro.t / s.intro.seconds);
      const eased = 1 - Math.pow(1 - t, 3);
      s.angle = s.intro.from + eased * (rest - s.intro.from);
      if (t >= 1) {
        s.intro = null;
        s.glint = 0;
      }
      state.invalidate();
    } else if (!s.dragging && Math.abs(s.velocity) > 0.0004) {
      s.angle += s.velocity;
      s.velocity *= Math.pow(0.9, dt * 60);
      state.invalidate();
    }
    if (ref.current) ref.current.rotation.y = s.angle;

    const sprite = glintRef.current;
    if (!sprite) return;
    if (s.glint === 0 && ref.current) {
      const point = glintPoint(ref.current, camera);
      if (point) sprite.position.copy(point);
      else s.glint = null;
    }
    if (s.glint != null && !s.dragging) {
      s.glint += dt;
      const t = Math.min(1, s.glint / GLINT_SECONDS);
      sprite.scale.setScalar(0.62 * Math.sin(Math.PI * t));
      sprite.material.rotation = t * 1.6;
      if (t >= 1) s.glint = null;
      state.invalidate();
    } else {
      sprite.scale.setScalar(0);
    }
  });

  return (
    <>
      <group ref={ref}>{children}</group>
      <sprite ref={glintRef} material={glintMaterial} scale={0} renderOrder={10} />
    </>
  );
}

function aimCamera(state: RootState) {
  state.camera.lookAt(TROPHY_LOOK_AT);
}

/** Renderiza cada trofeo una vez a imagen (miniaturas) y se desmonta: un solo contexto WebGL extra, un momento. */
function Shooter({ groups, name, onShot }: { groups: TrophyGroup[]; name?: string; onShot: (key: string, url: string) => void }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (index >= groups.length) return;
    const id = requestAnimationFrame(() => {
      gl.render(scene, camera);
      onShot(groups[index].key, gl.domElement.toDataURL("image/webp", 0.9));
      setIndex(index + 1);
    });
    return () => cancelAnimationFrame(id);
  }, [index, groups, gl, scene, camera, onShot]);
  const group = groups[index];
  if (!group) return null;
  return (
    <>
      <Backdrop glow={GLOW[group.metal]} />
      <group rotation={[0, restAngle(group.design), 0]}>
        <TrophyModel key={group.key} group={group} name={name} />
      </group>
    </>
  );
}

const GLOW: Record<Metal, string> = {
  gold: "rgba(251,191,36,0.2)",
  bronze: "rgba(251,146,60,0.16)",
  silver: "rgba(186,200,220,0.15)",
  steel: "rgba(148,163,184,0.13)",
};

export default function TrophyCabinet3D({ groups, name }: { groups: TrophyGroup[]; name?: string }) {
  const [selected, setSelected] = useState(groups[0]?.key);
  const [shots, setShots] = useState<Record<string, string>>({});
  const [fontReady, setFontReady] = useState(false);
  const [touched, setTouched] = useState(false);
  const [seen, setSeen] = useState(false);
  const spin = useRef<Spin>({ angle: restAngle(groups[0]?.design ?? "medal"), velocity: 0, dragging: false, intro: null, glint: null });
  const invalidate = useRef<() => void>(() => {});
  const lastX = useRef(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const introduced = useRef(false);

  const current = groups.find((g) => g.key === selected) ?? groups[0];
  const rest = restAngle(current?.design ?? "medal");
  const shooting = fontReady && groups.length > 1 && groups.some((g) => !shots[g.key]);

  useEffect(() => {
    let alive = true;
    loadPlaqueFont().then(() => alive && setFontReady(true));
    return () => {
      alive = false;
    };
  }, []);

  // La primera vuelta, solo cuando la vitrina se ve de verdad en pantalla
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { threshold: 0.55 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Vuelta completa la primera vez; media vuelta al elegir otro trofeo
  useEffect(() => {
    if (!seen || !fontReady) return;
    const s = spin.current;
    s.velocity = 0;
    s.glint = null;
    if (reducedMotion()) {
      s.angle = rest;
      s.intro = null;
    } else {
      const first = !introduced.current;
      s.intro = first ? { t: 0, from: rest - Math.PI * 2, seconds: 1.9 } : { t: 0, from: rest - Math.PI, seconds: 1.15 };
    }
    introduced.current = true;
    invalidate.current();
  }, [selected, seen, fontReady, rest]);

  const onShot = useCallback((key: string, url: string) => setShots((prev) => ({ ...prev, [key]: url })), []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = spin.current;
    s.dragging = true;
    s.intro = null;
    s.velocity = 0;
    lastX.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = spin.current;
    if (!s.dragging) return;
    const dx = e.clientX - lastX.current;
    lastX.current = e.clientX;
    s.angle += dx * 0.012;
    s.velocity = dx * 0.012;
    if (!touched && Math.abs(dx) > 0) setTouched(true);
    invalidate.current();
  };
  const onPointerUp = () => {
    spin.current.dragging = false;
    invalidate.current();
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    spin.current.intro = null;
    spin.current.velocity = (e.key === "ArrowLeft" ? -1 : 1) * 0.06;
    invalidate.current();
  };

  if (!current) return null;
  const glow = GLOW[current.metal];

  return (
    <div className="border-y border-slate-800">
      <div className="grid md:grid-cols-[minmax(0,1fr)_18rem]">
        <div
          ref={stageRef}
          className="relative h-[22rem] cursor-grab touch-pan-y select-none overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-500 active:cursor-grabbing md:h-[26rem]"
          style={{
            // Haz de luz cenital de vitrina + halo del metal + reflejo en el suelo
            background: [
              "radial-gradient(ellipse 26% 75% at 50% -8%, rgba(255,255,255,0.075), transparent 72%)",
              `radial-gradient(ellipse 58% 52% at 50% 40%, ${glow}, transparent 70%)`,
              `radial-gradient(ellipse 34% 7% at 50% 91%, ${glow}, transparent 75%)`,
              "#020617",
            ].join(", "),
          }}
          role="img"
          aria-label={`${current.label}${current.count > 1 ? ` ×${current.count}` : ""}. Arrastra o usa las flechas para girarlo.`}
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
        >
          {fontReady && (
            <Canvas
              frameloop="demand"
              shadows="percentage"
              dpr={[1, 2]}
              camera={TROPHY_CAMERA}
              gl={{ antialias: true, alpha: true }}
              onCreated={(state) => {
                aimCamera(state);
                invalidate.current = state.invalidate;
                state.invalidate();
              }}
            >
              <Studio />
              <Backdrop glow={glow} />
              <Spinner spinRef={spin} rest={rest}>
                <TrophyModel key={current.key} group={current} name={name} />
              </Spinner>
            </Canvas>
          )}
          <p
            className={cn(
              "pointer-events-none absolute inset-x-0 top-2.5 text-center font-display text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400 transition-opacity duration-500",
              touched && "opacity-0"
            )}
          >
            ⟲ Arrastra para girar
          </p>
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-800 p-4 md:border-l md:border-t-0">
          <p className="font-display text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">
            {current.major ? "Gran trofeo" : "Trofeo"}
          </p>
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-display text-3xl font-extrabold uppercase leading-none text-white">{current.label}</h3>
              {current.trophy && <p className="mt-1.5 text-sm text-slate-300">{current.trophy}</p>}
            </div>
            <span className={cn("font-display text-5xl font-extrabold leading-none tabular-nums", current.major ? "text-amber-300" : "text-white")}>
              {current.count}
              <span className="ml-0.5 text-2xl text-slate-500">×</span>
            </span>
          </div>
          {current.detail && <p className="font-display text-sm font-semibold text-slate-300">{current.detail}</p>}
          {current.seasons.length > 0 && <p className="text-xs leading-relaxed text-slate-400">{current.seasons.join(" · ")}</p>}
        </div>
      </div>

      {groups.length > 1 && (
        <ul className="grid grid-cols-3 border-t border-slate-800 sm:grid-cols-4 lg:grid-cols-6">
          {groups.map((g) => {
            const active = g.key === current.key;
            return (
              <li key={g.key} className="border-b border-r border-slate-800 bg-slate-950">
                <button
                  type="button"
                  onClick={() => setSelected(g.key)}
                  aria-pressed={active}
                  className={cn(
                    "relative flex w-full flex-col items-center gap-1 px-1.5 pb-2.5 pt-1 text-center transition-colors hover:bg-slate-900",
                    active && "bg-slate-900 shadow-[inset_0_-3px_0_#f97316]"
                  )}
                >
                  <span className="flex aspect-[4/5] w-full max-w-28 items-center justify-center">
                    {shots[g.key] ? (
                      // La miniatura lleva el fondo de la vitrina (el cristal lo necesita en la escena): con `lighten` se
                      // funde con el de la casilla, también elegida o con el ratón encima
                      // eslint-disable-next-line @next/next/no-img-element -- miniatura generada en el navegador (data URL)
                      <img src={shots[g.key]} alt="" className="size-full object-contain mix-blend-lighten" />
                    ) : (
                      <TrophyIcon group={g} className="size-10 opacity-60" />
                    )}
                  </span>
                  <span className="font-display text-xs font-bold uppercase leading-tight tracking-wide text-white">{g.label}</span>
                  <span
                    className={cn(
                      "absolute right-1.5 top-1.5 font-display text-lg font-extrabold leading-none tabular-nums",
                      g.major ? "text-amber-300" : "text-slate-200"
                    )}
                  >
                    {g.count}×
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {shooting && (
        <div aria-hidden className="pointer-events-none fixed left-[-10000px] top-0 h-[300px] w-[240px]">
          <Canvas frameloop="never" shadows="percentage" dpr={2} camera={TROPHY_CAMERA} gl={{ antialias: true, alpha: true }} onCreated={aimCamera}>
            <Studio />
            <Shooter groups={groups} name={name} onShot={onShot} />
          </Canvas>
        </div>
      )}
    </div>
  );
}
