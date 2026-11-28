import { Capacitor } from "@capacitor/core";

// Puente con la app nativa (Capacitor). Los plugins se importan bajo demanda para que la web
// normal no los descargue.

export const isNativeApp = () => Capacitor.isNativePlatform();

/** Avisa de cada paso a primer o segundo plano en la app nativa; en la web no hace nada. */
export function onNativeAppState(listener: (active: boolean) => void): () => void {
  if (!isNativeApp()) return () => {};

  let stopped = false;
  let remove: (() => Promise<void>) | undefined;
  import("@capacitor/app")
    .then(({ App }) => App.addListener("appStateChange", ({ isActive }) => listener(isActive)))
    .then((handle) => {
      if (stopped) void handle.remove();
      else remove = handle.remove;
    })
    .catch(console.error);

  return () => {
    stopped = true;
    void remove?.();
  };
}

/**
 * "Entrar con Google" (Tarea 8.5): Google no deja iniciar sesión dentro de un WebView, así que se abre en el navegador
 * del sistema (Custom Tabs) y vuelve a la app con `com.hoopmeter.app://auth?code=…` (`onNativeAuthRedirect`). Con un APK
 * anterior sin el plugin, Capacitor abre fuera de la app cualquier dirección que no sea la de la web.
 */
export async function openAuthBrowser(url: string): Promise<void> {
  if (Capacitor.isPluginAvailable("Browser")) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url });
  } else {
    window.location.href = url;
  }
}

/** Cierra el navegador de "Entrar con Google" al volver a la app. */
export async function closeAuthBrowser(): Promise<void> {
  if (!Capacitor.isPluginAvailable("Browser")) return;
  const { Browser } = await import("@capacitor/browser");
  await Browser.close().catch(() => {});
}

/**
 * La vuelta de Google a la app (`prefix` = `com.hoopmeter.app://auth`): con la app abierta (`appUrlOpen`) o, si Android
 * la cerró mientras tanto, al arrancar con ese enlace. En la web no hace nada.
 */
export function onNativeAuthRedirect(prefix: string, listener: (url: string) => void): () => void {
  if (!isNativeApp()) return () => {};

  let stopped = false;
  let remove: (() => Promise<void>) | undefined;
  const handle = (url: string | undefined) => {
    if (!stopped && url?.startsWith(prefix)) listener(url);
  };
  import("@capacitor/app")
    .then(async ({ App }) => {
      handle((await App.getLaunchUrl())?.url);
      return App.addListener("appUrlOpen", ({ url }) => handle(url));
    })
    .then((handleRef) => {
      if (stopped) void handleRef.remove();
      else remove = handleRef.remove;
    })
    .catch(console.error);

  return () => {
    stopped = true;
    void remove?.();
  };
}

/**
 * Botón atrás de Android. Capacitor, sin este aviso, solo retrocede en el historial: en la
 * portada no hacía nada. Ahora cierra el diálogo abierto (Base UI se cierra con Escape), vuelve
 * a la página anterior o, en la primera, pasa la app a segundo plano como cualquier app de
 * Android (la regla de los 15 minutos de SpoilerContext sigue valiendo).
 */
export function onNativeBackButton(): () => void {
  if (!isNativeApp()) return () => {};

  let stopped = false;
  let remove: (() => Promise<void>) | undefined;
  import("@capacitor/app")
    .then(({ App }) =>
      App.addListener("backButton", ({ canGoBack }) => {
        if (document.querySelector("[role=dialog][data-open]")) {
          (document.activeElement ?? document.body).dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
          );
        } else if (canGoBack) {
          window.history.back();
        } else {
          void App.minimizeApp();
        }
      })
    )
    .then((handle) => {
      if (stopped) void handle.remove();
      else remove = handle.remove;
    })
    .catch(console.error);

  return () => {
    stopped = true;
    void remove?.();
  };
}

/**
 * Aviso matinal (Tarea 6.14): pide permiso si hace falta, crea el canal "morning" y devuelve el token
 * de FCM. Falla con "denied" si el usuario no da permiso; en un APK sin el plugin, con su propio error.
 */
