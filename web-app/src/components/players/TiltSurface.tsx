"use client";

import { useEffect, useRef, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { TILT_REST, tiltAt } from "@/lib/player-card";
import { cn } from "@/lib/utils";

type Pose = typeof TILT_REST;
type Motion = { pose: Pose; target: Pose };

// Solo una ficha inclinada a la vez en toda la página, y el bucle solo corre mientras algo se mueve
const moving = new Map<HTMLElement, Motion>();
let active: HTMLElement | null = null;
let frame = 0;

const KEYS = Object.keys(TILT_REST) as (keyof Pose)[];

function step() {
  frame = 0;
  for (const [surface, motion] of moving) {
    const target = surface === active ? motion.target : TILT_REST;
    let settled = true;
    for (const key of KEYS) {
      const delta = target[key] - motion.pose[key];
      if (Math.abs(delta) > 0.02) {
        motion.pose[key] += delta * 0.16;
        settled = false;
      } else {
        motion.pose[key] = target[key];
      }
      surface.style.setProperty(`--${key}`, motion.pose[key].toFixed(3));
    }
    if ((settled && surface !== active) || !surface.isConnected) moving.delete(surface);
    else if (settled) continue;
    if (!settled) schedule();
  }
}

function schedule() {
  if (!frame) frame = requestAnimationFrame(step);
}

function tilt(surface: HTMLElement, target: Pose) {
  const motion = moving.get(surface) ?? { pose: { ...TILT_REST }, target };
  motion.target = target;
  moving.set(surface, motion);
  active = surface;
  schedule();
}

function release(surface: HTMLElement) {
  if (active !== surface) return;
  active = null;
  schedule();
}

const calm = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const GREETING_MS = 900;

type TiltSurfaceProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Un barrido de luz al aparecer, para que se vea que la ficha se mueve. */
  greet?: boolean;
};

/**
 * Superficie que se inclina hacia el ratón o el dedo (Tarea 7.4), sin giroscopio. Con el dedo, el gesto
 * vertical sigue siendo del scroll: el navegador lo cancela y la ficha vuelve a su sitio. Con "reducir
 * movimiento" se queda quieta. Solo escribe variables CSS: no vuelve a pintar nada de React.
 */
export function TiltSurface({ children, className, style, greet = false }: TiltSurfaceProps) {
  const ref = useRef<HTMLDivElement>(null);
  const pressed = useRef(false);

  useEffect(() => {
    const surface = ref.current;
    if (!surface) return;
    let raf = 0;
    if (greet && !calm()) {
      let start = 0;
      const sweep = (now: number) => {
        start ||= now;
        const progress = (now - start) / GREETING_MS;
        // Si alguien ya la está tocando (esta u otra), se deja
        if (pressed.current || (active !== null && active !== surface)) return;
        if (progress >= 1) return release(surface);
        tilt(surface, tiltAt(0.15 + 0.7 * progress, 0.35));
        raf = requestAnimationFrame(sweep);
      };
      raf = requestAnimationFrame(sweep);
    }
    return () => {
      cancelAnimationFrame(raf);
      moving.delete(surface);
      if (active === surface) active = null;
    };
  }, [greet]);

  function onMove(event: PointerEvent<HTMLDivElement>) {
    if (calm() || (event.pointerType === "touch" && !pressed.current)) return;
    const surface = event.currentTarget;
    const box = surface.getBoundingClientRect();
    tilt(surface, tiltAt((event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height));
  }

  function onDown(event: PointerEvent<HTMLDivElement>) {
    pressed.current = true;
    onMove(event);
  }

  function onUp(event: PointerEvent<HTMLDivElement>) {
    pressed.current = false;
    if (event.pointerType !== "mouse") release(event.currentTarget);
  }

  function onLeave(event: PointerEvent<HTMLDivElement>) {
    pressed.current = false;
    release(event.currentTarget);
  }

  return (
    <div
      ref={ref}
      className={cn("hc", className)}
      style={style}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onPointerLeave={onLeave}
    >
      {children}
    </div>
  );
}
