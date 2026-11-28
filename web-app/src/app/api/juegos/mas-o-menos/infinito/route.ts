// ¿Más o menos?, modo infinito (Tarea 8.2): sin puntos ni reloj, así que las preguntas viajan con su solución y las
// comprueba el cliente (respuesta al instante). Tanda de 20 desde la posición `desde`, que marca la dificultad.
// `/api/juegos/mas-o-menos/infinito?desde=20`
import { connection } from "next/server";
import { randomInt } from "node:crypto";
import { ENDLESS_BATCH, endlessBatch, seededRng } from "@/lib/mas-o-menos";
import { getPool } from "@/lib/mas-o-menos-store";

const NO_STORE = { "Cache-Control": "no-store" };
const MAX_FROM = 10_000;

export async function GET(request: Request) {
  await connection();
  const from = Number(new URL(request.url).searchParams.get("desde") ?? 0);
  if (!Number.isInteger(from) || from < 0 || from > MAX_FROM) {
    return Response.json({ error: "Parámetros: desde=0…" }, { status: 400, headers: NO_STORE });
  }
  try {
    const questions = endlessBatch(await getPool(), from, ENDLESS_BATCH, seededRng(randomInt(2 ** 32)));
    return Response.json({ from, questions }, { headers: NO_STORE });
  } catch (error) {
    console.error("[api/juegos/mas-o-menos/infinito]", error);
    return Response.json({ error: "El modo infinito no está disponible ahora mismo." }, { status: 503, headers: NO_STORE });
  }
}
