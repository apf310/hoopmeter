import { cn } from "@/lib/utils";
import type { GameResult } from "@/lib/supabase";

const RESULT_LABEL: Record<GameResult, string> = { W: "Victoria", L: "Derrota" };

/** Últimos resultados como bloques verde/rojo; el más reciente a la derecha. */
export function FormStrip({ form, size = "sm" }: { form: GameResult[]; size?: "sm" | "lg" }) {
  if (form.length === 0) return <span className="text-slate-500">–</span>;

  return (
    <span className="inline-flex items-center gap-[3px]" aria-label={`Últimos ${form.length}: ${form.map((r) => (r === "W" ? "V" : "D")).join(" ")}`}>
      {form.map((result, i) => (
        <span
          key={i}
          title={RESULT_LABEL[result]}
          className={cn(
            "rounded-[2px]",
            size === "lg" ? "h-5 w-2.5" : "h-3.5 w-1.5",
            result === "W" ? "bg-emerald-500" : "bg-red-500",
            // El último partido destaca: los anteriores se atenúan ligeramente
            i < form.length - 1 && "opacity-80"
          )}
        />
      ))}
    </span>
  );
}

/** "W3" → "V3" en verde, "L1" → "D1" en rojo. */
export function Streak({ streak, className }: { streak?: string | null; className?: string }) {
  const match = streak?.match(/^([WL])(\d+)$/);
  if (!match) return <span className={cn("text-slate-500", className)}>–</span>;

  const isWin = match[1] === "W";
  return (
    <span
      title={`${match[2]} ${isWin ? "victoria(s)" : "derrota(s)"} seguidas`}
      className={cn("font-display font-bold tabular-nums", isWin ? "text-emerald-400" : "text-red-400", className)}
    >
      {isWin ? "V" : "D"}
      {match[2]}
    </span>
  );
}

/** Diferencia de puntos por partido con signo y color. */
export function PointDiff({ value, className }: { value?: number | null; className?: string }) {
  if (value === null || value === undefined) return <span className={cn("text-slate-500", className)}>–</span>;
  return (
    <span className={cn("tabular-nums", value > 0 ? "text-emerald-400" : value < 0 ? "text-red-400" : "text-slate-300", className)}>
      {value > 0 ? "+" : ""}
      {value.toFixed(1)}
    </span>
  );
}
