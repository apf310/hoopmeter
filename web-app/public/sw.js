// Service worker mínimo: hace la app instalable y muestra una página propia sin conexión.
// Solo intercepta navegaciones. /api/* nunca pasa por aquí ni se guarda en caché, así que
// no hay marcadores antiguos ni datos de partidos almacenados en el dispositivo.
// También recibe el aviso matinal (Tarea 6.14), que nunca lleva resultados.
const CACHE = "offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(OFFLINE_URL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await self.registration.navigationPreload?.enable();
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));
      await self.clients.claim();
    })()
  );
});

// Tarea 6.14: aviso matinal sin spoilers. El texto llega ya escrito del servidor (nunca resultados).
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // Aviso sin datos legibles: se enseña uno genérico
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Hoopmeter", {
      body: data.body || "",
      tag: data.tag || "hoopmeter",
      icon: "/icons/icon-192.png",
      lang: "es",
    })
  );
});

// Al tocarlo, SIEMPRE una carga nueva de la portada con ?aviso=1: SpoilerContext vuelve al Nivel 1 antes
// de pintar nada. Nunca se enfoca sin más una pestaña que pudiera estar en Nivel 3.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL("/?aviso=1", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (existing) {
        try {
          const navigated = await existing.navigate(url);
          if (navigated) return navigated.focus();
        } catch {
          // Pestaña no controlada por este service worker: se abre una nueva
        }
      }
      return self.clients.openWindow(url);
    })()
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    (async () => {
      try {
        return (await event.preloadResponse) ?? (await fetch(event.request));
      } catch {
        return caches.match(OFFLINE_URL);
      }
    })()
  );
});
