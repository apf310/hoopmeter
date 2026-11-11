"use client";

import { useEffect } from "react";
import { isNativeApp } from "@/lib/native";

/** Registra el service worker de la PWA. La app nativa no lo usa: tiene su propia página sin conexión. */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || isNativeApp() || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(console.error);
  }, []);

  return null;
}
