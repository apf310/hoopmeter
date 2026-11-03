"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { DEFAULT_SPOILER_MODE, type SpoilerLevel, type SpoilerMode } from "@/lib/spoilers";

// El modo vive en sessionStorage (no localStorage): se mantiene al navegar o
// recargar, pero cada vez que se abre la app vuelve a Cero Spoilers por seguridad.
const STORAGE_KEY = "nba-hub:spoiler-mode";

const listeners = new Set<() => void>();

function readStoredMode(): SpoilerMode {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "FULL" ? "FULL" : DEFAULT_SPOILER_MODE;
  } catch {
    return DEFAULT_SPOILER_MODE;
  }
}

function writeStoredMode(mode: SpoilerMode) {
  try {
    sessionStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Almacenamiento no disponible (modo privado): el modo vive solo en memoria.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// En servidor e hidratación siempre STRICT: nunca se renderiza un spoiler antes de saber el modo.
const getServerMode = (): SpoilerMode => DEFAULT_SPOILER_MODE;

type SpoilerContextValue = {
  spoilerMode: SpoilerMode;
  setSpoilerMode: (mode: SpoilerMode) => void;
  toggleSpoilerMode: () => void;
  isTeaserRevealed: (gameId: string) => boolean;
  revealTeaser: (gameId: string) => void;
  hideTeaser: (gameId: string) => void;
};

const SpoilerContext = createContext<SpoilerContextValue | null>(null);

export function SpoilerProvider({ children }: { children: ReactNode }) {
  const spoilerMode = useSyncExternalStore(subscribe, readStoredMode, getServerMode);
  // Pistas de Nivel 2 abiertas por partido. Solo en memoria: nunca se persisten.
  const [revealedTeasers, setRevealedTeasers] = useState<ReadonlySet<string>>(() => new Set());

  const setSpoilerMode = useCallback((mode: SpoilerMode) => {
    // Al cambiar de modo se cierran todas las pistas: volver a STRICT es volver a cero.
    setRevealedTeasers(new Set());
    writeStoredMode(mode);
  }, []);

  const toggleSpoilerMode = useCallback(() => {
    setSpoilerMode(readStoredMode() === "STRICT" ? "FULL" : "STRICT");
  }, [setSpoilerMode]);

  const revealTeaser = useCallback((gameId: string) => {
    setRevealedTeasers((prev) => (prev.has(gameId) ? prev : new Set(prev).add(gameId)));
  }, []);

  const hideTeaser = useCallback((gameId: string) => {
    setRevealedTeasers((prev) => {
      if (!prev.has(gameId)) return prev;
      const next = new Set(prev);
      next.delete(gameId);
      return next;
    });
  }, []);

  const isTeaserRevealed = useCallback(
    (gameId: string) => revealedTeasers.has(gameId),
    [revealedTeasers]
  );

  const value = useMemo<SpoilerContextValue>(
    () => ({
      spoilerMode,
      setSpoilerMode,
      toggleSpoilerMode,
      isTeaserRevealed,
      revealTeaser,
      hideTeaser,
    }),
    [spoilerMode, setSpoilerMode, toggleSpoilerMode, isTeaserRevealed, revealTeaser, hideTeaser]
  );

  return <SpoilerContext.Provider value={value}>{children}</SpoilerContext.Provider>;
}

export function useSpoiler(): SpoilerContextValue {
  const ctx = useContext(SpoilerContext);
  if (!ctx) throw new Error("useSpoiler debe usarse dentro de <SpoilerProvider>.");
  return ctx;
}

/** Nivel efectivo para un partido: FULL → 3; STRICT → 2 si su pista está abierta, si no 1. */
export function useSpoilerLevel(gameId: string): SpoilerLevel {
  const { spoilerMode, isTeaserRevealed } = useSpoiler();
  if (spoilerMode === "FULL") return 3;
  return isTeaserRevealed(gameId) ? 2 : 1;
}
