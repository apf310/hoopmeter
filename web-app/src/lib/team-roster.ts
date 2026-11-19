// Tarea 6.7: plantilla de la ficha de equipo con promedios y salario, ordenable por columnas.
// Reglas puras, sin dependencias (las usan el servidor, el cliente y `npm test`).

/** Una fila de la plantilla: promedios de la temporada y salario de la temporada del GM (`SEASON`). */
export type RosterRow = {
  id: number;
  name: string;
  position: string | null;
  /** Null: sin partidos en esa temporada. */
  gp: number | null;
  min: number | null;
  pts: number | null;
  reb: number | null;
  ast: number | null;
  /** 0-1. */
  fg3Pct: number | null;
  /** Null si no hay cifra (contrato `pending` o sin contrato registrado): nunca inventada. */
  salary: number | null;
  /** Null = sin contrato registrado; `approx` se muestra con "≈". */
  salaryStatus: "confirmed" | "approx" | "pending" | null;
};

export type RosterSortKey = "name" | "gp" | "min" | "pts" | "reb" | "ast" | "fg3Pct" | "salary";
export type RosterSort = { key: RosterSortKey; dir: "asc" | "desc" };

/** Por defecto, por minutos: arriba la rotación (Tarea 6.7). */
export const DEFAULT_ROSTER_SORT: RosterSort = { key: "min", dir: "desc" };

/** Primer clic en una columna: los nombres de la A a la Z; las cifras, de mayor a menor. */
export function firstDirection(key: RosterSortKey): RosterSort["dir"] {
  return key === "name" ? "asc" : "desc";
}

/** Clic en una cabecera: la misma columna invierte el orden; otra empieza en su orden natural. */
export function nextSort(current: RosterSort, key: RosterSortKey): RosterSort {
  if (current.key === key) return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  return { key, dir: firstDirection(key) };
}

const collator = new Intl.Collator("es", { sensitivity: "base" });

/**
 * Ordena sin mutar. Los vacíos (sin partidos, sin cifra) van siempre al final, en cualquier sentido;
 * los empates, por minutos y después por nombre, para que el orden sea estable.
 */
export function sortRoster(rows: RosterRow[], { key, dir }: RosterSort): RosterRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === "name") return sign * collator.compare(a.name, b.name);
    const va = a[key];
    const vb = b[key];
    if (va !== vb) {
      if (va === null) return 1;
      if (vb === null) return -1;
      return sign * (va - vb);
    }
    return (b.min ?? -1) - (a.min ?? -1) || collator.compare(a.name, b.name);
  });
}
