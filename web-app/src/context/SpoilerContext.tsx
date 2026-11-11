"use client";

import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { onNativeAppState } from "@/lib/native";
import { DEFAULT_SPOILER_LEVEL, isSpoilerLevel, type SpoilerLevel } from "@/lib/spoilers";

// Garantía "jamás un spoiler por olvido": la app SIEMPRE arranca en Nivel 1.
// - El nivel vive en sessionStorage (no localStorage): se mantiene al navegar o recargar,
//   pero desaparece al cerrar la pestaña o la app.
// - En móvil "cerrar" suele ser mandar la app a segundo plano, donde sessionStorage sobrevive
//   días: si pasa más de IDLE_RESET_MS oculta, al volver también se vuelve al Nivel 1.
const STORAGE_KEY = "nba-hub:spoiler-level";
const IDLE_RESET_MS = 15 * 60 * 1000;

type StoredState = { level: SpoilerLevel; hiddenAt: number | null };

const listeners = new Set<() => void>();

function readState(): StoredState | null {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null");
    if (parsed && typeof parsed === "object" && "level" in parsed && isSpoilerLevel(parsed.level)) {
      const hiddenAt = "hiddenAt" in parsed && typeof parsed.hiddenAt === "number" ? parsed.hiddenAt : null;
      return { level: parsed.level, hiddenAt };
    }
  } catch {
    // Almacenamiento no disponible o corrupto: se trata como recién abierta.
  }
  return null;
}

function writeState(state: StoredState) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Modo privado sin almacenamiento: no hay persistencia y cada recarga vuelve al Nivel 1.
  }
  listeners.forEach((listener) => listener());
}

function isExpired(state: StoredState): boolean {
  return state.hiddenAt !== null && Date.now() - state.hiddenAt > IDLE_RESET_MS;
}

function readLevel(): SpoilerLevel {
  const state = readState();
  return state && !isExpired(state) ? state.level : DEFAULT_SPOILER_LEVEL;
}

function handleAppVisible(visible: boolean) {
  const state = readState();
  if (!state) return;
  if (visible) {
    writeState({ level: isExpired(state) ? DEFAULT_SPOILER_LEVEL : state.level, hiddenAt: null });
  } else if (state.hiddenAt === null) {
    writeState({ ...state, hiddenAt: Date.now() });
  }
}

const handleVisibility = () => handleAppVisible(document.visibilityState === "visible");

let stopNativeAppState: (() => void) | null = null;

function subscribe(listener: () => void) {
  if (listeners.size === 0) {
    document.addEventListener("visibilitychange", handleVisibility);
    // En la app nativa visibilitychange no siempre salta al ir a segundo plano: sin este aviso
    // nunca se anotaría hiddenAt y el Nivel 3 sobreviviría a los 15 minutos.
    stopNativeAppState = onNativeAppState(handleAppVisible);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      document.removeEventListener("visibilitychange", handleVisibility);
      stopNativeAppState?.();
    }
  };
}

function setSpoilerLevel(level: SpoilerLevel) {
  writeState({ level, hiddenAt: null });
}

// Intención de cambiar de nivel (ratón encima, pulsación en curso): las pantallas precargan
// los datos de ese nivel SIN mostrarlos, para que al confirmar aparezcan al instante.
const intentListeners = new Set<(level: SpoilerLevel) => void>();

export function announceLevelIntent(level: SpoilerLevel) {
  intentListeners.forEach((listener) => listener(level));
}

export function onLevelIntent(listener: (level: SpoilerLevel) => void) {
  intentListeners.add(listener);
  return () => {
    intentListeners.delete(listener);
  };
}

// En servidor e hidratación siempre Nivel 1: nunca se renderiza nada antes de saber el nivel.
const getServerLevel = (): SpoilerLevel => DEFAULT_SPOILER_LEVEL;

type SpoilerContextValue = {
  spoilerLevel: SpoilerLevel;
  setSpoilerLevel: (level: SpoilerLevel) => void;
};

const SpoilerContext = createContext<SpoilerContextValue | null>(null);

export function SpoilerProvider({ children }: { children: ReactNode }) {
  const spoilerLevel = useSyncExternalStore(subscribe, readLevel, getServerLevel);
  const value = useMemo<SpoilerContextValue>(() => ({ spoilerLevel, setSpoilerLevel }), [spoilerLevel]);
  return <SpoilerContext.Provider value={value}>{children}</SpoilerContext.Provider>;
}

export function useSpoiler(): SpoilerContextValue {
  const ctx = useContext(SpoilerContext);
  if (!ctx) throw new Error("useSpoiler debe usarse dentro de <SpoilerProvider>.");
  return ctx;
}

export function useSpoilerLevel(): SpoilerLevel {
  return useSpoiler().spoilerLevel;
}
