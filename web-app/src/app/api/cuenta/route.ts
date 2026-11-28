// Cuentas (Tarea 8.5). Todas las llamadas llevan el token de la sesión (`Authorization: Bearer …`), que se comprueba con
// Supabase Auth: la base de datos solo recibe el id del usuario ya comprobado.
//   GET                                          → {account}: la cuenta, o null si aún no ha elegido alias
//   POST {action: "create", alias, adult: true}  → {account} (409 code "taken" si el alias ya es de otra persona)
//   POST {action: "rename", alias}               → {alias} (409 code "taken" o "too-soon" con `next`)
//   POST {action: "claim", receipts: [...]}      → {results}: apunta los resultados con recibo válido y da todos los de la cuenta
//   POST {action: "favorites", favorites, at}    → {favorites, at}: los que valen (gana el cambio más reciente)
//   DELETE                                        → {ok}: borra la cuenta, sus datos y el usuario de Auth
// El alias se comprueba aquí (`checkAlias`: formato, reservados y palabras ofensivas). Nunca el nivel de spoilers.
import { ALIAS_MESSAGES, checkAlias } from "@/lib/alias";
import {
  accountsEnabled,
  accountUser,
  claimResults,
  createAccount,
  deleteAccount,
  getAccount,
  MAX_CLAIM,
  renameAccount,
  saveFavorites,
} from "@/lib/account-server";
import { parseFavorites } from "@/lib/favorites";
import { LEGAL } from "@/lib/legal";

const NO_STORE = { "Cache-Control": "no-store" };
const WINDOW_MS = 60_000;
const MAX_CALLS = 40;

const recent = new Map<string, number[]>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const hits = (recent.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
  hits.push(now);
  recent.set(key, hits);
  if (recent.size > 5_000) {
    for (const [k, times] of recent) if (times.every((at) => now - at >= WINDOW_MS)) recent.delete(k);
  }
  return hits.length > MAX_CALLS;
}

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE });

type Handler = (user: string, request: Request) => Promise<Response>;

/** Comprueba que hay cuentas, la sesión y el ritmo de llamadas; los fallos de Supabase, 503 (la app no cierra la sesión). */
async function withUser(request: Request, handler: Handler): Promise<Response> {
  if (!accountsEnabled()) return json({ error: "Las cuentas no están disponibles ahora mismo.", code: "disabled" }, 503);
  try {
    const user = await accountUser(request);
    if (!user) return json({ error: "Tu sesión ha caducado: vuelve a entrar.", code: "session" }, 401);
    if (isRateLimited(user)) return json({ error: "Demasiadas peticiones seguidas: espera un minuto." }, 429);
    return await handler(user, request);
  } catch (error) {
    console.error("[api/cuenta]", error instanceof Error ? error.message : error);
    if (error instanceof Error && /Sin cuenta/.test(error.message)) return json({ error: "Aún no has creado tu cuenta.", code: "no-account" }, 404);
    return json({ error: "Tu cuenta no está disponible ahora mismo. Inténtalo en un rato." }, 503);
  }
}

export async function GET(request: Request) {
  return withUser(request, async (user) => json({ account: await getAccount(user) }));
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  return withUser(request, async (user) => {
    switch (body?.action) {
      case "create": {
        if (body.adult !== true) return json({ error: `Hace falta tener ${LEGAL.minAge} años o más.` }, 400);
        const check = checkAlias(typeof body.alias === "string" ? body.alias : "");
        if (!check.ok) return json({ error: check.message, code: check.problem }, 400);
        const status = await createAccount(user, check.alias, check.key);
        if (status === "taken") return json({ error: ALIAS_MESSAGES.taken, code: "taken" }, 409);
        return json({ account: await getAccount(user) });
      }
      case "rename": {
        const check = checkAlias(typeof body.alias === "string" ? body.alias : "");
        if (!check.ok) return json({ error: check.message, code: check.problem }, 400);
        const result = await renameAccount(user, check.alias, check.key);
        if (result.status === "taken") return json({ error: ALIAS_MESSAGES.taken, code: "taken" }, 409);
        if (result.status === "too-soon") return json({ error: "Solo se puede cambiar una vez por semana.", code: "too-soon", next: result.next }, 409);
        return json({ alias: check.alias });
      }
      case "claim": {
        const receipts = body.receipts;
        if (!Array.isArray(receipts) || receipts.length > MAX_CLAIM) return json({ error: "Resultados no válidos" }, 400);
        return json({ results: await claimResults(user, receipts) });
      }
      case "favorites": {
        const at = body.at;
        if (typeof at !== "number" || !Number.isSafeInteger(at) || at <= 0) return json({ error: "Favoritos no válidos" }, 400);
        // Solo lo que se guardaría en el dispositivo: ids, nombres y equipo, con el tope de siempre
        const favorites = parseFavorites(JSON.stringify(body.favorites ?? null));
        return json(await saveFavorites(user, favorites, at));
      }
      default:
        return json({ error: "Acción no válida" }, 400);
    }
  });
}

export async function DELETE(request: Request) {
  return withUser(request, async (user) => {
    await deleteAccount(user);
    return json({ ok: true });
  });
}
