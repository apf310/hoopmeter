// Catálogo de la vitrina: qué trofeo (modelo 3D, metal e icono plano) corresponde a cada premio.
// Cada premio se llama como lo conoce la gente (MVP, Rookie del Año...) y debajo va el nombre del trofeo
// real (Michael Jordan Trophy...). Los que tienen trofeo físico son los reales de la NBA; los que no lo
// tienen (quintetos, All-Star, Juegos Olímpicos...) llevan una pieza propia.
// Puro y sin dependencias de React o Three.js.

import type { FigurePose } from "./figure";

export type Metal = "gold" | "silver" | "bronze" | "steel";

/** Modelos 3D (`RealTrophies.tsx` los reales; `Trophy3D.tsx` las piezas propias). */
export type TrophyDesign =
  | "larryOBrien"
  | "jordan"
  | "billRussell"
  | "crystal"
  | "confMvp"
  | "kobe"
  | "cupMvp"
  | "cupBall"
  | "ring"
  | "sprout"
  | "quintet"
  | "padlock"
  | "star"
  | "medal"
  | "torch"
  | "hexagon"
  | "heart"
  | "comeback";

/** Icono de la versión plana (sin WebGL): uno distinto por premio. `glyph` = texto en lugar de icono. */
export type FlatIcon =
  | "Gem"
  | "Crown"
  | "Award"
  | "Shield"
  | "Sparkles"
  | "ChartColumnIncreasing"
  | "Timer"
  | "FlagTriangleRight"
  | "Flag"
  | "Stars"
  | "LockKeyhole"
  | "Star"
  | "Trophy"
  | "Medal"
  | "Sprout"
  | "Flame"
  | "Hexagon"
  | "HeartHandshake"
  | "Handshake"
  | "Volleyball"
  | "Undo2";

export type TrophyDef = {
  key: string;
  match: RegExp;
  /** Nombre del premio como lo conoce la gente (MVP, Rookie del Año...). */
  label: string;
  /** Nombre real del trofeo (Michael Jordan Trophy...) o, si no hay trofeo, el nombre oficial del premio. */
  trophy?: string;
  /** Nombre oficial del premio en inglés (va grabado en los trofeos de cristal). */
  award?: string;
  design: TrophyDesign;
  /** Figura dorada de los trofeos de cristal. */
  pose?: FigurePose;
  metal: Metal;
  /** Es un MVP: corona pequeña en el icono plano. */
  crown?: boolean;
  icon: FlatIcon;
  glyph?: string;
  major?: boolean;
};

// Orden de la vitrina: de más a menos prestigioso. El primer patrón que encaja gana.
export const TROPHIES: TrophyDef[] = [
  { key: "champion", match: /^NBA Champion$/i, label: "Campeón de la NBA", trophy: "Larry O'Brien Trophy", design: "larryOBrien", metal: "gold", icon: "Trophy", major: true },
  { key: "mvp", match: /^NBA Most Valuable Player$/i, label: "MVP", trophy: "Michael Jordan Trophy", design: "jordan", metal: "gold", crown: true, icon: "Crown", major: true },
  { key: "fmvp", match: /^NBA Finals Most Valuable Player$/i, label: "MVP de las Finales", trophy: "Bill Russell Trophy", design: "billRussell", metal: "gold", crown: true, icon: "Award", major: true },
  { key: "hof", match: /Hall of Fame/i, label: "Hall of Fame", trophy: "Naismith Basketball Hall of Fame", design: "ring", metal: "gold", icon: "Gem", major: true },
  { key: "dpoy", match: /Defensive Player of the Year/i, label: "Mejor Defensor", trophy: "Hakeem Olajuwon Trophy", award: "Defensive Player of the Year", design: "crystal", pose: "defense", metal: "silver", icon: "Shield", major: true },
  { key: "roy", match: /Rookie of the Year/i, label: "Rookie del Año", trophy: "Wilt Chamberlain Trophy", award: "Rookie of the Year", design: "crystal", pose: "palming", metal: "silver", icon: "Sparkles" },
  { key: "smoy", match: /Sixth Man/i, label: "Sexto Hombre", trophy: "John Havlicek Trophy", award: "Sixth Man of the Year", design: "crystal", pose: "runner", metal: "silver", icon: "Star", glyph: "6" },
  { key: "mip", match: /Most Improved/i, label: "Más Mejorado", trophy: "George Mikan Trophy", award: "Most Improved Player", design: "crystal", pose: "hook", metal: "silver", icon: "ChartColumnIncreasing" },
  { key: "clutch", match: /Clutch/i, label: "Jugador Clutch", trophy: "Jerry West Trophy", award: "Clutch Player of the Year", design: "crystal", pose: "jumper", metal: "silver", icon: "Timer" },
  { key: "ecfmvp", match: /^Eastern Conference Finals Most Valuable/i, label: "MVP Final del Este", trophy: "Larry Bird Trophy", design: "confMvp", metal: "silver", crown: true, icon: "FlagTriangleRight" },
  { key: "wcfmvp", match: /^Western Conference Finals Most Valuable/i, label: "MVP Final del Oeste", trophy: "Magic Johnson Trophy", design: "confMvp", metal: "silver", crown: true, icon: "Flag" },
  { key: "allnba", match: /^All-NBA/i, label: "All-NBA", trophy: "All-NBA Team", design: "quintet", metal: "gold", icon: "Stars" },
  { key: "alldef", match: /^All-Defensive/i, label: "Quinteto Defensivo", trophy: "All-Defensive Team", design: "padlock", metal: "steel", icon: "LockKeyhole" },
  { key: "asgmvp", match: /All-Star Most Valuable/i, label: "MVP del All-Star", trophy: "Kobe Bryant Trophy", design: "kobe", metal: "silver", crown: true, icon: "Star" },
  { key: "allstar", match: /^NBA All-Star$/i, label: "All-Star", trophy: "NBA All-Star", design: "star", metal: "silver", icon: "Star" },
  { key: "cupmvp", match: /(In-Season Tournament|NBA Cup).*(MVP|Most Valuable)/i, label: "MVP de la Copa NBA", trophy: "NBA Cup MVP Trophy", design: "cupMvp", metal: "gold", crown: true, icon: "Trophy" },
  { key: "cupteam", match: /(In-Season Tournament|NBA Cup) All-Tournament/i, label: "Quinteto de la Copa NBA", trophy: "All-Tournament Team", design: "cupBall", metal: "gold", icon: "Volleyball" },
  { key: "olygold", match: /Olympic Gold/i, label: "Oro Olímpico", trophy: "Olympic Gold Medal", design: "medal", metal: "gold", icon: "Medal" },
  { key: "olysilver", match: /Olympic Silver/i, label: "Plata Olímpica", trophy: "Olympic Silver Medal", design: "medal", metal: "silver", icon: "Medal" },
  { key: "olybronze", match: /Olympic Bronze/i, label: "Bronce Olímpico", trophy: "Olympic Bronze Medal", design: "medal", metal: "bronze", icon: "Medal" },
  { key: "olyapp", match: /Olympic Appearance/i, label: "Juegos Olímpicos", trophy: "Olympian", design: "torch", metal: "silver", icon: "Flame" },
  { key: "allrookie", match: /^All-Rookie/i, label: "Quinteto Rookie", trophy: "All-Rookie Team", design: "sprout", metal: "silver", icon: "Sprout" },
  { key: "ibm", match: /IBM Award/i, label: "Premio IBM", trophy: "IBM Award (hasta 2002)", design: "hexagon", metal: "steel", icon: "Hexagon" },
  { key: "citizenship", match: /Citizenship/i, label: "Premio a la Ciudadanía", trophy: "J. Walter Kennedy Citizenship Award", design: "heart", metal: "gold", icon: "HeartHandshake" },
  { key: "sportsmanship", match: /Sportsmanship/i, label: "Deportividad", trophy: "Joe Dumars Trophy", award: "Sportsmanship Award", design: "crystal", pose: "handshake", metal: "silver", icon: "Handshake" },
  { key: "comeback", match: /Comeback/i, label: "Regreso del Año", trophy: "Comeback Player of the Year (1981-1985)", design: "comeback", metal: "bronze", icon: "Undo2" },
];

