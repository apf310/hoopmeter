import { Home, Trophy, Users, Briefcase, Swords, type LucideIcon } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/standings", label: "Clasificación", icon: Trophy },
  { href: "/players", label: "Jugadores", icon: Users },
  { href: "/gm-simulator", label: "GM Virtual", icon: Briefcase },
  { href: "/compare", label: "Comparar", icon: Swords },
];

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
