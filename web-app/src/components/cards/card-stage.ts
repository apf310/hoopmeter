// Escenario de la carta 3D (Tarea 7.11, del prototipo del 25-nov): estudio con foco, sombra y fondo dentro de la
// escena. Dos usos: el visor del inspector (arrastrar gira 360°, tocar da la vuelta; solo dibuja mientras se ve) y un
// render fuera de pantalla para la imagen y el vídeo de compartir. Solo navegador.
import * as THREE from "three";
import { cardVideoPose, type CardVideoPose } from "@/lib/card-video";
import type { CardSpec } from "@/lib/player-card";
import { dispose, loadCardFonts, studio } from "./card-kit";
import { buildCard, CARD_GLOW, loadCardImages } from "./card-model";

const calm = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** WebGL disponible (sin él, el inspector enseña la versión plana y no se ofrece el vídeo). */
export function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Carga fuentes e imágenes y monta la carta (lo lento: se hace una vez por carta). */
export async function prepareCard(spec: CardSpec): Promise<THREE.Group> {
  const [images] = await Promise.all([loadCardImages(spec), loadCardFonts()]);
  return buildCard(spec, images);
}

type Scene = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  key: THREE.DirectionalLight;
  pivot: THREE.Group;
  floor: THREE.Mesh;
  setGlow: (glow: string | null) => void;
  frame: (aspect: number) => void;
  destroy: () => void;
};

/** Fondo dentro de la escena: el brillo del material detrás de la carta. */
function backdrop(glow: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#020617";
  ctx.fillRect(0, 0, 512, 512);
  const ellipse = (cx: number, cy: number, rx: number, ry: number, color: string, stop: number) => {
    ctx.save();
    ctx.translate(cx * 512, cy * 512);
    ctx.scale(rx * 512, ry * 512);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, color);
    g.addColorStop(stop, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(-2, -2, 4, 4);
    ctx.restore();
  };
  ellipse(0.5, 0.93, 0.4, 0.08, glow, 0.8);
  ellipse(0.5, 0.46, 0.56, 0.5, glow, 0.9);
  ellipse(0.5, -0.06, 0.3, 0.7, "rgba(255,255,255,.1)", 0.8);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function createScene(renderer: THREE.WebGLRenderer, { height = 4.15, width = 3.0 } = {}): Scene {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  const environment = studio(renderer);
  scene.environment = environment;
  const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 60);
  const key = new THREE.DirectionalLight("#ffffff", 2.1);
  key.position.set(2.4, 4.2, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.012;
  Object.assign(key.shadow.camera, { left: -2.4, right: 2.4, top: 2.6, bottom: -2.4, near: 1, far: 14 });
  scene.add(key, new THREE.AmbientLight("#8fa5c8", 0.25));
  const pivot = new THREE.Group();
  scene.add(pivot);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.ShadowMaterial({ opacity: 0.4 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.63;
  floor.receiveShadow = true;
  floor.visible = false;
  scene.add(floor);

  const setGlow = (glow: string | null) => {
    (scene.background as THREE.Texture | null)?.dispose?.();
    scene.background = glow ? backdrop(glow) : null;
  };
  // Encuadre: toda la carta, también en un móvil estrecho
  const frame = (aspect: number) => {
    camera.aspect = aspect;
    const t = Math.tan((camera.fov * Math.PI) / 360);
    const dist = Math.max(height / 2 / t, width / 2 / t / aspect);
    camera.position.set(0, 0, dist + 0.4);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  };
  const destroy = () => {
    for (const child of [...pivot.children]) {
      pivot.remove(child);
      dispose(child);
    }
    dispose(floor);
    setGlow(null);
    environment.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  };
  return { renderer, scene, camera, key, pivot, floor, setGlow, frame, destroy };
}

// ---------------------------------------------------------------- visor del inspector

export type CardViewer = {
  flip: () => void;
  destroy: () => void;
};

/**
 * Visor a pantalla completa: arrastrar gira (360°, con inercia), tocar da la vuelta y en reposo vuelve a mirar de
 * frente (a la cara más cercana) meciéndose un poco. Al abrirse da una vuelta entera. Solo dibuja con la pestaña a la
 * vista; `destroy` libera la GPU.
 */
export function createCardViewer(host: HTMLElement, card: THREE.Group, spec: CardSpec, { onFace }: { onFace?: (face: "front" | "back") => void } = {}): CardViewer {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  const s = createScene(renderer);
  s.setGlow(CARD_GLOW[spec.tier]);
  s.pivot.add(card);
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.touchAction = "none";
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  host.prepend(canvas);

  const still = calm();
  // Entra girando una vuelta entera hasta el reposo
  const pose = { ry: still ? -0.45 : -0.45 - Math.PI * 2, rx: 0.08, vy: 0, flip: 0, flipTo: 0, drag: false, moved: 0, idle: still ? 2 : -0.4 };
  let face: "front" | "back" = "front";
  let time = 0;
  let last = performance.now();
  let raf = 0;
  let x = 0;
  let y = 0;

  const resize = () => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    s.frame(w / h);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  const flip = () => (pose.flipTo += Math.PI);
  const down = (e: PointerEvent) => {
    pose.drag = true;
    pose.moved = 0;
    pose.vy = 0;
    x = e.clientX;
    y = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (!pose.drag) return;
    const dx = e.clientX - x;
    const dy = e.clientY - y;
    x = e.clientX;
    y = e.clientY;
    pose.moved += Math.abs(dx) + Math.abs(dy);
    pose.ry += dx * 0.0095;
    pose.vy = dx * 0.0095;
    pose.rx = Math.max(-0.55, Math.min(0.55, pose.rx + dy * 0.006));
    pose.idle = 0;
  };
  const up = (e: PointerEvent) => {
    if (!pose.drag) return;
    pose.drag = false;
    if (e.type === "pointerup" && pose.moved < 6) flip();
  };
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);

  const step = (now: number) => {
    raf = requestAnimationFrame(step);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (document.hidden) return;
    time += dt;
    if (!pose.drag) {
      pose.idle += dt;
      pose.ry += pose.vy;
      pose.vy *= 0.94;
      if (pose.idle < 0.9 && !still) {
        // Vuelta de bienvenida: acaba justo en el reposo
        pose.ry += (-0.45 - pose.ry) * Math.min(1, dt * 3.2);
      } else if (pose.idle > 1.1) {
        const near = Math.round(pose.ry / Math.PI) * Math.PI;
        const sway = still ? 0 : Math.sin(time * 0.8) * 0.34;
        pose.ry += (near + sway - pose.ry) * Math.min(1, dt * 1.8);
        pose.rx += ((still ? 0 : Math.sin(time * 0.63) * 0.09) - pose.rx) * Math.min(1, dt * 1.8);
      }
    }
    pose.flip += (pose.flipTo - pose.flip) * Math.min(1, dt * 7);
    s.pivot.rotation.set(pose.rx, pose.ry + pose.flip, 0);
    const facing = Math.cos(pose.ry + pose.flip) >= 0 ? "front" : "back";
    if (facing !== face) {
      face = facing;
      onFace?.(face);
    }
    renderer.render(s.scene, s.camera);
  };
  raf = requestAnimationFrame(step);

  return {
    flip,
    destroy: () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.remove();
      s.destroy();
    },
  };
}

// ---------------------------------------------------------------- render fuera de pantalla (imagen y vídeo)

type Offscreen = { scene: Scene; width: number; height: number };
let offscreen: Offscreen | null = null;

/**
 * Un solo renderizador fuera de pantalla para la imagen y el vídeo de compartir (WebGL tiene pocos contextos): se
 * reutiliza y cambia de tamaño según lo que se pida. Fondo transparente: lo pone quien compone la imagen.
 */
function offscreenScene(width: number, height: number): Scene {
  if (!offscreen) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    const scene = createScene(renderer, { height: 3.72, width: 2.66 });
    scene.setGlow(null);
    offscreen = { scene, width: 0, height: 0 };
  }
  if (offscreen.width !== width || offscreen.height !== height) {
    offscreen.scene.renderer.setSize(width, height, false);
    offscreen.scene.frame(width / height);
    offscreen.width = width;
    offscreen.height = height;
  }
  return offscreen.scene;
}

