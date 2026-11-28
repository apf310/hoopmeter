import { Briefcase, Gamepad2, Home, Trophy, Users, type LucideIcon } from "lucide-react";
import type { NavSection } from "@/lib/nav";

export type NavItem = {
  href: NavSection;
  label: string;
  /** En la Sidebar del escritorio, si cabe un nombre más largo. */
  sidebarLabel?: string;
  icon: LucideIcon;
};

/**
 * Barra de 5 pestañas (Tarea 8.1, aprobada el 25-nov). Liga = clasificación y equipos; Jugadores = explorador,
 * fichas y comparador. Qué ver se abre desde la línea del nivel en Inicio (y en la Sidebar, bajo las pestañas).
 * Qué pestaña está activa en cada pantalla: `navSection` (`lib/nav.ts`, con tests).
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/standings", label: "Liga", icon: Trophy },
  { href: "/players", label: "Jugadores", icon: Users },
  { href: "/gm-simulator", label: "GM", sidebarLabel: "GM Virtual", icon: Briefcase },
  { href: "/juegos", label: "Juegos", icon: Gamepad2 },
];
