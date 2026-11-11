import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { LogoMark } from "./LogoMark";

/** Logotipo de la app en tipografía de grafismo TV. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label={BRAND.name}
      className={cn("flex items-center gap-2 font-display text-2xl font-extrabold uppercase leading-none tracking-wide text-white", className)}
    >
      <LogoMark className="size-8 shrink-0" />
      <span>
        {BRAND.lead}
        <span className="text-orange-500">{BRAND.accent}</span>
      </span>
    </Link>
  );
}
