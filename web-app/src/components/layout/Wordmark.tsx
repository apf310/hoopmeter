import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

/** Logotipo de la app en tipografía de grafismo TV. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn("flex items-center gap-2 font-display text-2xl font-extrabold uppercase leading-none tracking-wide text-white", className)}
    >
      <span aria-hidden className="text-xl">{BRAND.emoji}</span>
      {BRAND.lead} <span className="-ml-1 text-orange-500">{BRAND.accent}</span>
    </Link>
  );
}
