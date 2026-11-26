"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { CardTier } from "@/lib/player-card";
import { acquireMasks, releaseMasks, type HuellaMasks } from "./huella-paint";

export type HuellaPart = { part: "main" | "accent"; className: string };

/**
 * Capas de la huella de la carta de la página (Tarea 7.11): en el HTML solo viajan los seis valores; el dibujo se
 * hace en el navegador, en un canvas, y se usa de máscara del brillo del material. Hasta tenerlo, las capas no se
 * ven (aparecen con un fundido); en las cartas pequeñas, solo al acercarse a la pantalla.
 */
export function CardHuella({ tier, values, parts, mini = false }: { tier: CardTier; values: number[]; parts: HuellaPart[]; mini?: boolean }) {
  const key = values.join(",");
  // Con la clave: si la carta pasa a ser de otro jugador, no se enseñan las máscaras del anterior
  const [ready, setReady] = useState<{ key: string; masks: HuellaMasks } | null>(null);
  const urls = ready?.key === `${tier}|${key}` ? ready.masks : null;
  const first = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = first.current;
    if (!node) return;
    let acquired: string | null = null;
    let alive = true;
    const start = () => {
      const { key: id, promise } = acquireMasks(tier, key.split(",").map(Number), mini);
      acquired = id;
      promise.then((masks) => alive && setReady({ key: `${tier}|${key}`, masks })).catch(() => undefined);
    };
    let observer: IntersectionObserver | null = null;
    if (mini && "IntersectionObserver" in window) {
      observer = new IntersectionObserver(
        ([entry]) => {
          if (!entry.isIntersecting) return;
          observer?.disconnect();
          start();
        },
        { rootMargin: "400px" }
      );
      observer.observe(node);
    } else start();
    return () => {
      alive = false;
      observer?.disconnect();
      if (acquired) releaseMasks(acquired);
    };
  }, [tier, key, mini]);

  return parts.map(({ part, className }, i) => (
    <div
      key={part + className}
      ref={i === 0 ? first : undefined}
      className={`${className} hc-huella`}
      data-ready={urls ? "" : undefined}
      style={urls ? ({ "--m": `url(${urls[part]})` } as CSSProperties) : undefined}
    />
  ));
}
