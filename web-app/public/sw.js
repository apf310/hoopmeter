// Service worker mínimo: hace la app instalable y muestra una página propia sin conexión.
// Solo intercepta navegaciones. /api/* nunca pasa por aquí ni se guarda en caché, así que
// no hay marcadores antiguos ni datos de partidos almacenados en el dispositivo.
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
