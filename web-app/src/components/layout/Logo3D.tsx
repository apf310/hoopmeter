"use client";

// Logo en 3D (balón, arco y HOOPMETER) para pantallas de marca como la 404. Three.js se descarga
// solo aquí y bajo demanda; mientras tanto, o sin WebGL, se ve el logo plano.

import { useEffect, useState, type ComponentType } from "react";
import { LogoMark } from "./LogoMark";

export function Logo3D({ className }: { className?: string }) {
  const [Scene, setScene] = useState<ComponentType | null>(null);
  useEffect(() => {
    let alive = true;
    try {
      const canvas = document.createElement("canvas");
      if (!(canvas.getContext("webgl2") ?? canvas.getContext("webgl"))) return;
    } catch {
      return;
    }
    import("./Logo3DScene").then((m) => alive && setScene(() => m.default)).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return (
    <div className={className}>
      {Scene ? (
        <Scene />
      ) : (
        <div className="flex size-full items-center justify-center">
          <LogoMark className="size-24" />
        </div>
      )}
    </div>
  );
}