export async function registerNativePush(): Promise<string> {
  const { PushNotifications } = await import("@capacitor/push-notifications");
  let { receive } = await PushNotifications.checkPermissions();
  if (receive === "prompt" || receive === "prompt-with-rationale") {
    ({ receive } = await PushNotifications.requestPermissions());
  }
  if (receive !== "granted") throw new Error("denied");
  await PushNotifications.createChannel({
    id: "morning",
    name: "Aviso de la mañana",
    description: "La jornada de anoche lista para ver, sin resultados",
    importance: 3,
  });

  const handles: { remove: () => Promise<void> }[] = [];
  const cleanup = () => handles.splice(0).forEach((handle) => void handle.remove());
  try {
    return await new Promise<string>((resolve, reject) => {
      setTimeout(() => reject(new Error("timeout")), 20_000);
      Promise.all([
        PushNotifications.addListener("registration", ({ value }) => resolve(value)),
        PushNotifications.addListener("registrationError", ({ error }) => reject(new Error(error))),
      ])
        .then((added) => {
          handles.push(...added);
          return PushNotifications.register();
        })
        .catch(reject);
    });
  } finally {
    cleanup();
  }
}

export async function unregisterNativePush(): Promise<void> {
  const { PushNotifications } = await import("@capacitor/push-notifications");
  await PushNotifications.unregister();
}

/** Al tocar un aviso en la app nativa (también si la abrió en frío). En la web no hace nada. */
export function onNativePushOpened(listener: () => void): () => void {
  if (!isNativeApp()) return () => {};

  let stopped = false;
  let remove: (() => Promise<void>) | undefined;
  import("@capacitor/push-notifications")
    .then(({ PushNotifications }) => PushNotifications.addListener("pushNotificationActionPerformed", () => listener()))
    .then((handle) => {
      if (stopped) void handle.remove();
      else remove = handle.remove;
    })
    .catch(console.error);

  return () => {
    stopped = true;
    void remove?.();
  };
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// Trozos de 768 KB (múltiplo de 3: cada trozo es base64 válido por sí solo). Un vídeo de ~8 MB en
// una sola cadena base64 (~11 MB) pasaría entero por el puente de Capacitor y dispara la memoria.
const CHUNK_BYTES = 3 * 256 * 1024;

/**
 * El WebView de Android no admite `<a download>` ni `navigator.share` con archivos: se escribe en la
 * caché de la app y se abre el menú de compartir. El tipo (image/png, video/mp4) sale de la extensión.
 */
export async function shareFileNatively(blob: Blob, fileName: string) {
  const [{ Directory, Filesystem }, { Share }] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor/share"),
  ]);
  let uri = "";
  for (let offset = 0; offset < blob.size || offset === 0; offset += CHUNK_BYTES) {
    const data = await toBase64(blob.slice(offset, offset + CHUNK_BYTES));
    if (offset === 0) ({ uri } = await Filesystem.writeFile({ path: fileName, data, directory: Directory.Cache }));
    else await Filesystem.appendFile({ path: fileName, data, directory: Directory.Cache });
  }
  try {
    await Share.share({ files: [uri] });
  } catch (error) {
    // Cerrar el menú de compartir sin elegir nada no es un fallo
    if (!(error instanceof Error && /cancel/i.test(error.message))) throw error;
  }
}

/** Menú de compartir de Android con un enlace (el WebView no tiene `navigator.share`). */
export async function shareLinkNatively(url: string, title: string) {
  const { Share } = await import("@capacitor/share");
  try {
    await Share.share({ title, url });
  } catch (error) {
    if (!(error instanceof Error && /cancel/i.test(error.message))) throw error;
  }
}

/** Menú de compartir de Android con un texto (el resultado en emojis de los juegos, Tarea 8.1). */
export async function shareTextNatively(text: string) {
  const { Share } = await import("@capacitor/share");
  try {
    await Share.share({ text });
  } catch (error) {
    if (!(error instanceof Error && /cancel/i.test(error.message))) throw error;
  }
}
