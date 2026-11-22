"use client";

// Escena del logo 3D: se gira arrastrando (`frameloop="demand"`: sin dibujar mientras no se toca).

import { Canvas } from "@react-three/fiber";
import { Center, OrbitControls } from "@react-three/drei";
import { Studio } from "@/components/trophies/trophy-kit";
import { LogoLockup3D } from "./LogoMark3D";

export default function Logo3DScene() {
  return (
    <Canvas frameloop="demand" dpr={[1, 2]} camera={{ position: [0.9, 0.5, 11], fov: 32 }} gl={{ alpha: true }} aria-label="Hoopmeter" role="img">
      <Studio />
      <Center>
        <LogoLockup3D layout="stacked" />
      </Center>
      <OrbitControls enablePan={false} enableZoom={false} minPolarAngle={Math.PI / 3} maxPolarAngle={(2 * Math.PI) / 3} />
    </Canvas>
  );
}
