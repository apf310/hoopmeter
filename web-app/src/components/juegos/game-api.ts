// Llamadas a los retos que se juegan con calma (Adivina el jugador y Carrera oculta): errores con su código y texto.

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null
  ) {
    super(message);
  }
}

export async function api<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, { ...init, headers: { "Content-Type": "application/json" } });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string; code?: string };
  if (!response.ok) throw new ApiError(data.error ?? "No se ha podido conectar.", response.status, data.code ?? null);
  return data;
}

/** Una jugada, con un reintento si falla la red (reenviarla nunca cuenta dos veces: lo comprueba el servidor). */
export async function postMove<T>(url: string, body: { run: string | null } & Record<string, unknown>): Promise<T> {
  const init = { method: "POST", cache: "no-store" as const, body: JSON.stringify(body) };
  try {
    return await api<T>(url, init);
  } catch (error) {
    // Sin partida, reintentar podría empezar otra: solo se reintenta lo que ya tiene número
    if ((error instanceof ApiError && error.status < 500) || body.run === null) throw error;
    await new Promise((resolve) => setTimeout(resolve, 600));
    return api<T>(url, init);
  }
}

export const errorText = (error: unknown) => (error instanceof ApiError ? error.message : "Se ha perdido la conexión.");

/** "a la primera", "a la 3.ª". */
export const attemptText = (n: number) => (n === 1 ? "a la primera" : `a la ${n}.ª`);
