// Direcciones antiguas de las fichas (Tarea 7.8): `/players/203999` → 308 → `/players/203999-nikola-jokic`. Aquí y no en la
// página, que ya ha empezado a enviarse cuando se sabe el nombre y solo podría redirigir desde el navegador.
// Solo se ejecuta con las direcciones sin nombre (`matcher`): las de siempre no pasan por aquí.
import { NextResponse, type NextRequest } from "next/server";
import { playerPath, teamPath, unnamedPage } from "@/lib/routes";
import { getSupabase } from "@/lib/supabase";

export const config = { matcher: ["/players/:id(\\d+)", "/teams/:id(\\d+)"] };

const LOOKUP_MS = 2000;

/** Si la base de datos no responde o el id no existe, la ficha se abre (o da su 404) con la dirección antigua. */
async function namedPath(pathname: string): Promise<string | null> {
  const page = unnamedPage(pathname);
  if (!page) return null;
  const signal = AbortSignal.timeout(LOOKUP_MS);
  try {
    if (page.kind === "player") {
      const { data } = await getSupabase().from("players").select("full_name").eq("id", page.id).abortSignal(signal).maybeSingle();
      return data ? playerPath(page.id, data.full_name) : null;
    }
    const { data } = await getSupabase().from("teams").select("name").eq("id", page.id).abortSignal(signal).maybeSingle();
    return data ? teamPath(page.id, data.name) : null;
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const path = await namedPath(pathname);
  // La comparación evita un bucle si un nombre no deja nada que poner en la dirección
  if (!path || path === pathname) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = path;
  return NextResponse.redirect(url, 308);
}
