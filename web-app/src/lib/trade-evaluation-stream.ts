// Evaluación del GM por partes (Tarea 6.24). Puro y sin dependencias: lo usan la ruta, la tarjeta y los tests.
// La ruta responde con NDJSON (un evento por línea): los pasos reales del servidor, la evaluación a
// medio escribir mientras llega de Gemini y la final ya validada.

/** Pasos que ve el usuario, en orden. */
export const EVALUATION_STEPS = ["convenio", "datos", "modelo", "escritura"] as const;
export type EvaluationStep = (typeof EVALUATION_STEPS)[number];

/** Lo que hay de cada equipo mientras se escribe. La nota solo sale cuando está entera. */
export type PartialTeamEvaluation = { teamId: number; analysis?: string; headline?: string; grade?: string };
export type PartialEvaluation = { teams: PartialTeamEvaluation[]; summary?: string };

export type EvaluationEvent<Final> =
  | { type: "step"; step: EvaluationStep }
  | { type: "partial"; evaluation: PartialEvaluation }
  | { type: "done"; evaluation: Final }
  | { type: "error"; error: string };

export const NDJSON_TYPE = "application/x-ndjson; charset=utf-8";

export const encodeEvent = <Final>(event: EvaluationEvent<Final>) => `${JSON.stringify(event)}\n`;

/** Separa en líneas lo que llega por trozos: devuelve las líneas completas y lo que queda a medias. */
export function splitLines(buffer: string): { lines: string[]; rest: string } {
  const parts = buffer.split("\n");
  const rest = parts.pop() ?? "";
  return { lines: parts.filter((line) => line.trim() !== ""), rest };
}

type Frame = { kind: "{" | "["; expectKey: boolean };
const closers = (stack: Frame[]) =>
  stack
    .map((frame) => (frame.kind === "{" ? "}" : "]"))
    .reverse()
    .join("");

/**
 * Lee un JSON a medio llegar: cierra lo abierto y quita lo que aún no forma un valor (una clave sin
 * valor, una coma final). Con `partialStrings`, el texto que se está escribiendo sale ya; sin él, solo
 * los textos completos (así una nota "A" nunca es la mitad de "A-"). Devuelve undefined si no se puede.
 */
export function parsePartialJson(text: string, partialStrings = true): unknown {
  const stack: Frame[] = [];
  let safeEnd = 0;
  let safeClosers = "";
  let inString = false;
  let isKey = false;
  let escaped = false;
  let unicodeLeft = 0;
  let escapeStart = 0;

  const markSafe = (end: number) => {
    safeEnd = end;
    safeClosers = closers(stack);
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (unicodeLeft > 0) unicodeLeft--;
      else if (escaped) {
        escaped = false;
        if (char === "u") unicodeLeft = 4;
      } else if (char === "\\") {
        escaped = true;
        escapeStart = i;
      } else if (char === '"') {
        inString = false;
        if (!isKey) markSafe(i + 1);
      }
      continue;
    }
    const top = stack.at(-1);
    if (char === '"') {
      inString = true;
      isKey = top?.kind === "{" && top.expectKey;
    } else if (char === "{" || char === "[") {
      stack.push({ kind: char, expectKey: char === "{" });
      markSafe(i + 1);
    } else if (char === "}" || char === "]") {
      stack.pop();
      markSafe(i + 1);
    } else if (char === ":" && top?.kind === "{") {
      top.expectKey = false;
    } else if (char === "," && top?.kind === "{") {
      top.expectKey = true;
    }
  }

  let candidate = text.slice(0, safeEnd) + safeClosers;
  if (inString && !isKey && partialStrings) {
    const cut = escaped || unicodeLeft > 0 ? escapeStart : text.length;
    candidate = `${text.slice(0, cut)}"${closers(stack)}`;
  }
  try {
    return candidate ? JSON.parse(candidate) : undefined;
  } catch {
    return undefined;
  }
}

type RawTeam = { team?: unknown; analysis?: unknown; headline?: unknown; grade?: unknown };
type RawEvaluation = { teams?: RawTeam[]; summary?: unknown };

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value : undefined);

/**
 * Evaluación a medias a partir del texto que va llegando del modelo. Solo equipos del traspaso (por su
 * sigla), en el orden del traspaso, y la nota únicamente si es una de `grades` y está completa.
 */
export function partialEvaluation(raw: string, teams: { id: number; abbreviation: string }[], grades: readonly string[]): PartialEvaluation | null {
  const loose = parsePartialJson(raw) as RawEvaluation | undefined;
  if (!loose || typeof loose !== "object") return null;
  const strict = parsePartialJson(raw, false) as RawEvaluation | undefined;
  const entries = Array.isArray(loose.teams) ? loose.teams : [];
  const strictEntries = Array.isArray(strict?.teams) ? strict.teams : [];

  const partialTeams = teams.flatMap((team) => {
    const entry = entries.find((candidate) => candidate?.team === team.abbreviation);
    if (!entry) return [];
    const grade = strictEntries.find((candidate) => candidate?.team === team.abbreviation)?.grade;
    return [
      {
        teamId: team.id,
        analysis: text(entry.analysis),
        headline: text(entry.headline),
        grade: typeof grade === "string" && grades.includes(grade) ? grade : undefined,
      },
    ];
  });
  return { teams: partialTeams, summary: text(loose.summary) };
}
