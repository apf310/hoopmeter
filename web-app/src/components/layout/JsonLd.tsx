import { jsonLdText, type JsonLd as JsonLdData } from "@/lib/structured-data";

/** Datos estructurados para buscadores (Tarea 7.8): no se ven ni se ejecutan. Siempre de `lib/structured-data.ts` (Nivel 1). */
export function JsonLd({ data }: { data: JsonLdData | null }) {
  return data && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(data) }} />;
}
