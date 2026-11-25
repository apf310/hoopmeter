// Direcciones con nombre (Tarea 7.8): `/players/203999-nikola-jokic` y `/teams/1610612743-denver-nuggets`. Puro, sin
// dependencias (con tests). Manda siempre el id del principio: con otro nombre, o sin él, se abre la misma ficha, cuya
// canónica lleva el bueno. Las direcciones antiguas (solo el id) las redirige `src/proxy.ts`.

// Letras que no se separan en letra + tilde al normalizar
const SPECIAL: Record<string, string> = { đ: "d", ð: "d", ł: "l", ø: "o", æ: "ae", œ: "oe", ß: "ss", þ: "th", ı: "i" };

/** "Nikola Jokić" → "nikola-jokic"; "P.J. Washington" → "pj-washington"; "D'Angelo Russell" → "dangelo-russell". */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[đðłøæœßþı]/g, (letter) => SPECIAL[letter])
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[.'’`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function namedSegment(id: number, name: string): string {
  const slug = slugify(name);
  return slug ? `${id}-${slug}` : String(id);
}

export function playerPath(id: number, name: string): string {
  return `/players/${namedSegment(id, name)}`;
}

export function teamPath(id: number, name: string): string {
  return `/teams/${namedSegment(id, name)}`;
}

/** Id de una ficha a partir del trozo de la URL: "203999-nikola-jokic" o "203999". Null si no empieza por un id. */
export function idFromSegment(segment: string): number | null {
  const match = /^(\d{1,15})(?:-|$)/.exec(segment);
  const id = match ? Number(match[1]) : 0;
  return id > 0 ? id : null;
}

/** Ficha sin nombre (`/players/203999`, `/teams/1610612743`): la dirección de antes de la Tarea 7.8. */
export function unnamedPage(pathname: string): { kind: "player" | "team"; id: number } | null {
  const match = /^\/(players|teams)\/(\d{1,15})\/?$/.exec(pathname);
  const id = match ? Number(match[2]) : 0;
  return id > 0 ? { kind: match![1] === "players" ? "player" : "team", id } : null;
}
