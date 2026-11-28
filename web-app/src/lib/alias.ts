// Alias de las cuentas (Tarea 8.5): formato, palabras ofensivas, nombres reservados y sugerencias. Puro y sin
// dependencias (tests con `node --test`): lo usa el cliente para avisar mientras se escribe y el servidor para decidir
// (la base de datos solo comprueba el formato y que no haya dos iguales).
//
// El filtro no se deja engañar por los trucos de siempre: mayúsculas, tildes, números por letras ("put4", "p0lla"),
// guiones bajos o números en medio ("p_u_t_a") y letras repetidas ("puuuta"). Y no se pasa de listo: una palabra o un
// nombre normales que contienen un insulto ("computadora", "disputa", "Vergara", "Maricarmen") valen, gracias a la
// lista de palabras permitidas.

export const ALIAS_MIN = 3;
export const ALIAS_MAX = 16;
/** Una vez por semana (lo comprueba `account_rename` en `cuentas.sql`; cambiar solo mayúsculas, siempre). */
export const ALIAS_COOLDOWN_DAYS = 7;

const FORMAT = /^[A-Za-zÑñ0-9_]+$/;

export type AliasProblem = "short" | "long" | "chars" | "letters" | "underscore" | "reserved" | "offensive";

export type AliasCheck = { ok: true; alias: string; key: string } | { ok: false; problem: AliasProblem; message: string };

export const ALIAS_MESSAGES: Readonly<Record<AliasProblem | "taken", string>> = {
  short: `Mínimo ${ALIAS_MIN} caracteres.`,
  long: `Máximo ${ALIAS_MAX} caracteres.`,
  chars: "Solo letras, números y _ (sin espacios ni tildes).",
  letters: "Tiene que llevar alguna letra.",
  underscore: "Sin _ al principio, al final ni dos seguidos.",
  reserved: "Ese alias está reservado.",
  offensive: "Ese alias no está permitido. Prueba con otro.",
  taken: "Ese alias ya lo tiene otra persona.",
};

/** Lo que hace únicos a los alias: "Peña" y "pena" son el mismo. */
export const aliasKey = (alias: string): string => alias.toLowerCase().replace(/ñ/g, "n");

// ---------------------------------------------------------------------------------------------------------
// Palabras ofensivas
//
// Cada palabra se busca dentro del alias ya normalizado (minúsculas, sin tildes, números leídos como letras y solo
// letras) y admite letras repetidas: "polla" encuentra "pollla" y "poolla", pero no "pola". Las que salen dentro de
// palabras normales llevan esas palabras en ALLOWED, que se quitan antes de buscar.

const BLOCKED: readonly string[] = [
  // Español
  "puta", "puto", "gilipol", "polla", "joder", "jodete", "mierda", "cabron", "kabron", "maricon", "marica", "bollera",
  "zorra", "guarra", "follar", "chupamela", "chupala", "mamada", "pendejo", "verga", "culero", "ojete", "subnormal",
  "retrasado", "mongolo", "imbecil", "idiota", "estupido", "pajillero", "pajero", "coñazo", "cojones", "capullo",
  "malparido", "gonorrea", "violador", "violar", "pederasta", "pedofilo", "porno", "sexo", "tetas", "pene", "negrata",
  "sudaca", "panchito", "travelo",
  // Inglés
  "fuck", "shit", "bitch", "cunt", "pussy", "whore", "slut", "asshole", "bastard", "wanker", "retard", "rapist", "faggot",
  "niga", "niger", "penis", "vagina", "porn", "tits", "dildo", "blowjob", "cumshot",
  // Odio
  "nazi", "hitler", "heilhitler", "siegheil", "kkk", "holocaust",
];

/** Palabras normales que contienen una de las de arriba (ya normalizadas). */
const ALLOWED: readonly string[] = [
  "computa", "computo", "disputa", "disputo", "reputa", "imputa", "imputo", "diputa", "amputa", "putativ", "ampolla",
  "maricarmen", "maricastan", "vergara", "penelope", "peneira", "penedes", "ignazi", "naziona", "nazir", "nazim", "ashkenazi",
  "therapist", "nigeria", "scunthorpe", "shiitake", "shitake", "petits",
];

