// Versión plana de cada trofeo (sin WebGL o mientras carga el 3D): un icono distinto por premio,
// teñido con su metal y con corona pequeña en los MVP.

import {
  Award,
  ChartColumnIncreasing,
  Crown,
  Flag,
  Flame,
  FlagTriangleRight,
  Gem,
  Handshake,
  HeartHandshake,
  Hexagon,
  LockKeyhole,
  Medal,
  Shield,
  Sparkles,
  Sprout,
  Star,
  Stars,
  Timer,
  Trophy,
  Undo2,
  Volleyball,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { FlatIcon, Metal, TrophyGroup } from "./trophy-catalog";

const ICONS: Record<FlatIcon, LucideIcon> = {
  Award,
  ChartColumnIncreasing,
  Crown,
  Flag,
  Flame,
  FlagTriangleRight,
  Gem,
  Handshake,
  HeartHandshake,
  Hexagon,
  LockKeyhole,
  Medal,
  Shield,
  Sparkles,
  Sprout,
  Star,
  Stars,
  Timer,
  Trophy,
  Undo2,
  Volleyball,
};

export const METAL_TEXT: Record<Metal, string> = {
  gold: "text-amber-300",
  silver: "text-slate-200",
  bronze: "text-orange-300",
  steel: "text-slate-400",
};

export function TrophyIcon({
  group,
  className,
}: {
  group: Pick<TrophyGroup, "icon" | "glyph" | "metal" | "crown">;
  className?: string;
}) {
  const Icon = ICONS[group.icon];
  return (
    <span className={cn("relative inline-flex size-8 items-center justify-center", METAL_TEXT[group.metal], className)} aria-hidden>
      {group.glyph ? (
        <span className="font-display text-[2em] font-extrabold leading-none">{group.glyph}</span>
      ) : (
        <Icon className="size-full" strokeWidth={1.75} />
      )}
      {group.crown && group.icon !== "Crown" && <Crown className="absolute -right-1.5 -top-1.5 size-[45%] text-amber-300" strokeWidth={2.25} />}
    </span>
  );
}
