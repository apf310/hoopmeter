import {
  Award,
  Crown,
  Flame,
  Landmark,
  Medal,
  Shield,
  ShieldCheck,
  Sparkles,
  Star,
  Timer,
  TrendingUp,
  Trophy,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import type { CareerHigh, PlayerAward } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type TrophyDef = { key: string; match: RegExp; label: string; icon: LucideIcon; major?: boolean };

// Orden de la vitrina: de más a menos prestigioso. El primer patrón que encaja gana.
const TROPHIES: TrophyDef[] = [
  { key: "champion", match: /Champion$/i, label: "Anillos", icon: Trophy, major: true },
  { key: "mvp", match: /^NBA Most Valuable Player$/i, label: "MVP", icon: Crown, major: true },
  { key: "fmvp", match: /^NBA Finals Most Valuable Player$/i, label: "MVP de las Finales", icon: Medal, major: true },
  { key: "hof", match: /Hall of Fame/i, label: "Salón de la Fama", icon: Landmark, major: true },
  { key: "dpoy", match: /Defensive Player of the Year/i, label: "Mejor Defensor", icon: Shield, major: true },
  { key: "roy", match: /Rookie of the Year/i, label: "Rookie del Año", icon: Sparkles },
  { key: "smoy", match: /Sixth Man/i, label: "Sexto Hombre", icon: UserPlus },
  { key: "mip", match: /Most Improved/i, label: "Más Mejorado", icon: TrendingUp },
  { key: "clutch", match: /Clutch/i, label: "Jugador Clutch", icon: Timer },
  { key: "cfmvp", match: /Conference Finals Most Valuable/i, label: "MVP Final de Conferencia", icon: Medal },
  { key: "allnba", match: /^All-NBA/i, label: "All-NBA", icon: Award },
  { key: "alldef", match: /^All-Defensive/i, label: "Quinteto Defensivo", icon: ShieldCheck },
  { key: "asgmvp", match: /All-Star Most Valuable/i, label: "MVP del All-Star", icon: Star },
  { key: "allstar", match: /^NBA All-Star$/i, label: "All-Star", icon: Star },
  { key: "cupmvp", match: /(In-Season Tournament|NBA Cup).*(MVP|Most Valuable)/i, label: "MVP de la Copa NBA", icon: Trophy },
  { key: "cupteam", match: /(In-Season Tournament|NBA Cup) All-Tournament/i, label: "Quinteto Copa NBA", icon: Trophy },
  { key: "olygold", match: /Olympic Gold/i, label: "Oro Olímpico", icon: Medal },
  { key: "olysilver", match: /Olympic Silver/i, label: "Plata Olímpica", icon: Medal },
  { key: "olybronze", match: /Olympic Bronze/i, label: "Bronce Olímpico", icon: Medal },
  { key: "allrookie", match: /^All-Rookie/i, label: "Quinteto Rookie", icon: Sparkles },
  { key: "ibm", match: /IBM Award/i, label: "Premio IBM", icon: Award },
  { key: "citizenship", match: /Citizenship/i, label: "Premio a la Ciudadanía", icon: Award },
];

const ORDINAL_ES: Record<string, string> = { "1st": "1º", "2nd": "2º", "3rd": "3º" };

type TrophyGroup = { key: string; label: string; icon: LucideIcon; major: boolean; seasons: string[]; detail?: string };

function groupAwards(awards: PlayerAward[]): TrophyGroup[] {
  const groups = new Map<string, TrophyGroup & { order: number; ordinals: string[] }>();
  for (const award of awards) {
    const index = TROPHIES.findIndex((t) => t.match.test(award.award_name));
    const def = TROPHIES[index];
    const key = def?.key ?? award.award_name;
    const group = groups.get(key) ?? {
      key,
      label: def?.label ?? award.award_name,
      icon: def?.icon ?? Award,
      major: !!def?.major,
      seasons: [],
      ordinals: [],
      order: index === -1 ? TROPHIES.length : index,
    };
    if (award.season) group.seasons.push(award.season);
    const ordinal = award.award_name.match(/\b(1st|2nd|3rd) Team/)?.[1];
    if (ordinal) group.ordinals.push(ordinal);
    groups.set(key, group);
  }

  return [...groups.values()]
    .sort((a, b) => a.order - b.order || b.seasons.length - a.seasons.length)
    .map(({ ordinals, ...group }) => ({
      ...group,
      // Quintetos: desglose por equipo ("1º ×4 · 2º ×1")
      detail: ordinals.length
        ? Object.keys(ORDINAL_ES)
            .map((o) => [ORDINAL_ES[o], ordinals.filter((x) => x === o).length] as const)
            .filter(([, n]) => n > 0)
            .map(([label, n]) => `${label} ×${n}`)
            .join(" · ")
        : undefined,
    }));
}

/** Cuántas veces ha ganado cada premio, por clave de `TROPHIES`. */
export function trophyCounts(awards: PlayerAward[]): Record<string, number> {
  return Object.fromEntries(groupAwards(awards).map((group) => [group.key, group.seasons.length]));
}

/** Vitrina de trofeos agrupada por premio, con los grandes trofeos destacados en dorado. */
export function TrophyCabinet({ awards }: { awards: PlayerAward[] }) {
  const groups = groupAwards(awards);
  if (groups.length === 0) {
    return (
      <p className="flex items-center gap-3 py-6 text-sm text-slate-400">
        <Trophy className="size-5 text-slate-600" aria-hidden />
        Vitrina por estrenar: todavía no tiene premios individuales.
      </p>
    );
  }

  return (
    // gap-px sobre fondo slate-800 = cuadrícula de líneas finas sin tarjetas flotantes
    <ul className="grid grid-cols-2 gap-px border-y border-slate-800 bg-slate-800 sm:grid-cols-3 xl:grid-cols-4">
      {groups.map((g) => {
        const Icon = g.icon;
        return (
          <li
            key={g.key}
            className={cn(
              "flex flex-col gap-2 bg-slate-950 p-4",
              g.major && "bg-gradient-to-b from-amber-500/15 to-slate-950 to-80%"
            )}
          >
            <div className="flex items-center justify-between">
              <Icon className={cn("size-7", g.major ? "text-amber-400" : "text-slate-300")} aria-hidden />
              <span className={cn("font-display text-4xl font-extrabold leading-none tabular-nums", g.major ? "text-amber-300" : "text-white")}>
                {g.seasons.length || 1}
                <span className="ml-0.5 text-xl text-slate-500">×</span>
              </span>
            </div>
            <p className="font-display text-lg font-bold uppercase leading-tight tracking-wide text-white">{g.label}</p>
            {g.detail && <p className="font-display text-sm font-semibold text-slate-300">{g.detail}</p>}
            {g.seasons.length > 0 && <p className="text-xs leading-relaxed text-slate-400">{g.seasons.join(" · ")}</p>}
          </li>
        );
      })}
    </ul>
  );
}

const HIGHS: { stat: string; label: string }[] = [
  { stat: "PTS", label: "Puntos" },
  { stat: "REB", label: "Rebotes" },
  { stat: "AST", label: "Asistencias" },
  { stat: "FG3M", label: "Triples" },
  { stat: "STL", label: "Robos" },
  { stat: "BLK", label: "Tapones" },
];

const highDate = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Récords personales en un partido (Career Highs de temporada regular). */
export function CareerHighs({ highs }: { highs: Record<string, CareerHigh> | undefined }) {
  const items = HIGHS.filter((h) => highs?.[h.stat]?.value != null);
  if (!highs || items.length === 0) return <p className="py-4 text-sm text-slate-400">Sin récords registrados.</p>;

  return (
    <ul className="grid grid-cols-2 gap-px border-y border-slate-800 bg-slate-800 sm:grid-cols-3 lg:grid-cols-6">
      {items.map(({ stat, label }) => {
        const high = highs[stat];
        return (
          <li key={stat} className="bg-slate-950 p-4">
            <p className="flex items-center gap-1.5 font-display text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-300">
              {stat === "PTS" && <Flame className="size-3.5 text-orange-500" aria-hidden />}
              {label}
            </p>
            <p className="font-display text-5xl font-extrabold leading-tight text-white tabular-nums">{high.value}</p>
            <p className="text-xs text-slate-400">
              {high.vs && <span className="font-semibold text-slate-300">vs {high.vs}</span>}
              {high.vs && high.date && " · "}
              {high.date && highDate.format(new Date(`${high.date}T00:00:00Z`))}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
