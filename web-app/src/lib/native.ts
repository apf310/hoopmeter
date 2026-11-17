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

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** El WebView de Android no admite `<a download>` ni `navigator.share` con archivos. */
export async function shareImageNatively(blob: Blob, fileName: string) {
  const [{ Directory, Filesystem }, { Share }] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor/share"),
  ]);
  const { uri } = await Filesystem.writeFile({
    path: fileName,
    data: await toBase64(blob),
    directory: Directory.Cache,
  });
  try {
    await Share.share({ files: [uri] });
  } catch (error) {
    // Cerrar el menú de compartir sin elegir nada no es un fallo
    if (!(error instanceof Error && /cancel/i.test(error.message))) throw error;
  }
}
