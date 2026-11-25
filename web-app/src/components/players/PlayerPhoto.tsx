"use client";

import { useState, type SyntheticEvent } from "react";
import Image, { type ImageProps } from "next/image";
import { playerHeadshotUrl } from "@/lib/nba-cdn";
import { SILHOUETTE } from "@/lib/silhouette";

/**
 * Foto oficial de un jugador (Tarea 7.6): si la NBA no la tiene o no carga, la silueta propia en vez del icono de
 * imagen rota. `alt` vacío por defecto: el nombre va siempre en texto al lado.
 */
export function PlayerPhoto({ id, alt = "", ...props }: Omit<ImageProps, "id" | "src" | "alt" | "onError"> & { id: number; alt?: string }) {
  // El id que falló: si el componente pasa a otro jugador, se vuelve a intentar con su foto
  const [failedId, setFailedId] = useState<number | null>(null);
  return <Image {...props} src={failedId === id ? SILHOUETTE : playerHeadshotUrl(id)} alt={alt} onError={() => setFailedId(id)} />;
}

/** Lo mismo para los `<img>` de las tarjetas que se exportan (`next/image` no sirve para eso). */
export function showSilhouette({ currentTarget: img }: SyntheticEvent<HTMLImageElement>) {
  if (img.src !== SILHOUETTE) img.src = SILHOUETTE;
}