/** Premio que no está en el catálogo: medalla de acero con su nombre tal cual. */
export const FALLBACK: Omit<TrophyDef, "key" | "match" | "label"> = { design: "medal", metal: "steel", icon: "Award" };

export type AwardLike = { award_name: string; season: string | null };

export type TrophyGroup = Omit<TrophyDef, "match"> & { seasons: string[]; count: number; detail?: string };

const TEAMS = [
  ["1st", "1.er quinteto"],
  ["2nd", "2.º quinteto"],
  ["3rd", "3.er quinteto"],
] as const;

/** Agrupa los premios de un jugador por trofeo, en el orden de la vitrina. */
export function groupAwards(awards: AwardLike[]): TrophyGroup[] {
  const groups = new Map<string, TrophyGroup>();
  const order = new Map<string, number>();
  const ordinals = new Map<string, string[]>();
  for (const award of awards) {
    const index = TROPHIES.findIndex((t) => t.match.test(award.award_name));
    const def = TROPHIES[index];
    const key = def?.key ?? award.award_name;
    let group = groups.get(key);
    if (!group) {
      const base = def ?? { ...FALLBACK, key, label: award.award_name };
      group = {
        key,
        label: base.label,
        trophy: base.trophy,
        award: base.award,
        design: base.design,
        pose: base.pose,
        metal: base.metal,
        crown: base.crown,
        icon: base.icon,
        glyph: base.glyph,
        major: base.major,
        seasons: [],
        count: 0,
      };
      groups.set(key, group);
      order.set(key, index === -1 ? TROPHIES.length : index);
      ordinals.set(key, []);
    }
    group.count += 1;
    if (award.season) group.seasons.push(award.season);
    const ordinal = award.award_name.match(/\b(1st|2nd|3rd) Team/)?.[1];
    if (ordinal) ordinals.get(key)!.push(ordinal);
  }

  return [...groups.values()]
    .sort((a, b) => order.get(a.key)! - order.get(b.key)! || b.count - a.count)
    .map((group) => {
      const teams = ordinals.get(group.key)!;
      return {
        ...group,
        seasons: [...group.seasons].sort(),
        // Quintetos: "1.er quinteto ×4 · 2.º quinteto ×1"
        detail: teams.length
          ? TEAMS.map(([o, name]) => [name, teams.filter((x) => x === o).length] as const)
              .filter(([, n]) => n > 0)
              .map(([name, n]) => `${name} ×${n}`)
              .join(" · ")
          : undefined,
      };
    });
}

/** Cuántas veces ha ganado cada premio, por clave (`lib/compare.ts` compara champion, mvp, fmvp, dpoy...). */
export function trophyCounts(awards: AwardLike[]): Record<string, number> {
  return Object.fromEntries(groupAwards(awards).map((group) => [group.key, group.count]));
}

/** "2015-16" -> "2016" (el año en que se gana el premio), para la placa grabada. */
export function engravedYear(season: string): string {
  const m = season.match(/^(\d{4})-(\d{2})$/);
  if (!m) return season;
  return String(Number(m[1]) + 1);
}