/** Minúsculas, sin tildes (la ñ, n), números leídos como letras y solo letras. */
export function normalizeForFilter(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[0134578@$9]/g, (c) => ({ "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "9": "g", "@": "a", $: "s" })[c] ?? c)
    .replace(/[^a-z]/g, "");
}

const escape = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** "polla" → /p+o+l{2,}a+/: cada letra como mínimo las veces que sale, y más si se repite. */
function rootPattern(word: string): RegExp {
  const runs = normalizeForFilter(word).match(/(.)\1*/g) ?? [];
  return new RegExp(runs.map((run) => `${escape(run[0])}${run.length === 1 ? "+" : `{${run.length},}`}`).join(""));
}

const BLOCKED_PATTERNS = BLOCKED.map(rootPattern);
const ALLOWED_NORMALIZED = ALLOWED.map(normalizeForFilter);

/** Si el texto contiene una palabra ofensiva, con los trucos de siempre para colarla. */
export function isOffensive(text: string): boolean {
  // Dos lecturas del "1": como i ("h1jo") y como l ("po11a")
  const base = normalizeForFilter(text);
  const withL = normalizeForFilter(text.replace(/1/g, "l"));
  return [base, withL].some((variant) => {
    let clean = variant;
    for (const word of ALLOWED_NORMALIZED) clean = clean.split(word).join("·");
    return clean.split("·").some((part) => BLOCKED_PATTERNS.some((pattern) => pattern.test(part)));
  });
}

// ---------------------------------------------------------------------------------------------------------
// Reservados: nadie puede hacerse pasar por la app

const RESERVED_EXACT = new Set(["nba", "wnba", "root", "system", "sistema", "null", "undefined", "anonimo", "anonymous", "alpe"]);
const RESERVED_PARTS = ["hoopmeter", "admin", "moderador", "moderator", "soporte", "support", "oficial", "official", "alpelabs", "staff"];

export function isReserved(alias: string): boolean {
  const key = aliasKey(alias).replace(/_/g, "");
  return RESERVED_EXACT.has(key) || RESERVED_PARTS.some((part) => key.includes(part));
}

// ---------------------------------------------------------------------------------------------------------

/** Comprueba un alias tal como lo escribe la persona (sin espacios alrededor). */
export function checkAlias(input: string): AliasCheck {
  const alias = input.trim();
  const fail = (problem: AliasProblem): AliasCheck => ({ ok: false, problem, message: ALIAS_MESSAGES[problem] });
  if ([...alias].length < ALIAS_MIN) return fail("short");
  if ([...alias].length > ALIAS_MAX) return fail("long");
  if (!FORMAT.test(alias)) return fail("chars");
  if (!/[A-Za-zÑñ]/.test(alias)) return fail("letters");
  if (alias.startsWith("_") || alias.endsWith("_") || alias.includes("__")) return fail("underscore");
  if (isReserved(alias)) return fail("reserved");
  if (isOffensive(alias)) return fail("offensive");
  return { ok: true, alias, key: aliasKey(alias) };
}

const SUGGESTION_WORDS = [
  "Triple", "Tapon", "Mate", "AlleyOop", "Rebote", "Crossover", "Bocina", "Canasta", "Tirador", "Escolta", "Alero", "Pivot",
  "Base", "Zona", "Contraataque", "Fadeaway", "Gancho", "Bandeja", "Tablero", "Robo",
];

/** Un alias de baloncesto con número ("Triple_27"), siempre válido. `random` = Math.random o uno de los tests. */
export function suggestAlias(random: () => number = Math.random): string {
  const word = SUGGESTION_WORDS[Math.floor(random() * SUGGESTION_WORDS.length) % SUGGESTION_WORDS.length];
  const number = 10 + Math.floor(random() * 990);
  return `${word}_${number}`.slice(0, ALIAS_MAX);
}