/** Dibuja la carta con una pose y devuelve el lienzo (válido hasta el siguiente render). */
export function renderCard(card: THREE.Group, width: number, height: number, pose: Partial<CardVideoPose> = {}): HTMLCanvasElement {
  const s = offscreenScene(width, height);
  if (card.parent !== s.pivot) {
    for (const child of [...s.pivot.children]) s.pivot.remove(child);
    s.pivot.add(card);
  }
  const { ry = -0.42, rx = 0.07, rise = 1, light = 1 } = pose;
  s.pivot.rotation.set(rx, ry, 0);
  s.pivot.position.y = -1.4 * (1 - rise);
  s.scene.environmentIntensity = 0.04 + 0.96 * light;
  s.key.intensity = 0.04 + 2.06 * light;
  s.renderer.render(s.scene, s.camera);
  return s.renderer.domElement;
}

/** Carta un poco girada, en PNG con fondo transparente (imagen de compartir). */
export async function cardSnapshot(spec: CardSpec, width: number, height: number): Promise<string> {
  const card = await prepareCard(spec);
  try {
    return renderCard(card, width, height).toDataURL("image/png");
  } finally {
    offscreen?.scene.pivot.remove(card);
    dispose(card);
  }
}

/** Para el vídeo: monta la carta una vez y devuelve el dibujo de cada instante. */
export async function cardFrames(spec: CardSpec, width: number, height: number): Promise<(t: number) => { canvas: HTMLCanvasElement; pose: CardVideoPose }> {
  const card = await prepareCard(spec);
  return (t) => {
    const pose = cardVideoPose(t);
    return { canvas: renderCard(card, width, height, pose), pose };
  };
}
