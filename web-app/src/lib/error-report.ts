// Aviso de errores en producción (Tarea 6.27). Puro, sin dependencias: lo usan el navegador
// (`error-report-client.ts`), `/api/errors`, `instrumentation.ts` y sus tests.
// Nunca se envía la IP, ni la URL con parámetros, ni nada del usuario: solo qué falló y dónde.
// Los errores se agrupan en Supabase (`app_errors`, backend-data/errors.sql) por fuente + mensaje + ruta.

export type ErrorSource = "web-client" | "web-server";

export type ErrorReport = {
  message: string;
  stack: string | null;
  /** Ruta normalizada: sin parámetros y con los ids como ":id" ("/games/:id"). */
  path: string | null;
  /** Digest de Next (errores del servidor: une el aviso del navegador con el del servidor). */
  digest: string | null;
  /** Navegador y sistema a grandes rasgos ("Chrome · Android", "App Android"): nunca la cadena entera. */
  agent: string | null;
};

export const MAX_MESSAGE = 500;
export const MAX_STACK = 4000;
const MAX_STACK_LINES = 20;
const MAX_PATH = 200;

/** "/games/0022600245?nivel=3#x" -> "/games/:id". Así los mismos fallos de fichas distintas se agrupan. */
export function normalizePath(path: string | null | undefined): string | null {
  if (!path) return null;
  let clean = path.trim();
  try {
    // Una URL completa (window.location.href) o solo la ruta (request.path de Next)
    clean = new URL(clean, "https://x.invalid").pathname;
  } catch {
    clean = clean.split(/[?#]/)[0];
  }
  clean = clean
    .split("/")
    .map((segment) => (/^\d{3,}$/.test(segment) ? ":id" : segment))
    .join("/");
  return clean.slice(0, MAX_PATH) || "/";
}

/** Espacios juntos y números largos (ids, marcas de tiempo) como "N": el mismo fallo da el mismo mensaje. */
export function normalizeMessage(message: string): string {
  return message.replace(/\s+/g, " ").replace(/\d{5,}/g, "N").trim().slice(0, MAX_MESSAGE);
}

/** Las primeras líneas de la pila, sin parámetros en las URLs de los archivos. */
export function trimStack(stack: string | null | undefined): string | null {
  if (!stack) return null;
  const lines = stack
    .split("\n")
    .slice(0, MAX_STACK_LINES)
    .map((line) => line.replace(/\?[^\s):]*/g, "").trimEnd());
  return lines.join("\n").slice(0, MAX_STACK) || null;
}

/** Fallos que no son de la app: extensiones, redes caídas, avisos inofensivos del navegador. */
export function isNoise(message: string, stack: string | null): boolean {
  if (/^(Uncaught )?Script error\.?$/i.test(message.trim())) return true; // script de otro origen: sin datos
  if (/ResizeObserver loop/i.test(message)) return true;
  if (/^(TypeError: )?(Failed to fetch|Load failed|NetworkError when attempting to fetch resource\.?)$/i.test(message.trim())) {
    return true; // sin conexión o red que corta: la app ya lo enseña
  }
  if (/AbortError|The user aborted a request|signal is aborted/i.test(message)) return true;
  return /(chrome|moz|safari(-web)?)-extension:\/\//.test(`${message}\n${stack ?? ""}`);
}

/** "Mozilla/5.0 (Linux; Android 14…) … Chrome/142…" -> "Chrome · Android". */
export function coarseAgent(userAgent: string | null | undefined, native = false): string | null {
  if (native) return /iPhone|iPad|iOS/i.test(userAgent ?? "") ? "App iOS" : "App Android";
  if (!userAgent) return null;
  const os = /Android/i.test(userAgent)
    ? "Android"
    : /iPhone|iPad|iPod/i.test(userAgent)
      ? "iOS"
      : /Windows/i.test(userAgent)
        ? "Windows"
        : /Mac OS X|Macintosh/i.test(userAgent)
          ? "macOS"
          : /Linux|CrOS/i.test(userAgent)
            ? "Linux"
            : "Otro";
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /SamsungBrowser\//.test(userAgent)
      ? "Samsung"
      : /Firefox\/|FxiOS\//.test(userAgent)
        ? "Firefox"
        : /Chrome\/|CriOS\//.test(userAgent)
          ? "Chrome"
          : /Safari\//.test(userAgent)
            ? "Safari"
            : "Otro";
  return `${browser} · ${os}`;
}

function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim() ? value.slice(0, max) : null;
}

/** Un error cualquiera (Error, texto, objeto lanzado) -> mensaje y pila. */
export function describeError(error: unknown): { message: string; stack: string | null } {
  if (error instanceof Error) {
    const message = error.message ? `${error.name}: ${error.message}` : error.name;
    return { message, stack: error.stack ?? null };
  }
  if (typeof error === "string") return { message: error, stack: null };
  try {
    return { message: JSON.stringify(error) ?? String(error), stack: null };
  } catch {
    return { message: String(error), stack: null };
  }
}

/** Monta el aviso ya limpio. `null` si es ruido o no hay mensaje. */
export function buildReport(input: {
  message: unknown;
  stack?: unknown;
  path?: unknown;
  digest?: unknown;
  agent?: unknown;
}): ErrorReport | null {
  const raw = text(input.message, MAX_MESSAGE * 4);
  if (!raw) return null;
  const stack = trimStack(text(input.stack, MAX_STACK * 4));
  if (isNoise(raw, stack)) return null;
  const digest = text(input.digest, 64);
  const agent = text(input.agent, 40);
  return {
    message: normalizeMessage(raw),
    stack,
    path: normalizePath(text(input.path, MAX_PATH * 4)),
    digest: digest && /^[\w-]+$/.test(digest) ? digest : null,
    // Solo lo que da `coarseAgent`: el navegador no puede colar otra cosa
    agent: agent && /^(App (Android|iOS)|[A-Za-z]+ · [A-Za-z]+)$/.test(agent) ? agent : null,
  };
}

/** Cuerpo de `POST /api/errors` (lo que manda el navegador). */
export function parseErrorBody(body: unknown): ErrorReport | null {
  if (!body || typeof body !== "object") return null;
  const { message, stack, path, digest, agent } = body as Record<string, unknown>;
  return buildReport({ message, stack, path, digest, agent });
}
