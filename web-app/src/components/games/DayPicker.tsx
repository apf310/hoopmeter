"use client";

import { useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, dayOfMonth, formatDayMonth, formatWeekday, relativeDayLabel } from "@/lib/game-day";
import { cn } from "@/lib/utils";

type DayPickerProps = {
  day: string;
  today: string;
  /** Jornadas con partidos (sin spoilers: solo fechas). */
  gameDays: Set<string>;
  onSelect: (day: string) => void;
};

/** Tira de días centrada en la jornada elegida (5 en móvil, 7 en escritorio) + calendario mensual. */
export function DayPicker({ day, today, gameDays, onSelect }: DayPickerProps) {
  const strip = Array.from({ length: 7 }, (_, i) => addDays(day, i - 3));

  return (
    <nav aria-label="Elegir jornada" className="flex items-stretch border-b border-slate-800">
      <ArrowButton label="Jornada anterior" onClick={() => onSelect(addDays(day, -1))}>
        <ChevronLeft className="size-5" />
      </ArrowButton>

      <ol className="grid flex-1 grid-cols-5 sm:grid-cols-7">
        {strip.map((d, i) => {
          const selected = d === day;
          const relative = relativeDayLabel(d, today);
          return (
            <li key={d} className={cn((i === 0 || i === 6) && "max-sm:hidden")}>
              <button
                type="button"
                aria-current={selected ? "date" : undefined}
                onClick={() => onSelect(d)}
                className={cn(
                  "relative flex w-full flex-col items-center py-2.5 font-display uppercase leading-none transition-colors",
                  selected ? "text-white" : gameDays.has(d) ? "text-slate-400 hover:text-slate-200" : "text-slate-600 hover:text-slate-400"
                )}
              >
                <span className={cn("text-[11px] font-semibold tracking-[0.15em]", relative === "Hoy" && !selected && "text-orange-400")}>
                  {relative === "Hoy" ? "Hoy" : formatWeekday(d)}
                </span>
                <span className="mt-1 text-2xl font-extrabold tabular-nums">{dayOfMonth(d)}</span>
                <span
                  aria-hidden
                  className={cn("absolute inset-x-3 bottom-0 h-0.5 transition-colors", selected ? "bg-orange-500" : "bg-transparent")}
                />
              </button>
            </li>
          );
        })}
      </ol>

      <ArrowButton label="Jornada siguiente" onClick={() => onSelect(addDays(day, 1))}>
        <ChevronRight className="size-5" />
      </ArrowButton>

      <CalendarPopover day={day} today={today} gameDays={gameDays} onSelect={onSelect} />
    </nav>
  );
}

function ArrowButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex w-10 shrink-0 items-center justify-center text-slate-400 transition-colors hover:bg-slate-900 hover:text-white md:w-12"
    >
      {children}
    </button>
  );
}

function CalendarPopover({ day, today, gameDays, onSelect }: DayPickerProps) {
  const [open, setOpen] = useState(false);

  const select = (d: string) => {
    onSelect(d);
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label="Abrir calendario"
        className="flex w-12 shrink-0 items-center justify-center border-l border-slate-800 text-slate-300 transition-colors hover:bg-slate-900 hover:text-white data-[popup-open]:bg-slate-900 data-[popup-open]:text-orange-400 md:w-14"
      >
        <CalendarDays className="size-5" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={6} collisionPadding={12} className="z-40">
          <Popover.Popup className="w-[min(20rem,calc(100vw-1.5rem))] origin-[var(--transform-origin)] rounded-lg border border-slate-800 bg-slate-900 p-3 shadow-2xl shadow-black/60 transition-[transform,opacity] duration-150 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            {/* Se monta al abrir: siempre empieza en el mes de la jornada elegida */}
            <MonthCalendar day={day} today={today} gameDays={gameDays} onSelect={select} />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];
const monthTitle = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });

/** "YYYY-MM" + n meses. */
function shiftMonth(month: string, amount: number): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + amount, 1)).toISOString().slice(0, 7);
}

function MonthCalendar({ day, today, gameDays, onSelect }: DayPickerProps) {
  const [month, setMonth] = useState(day.slice(0, 7));
  const [y, m] = month.split("-").map(Number);
  const firstWeekday = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // Lunes = 0
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = Array.from({ length: firstWeekday + daysInMonth }, (_, i) =>
    i < firstWeekday ? null : `${month}-${String(i - firstWeekday + 1).padStart(2, "0")}`
  );

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label="Mes anterior"
          onClick={() => setMonth(shiftMonth(month, -1))}
          className="flex size-9 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-white"
        >
          <ChevronLeft className="size-5" />
        </button>
        <span className="font-display text-lg font-bold uppercase tracking-wide text-white">
          {monthTitle.format(new Date(`${month}-15T12:00:00Z`))}
        </span>
        <button
          type="button"
          aria-label="Mes siguiente"
          onClick={() => setMonth(shiftMonth(month, 1))}
          className="flex size-9 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-white"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 text-center">
        {WEEKDAYS.map((w) => (
          <span key={w} className="py-1 font-display text-xs font-semibold text-slate-500">
            {w}
          </span>
        ))}
        {cells.map((d, i) => {
          if (!d) return <span key={`empty-${i}`} />;
          const selected = d === day;
          const hasGames = gameDays.has(d);
          return (
            <button
              key={d}
              type="button"
              onClick={() => onSelect(d)}
              aria-current={selected ? "date" : undefined}
              aria-label={`${formatWeekday(d, "long")} ${formatDayMonth(d)}${hasGames ? "" : " (sin partidos)"}`}
              className={cn(
                "relative mx-auto flex size-10 flex-col items-center justify-center rounded-md font-display text-base font-bold tabular-nums transition-colors",
                selected
                  ? "bg-orange-500 text-slate-950"
                  : hasGames
                    ? "text-white hover:bg-slate-800"
                    : "text-slate-600 hover:bg-slate-800/60",
                d === today && !selected && "ring-1 ring-inset ring-orange-500/70"
              )}
            >
              {dayOfMonth(d)}
              {hasGames && (
                <span aria-hidden className={cn("absolute bottom-1.5 size-1 rounded-full", selected ? "bg-slate-950" : "bg-orange-400")} />
              )}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => onSelect(today)}
        className="mt-3 w-full rounded-md bg-slate-800 py-2 font-display text-sm font-bold uppercase tracking-[0.2em] text-white hover:bg-slate-700"
      >
        Ir a hoy
      </button>
    </div>
  );
}
