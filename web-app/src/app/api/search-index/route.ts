// Índice del buscador instantáneo: se descarga una vez al abrirlo y se filtra en el cliente,
// sin una petición a Supabase por cada tecla.
import { getSearchIndex } from "@/lib/queries";

export async function GET() {
  const index = await getSearchIndex();
  return Response.json(index, {
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
