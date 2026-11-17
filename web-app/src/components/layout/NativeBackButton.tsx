"use client";

import { useEffect } from "react";
import { onNativeBackButton } from "@/lib/native";

/** Botón atrás de Android en la app nativa; en la web no hace nada. */
export function NativeBackButton() {
  useEffect(() => onNativeBackButton(), []);
  return null;
}
