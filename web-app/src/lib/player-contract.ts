// Tarea 6.8: contrato año a año de la ficha del jugador. Reglas puras, sin dependencias (`npm test`).
// Cifras nunca inventadas: sin cifra pública se dice "Sin cifra"; las aproximadas llevan "≈".
import type { PlayerContract } from "./supabase";

export type ContractYearStatus = "confirmed" | "approx" | "pending" | "renewal";

export type ContractYear = {
  season: string;
  /** Null = sin cifra pública (`pending`) o años de una renovación aún sin cifra (`renewal`). */
  salary: number | null;
  status: ContractYearStatus;
};

export type ContractView = {
  status: "confirmed" | "approx" | "pending";
  years: ContractYear[];
  /** Suma de los años con cifra; null si alguno no la tiene. */
  total: number | null;
  /** Próxima opción pendiente. La tabla no dice de qué año es: no se coloca en ninguno. */
  option: PlayerContract["contract_option"];
  /** Solo se guardan 4 temporadas: con las 4 llenas, el contrato puede seguir después. */
  maybeLonger: boolean;
  /** Lo que publicó la prensa de un contrato aún sin cifra (años, total, mínimo y la noticia). */
  reported: { years: number | null; total: number | null; minimum: boolean; outlet: string | null; url: string | null } | null;
  signedOn: string | null;
  signedKind: PlayerContract["signed_kind"];
  acquiredOn: string | null;
};

/** "2026-27" → "2027-28" */
export function nextSeason(season: string): string {
  const start = Number(season.slice(0, 4)) + 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** Contrato de `player_contracts` en filas por temporada; `season` = la temporada de `salary_current`. */
export function buildContractView(contract: PlayerContract, season: string): ContractView {
  const pending = contract.status === "pending" || contract.salary_current === null;
  const precision = contract.source?.precision === "approx" ? "approx" : "confirmed";
  const reported = contract.source?.reported;
  const item = contract.source?.items?.[0];
  const base = {
    option: contract.contract_option,
    signedOn: contract.signed_on,
    signedKind: contract.signed_kind,
    acquiredOn: contract.acquired_on,
    reported:
      pending && reported
        ? { years: reported.years, total: reported.total, minimum: reported.minimum, outlet: item?.outlet ?? null, url: item?.url ?? null }
        : null,
  };

  if (pending) {
    return { ...base, status: "pending", years: [{ season, salary: null, status: "pending" }], total: null, maybeLonger: false };
  }

  const salaries = [contract.salary_current, contract.salary_year_2, contract.salary_year_3, contract.salary_year_4];
  // Los años del contrato son los seguidos desde la temporada actual: un hueco cierra el contrato
  const gap = salaries.findIndex((salary) => salary === null);
  const known = (gap === -1 ? salaries : salaries.slice(0, gap)) as number[];
  const years: ContractYear[] = [];
  let label = season;
  for (const salary of known) {
    years.push({ season: label, salary, status: precision });
    label = nextSeason(label);
  }
  const renewal = contract.status === "pending_future";
  if (renewal) years.push({ season: label, salary: null, status: "renewal" });

  return {
    ...base,
    status: precision,
    years,
    total: renewal ? null : known.reduce((sum, salary) => sum + salary, 0),
    maybeLonger: !renewal && known.length === salaries.length,
  };
}

export const OPTION_LABEL: Record<NonNullable<PlayerContract["contract_option"]>, string> = {
  "Player Option": "Opción de jugador",
  "Team Option": "Opción de equipo",
};

export const SIGNED_KIND_LABEL: Record<NonNullable<PlayerContract["signed_kind"]>, string> = {
  free_agent: "Fichaje como agente libre",
  extension: "Renovación",
  rookie: "Contrato de novato",
  rookie_extension: "Renovación de novato",
};
