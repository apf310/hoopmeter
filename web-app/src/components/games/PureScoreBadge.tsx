import { cn } from "@/lib/utils";
import {
  EXCITEMENT_TONE_CLASSES,
  formatExcitementScore,
  getExcitementTone,
} from "@/lib/spoilers";

type PureScoreBadgeProps = {
  /** Solo recibe la nota, nunca el partido: así es imposible filtrar otro dato. */
  score: number | null;
  className?: string;
};

/** Nivel 2 — Solo nota: únicamente el número 1.0 – 10.0 y su color. */
export function PureScoreBadge({ score, className }: PureScoreBadgeProps) {
  const tone = getExcitementTone(score);
  const formatted = formatExcitementScore(score);

  return (
    <span
      aria-label={tone === "pending" ? "Nota pendiente" : `Nota del partido: ${formatted} sobre 10`}
      className={cn(
        "inline-flex min-w-12 items-center justify-center rounded-lg px-2 py-1 font-mono text-lg font-bold tabular-nums ring-1",
        EXCITEMENT_TONE_CLASSES[tone],
        className
      )}
    >
      {formatted}
    </span>
  );
}
