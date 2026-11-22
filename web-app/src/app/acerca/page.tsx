import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/legal/LegalPage";
import { BRAND } from "@/lib/brand";
import { LEGAL, mailto, NBA_DISCLAIMER } from "@/lib/legal";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Acerca de",
  description: "Qué es Hoopmeter, cómo se pone la nota de cada partido sin spoilers y quién lo hace.",
  path: "/acerca",
});

/** "Acerca de" (Tarea 6.26). Sin nada de partidos: no depende del nivel de spoilers. */
export default function AboutPage() {
  return (
    <LegalPage kicker={BRAND.claim} title="Acerca de Hoopmeter" path="/acerca">
      <LegalSection title="Qué es">
        <p>
          Hoopmeter es la NBA en español pensada para quien ve los partidos en diferido: te dice{" "}
          <strong>qué partido merece la pena ver</strong> con una nota del 1 al 10, sin destriparte el resultado. Su nombre
          junta <em>hoop</em> (aro) y <em>meter</em> (medidor).
        </p>
        <ul>
          <li>
            Siempre se abre en <strong>«Todo oculto»</strong>: solo partidos y horas.
          </li>
          <li>
            Con un toque, <strong>«Nota»</strong>: la del Hoopmeter, nada más. Ni prórrogas, ni ganador, ni récords.
          </li>
          <li>
            Manteniendo pulsado, <strong>«Resultados»</strong>: marcadores, boxscore y todo lo demás. Un roce nunca destripa
            nada.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Cómo se pone la nota">
        <p>
          Al acabar cada partido, la app reconstruye la probabilidad de victoria segundo a segundo y puntúa hasta cuándo
          estuvo en el aire, la igualdad, las remontadas, el ritmo de anotación y las grandes actuaciones. Se lee como una
          nota del colegio: <strong className="text-emerald-400!">8 o más</strong>, partidazo;{" "}
          <strong className="text-amber-400!">de 5 a 7,9</strong>, se deja ver; <strong className="text-red-400!">menos de 5</strong>
          , se decidió pronto. La prórroga no suma por sí sola, para que la nota no la delate.
        </p>
      </LegalSection>

      <LegalSection title="Además">
        <p>
          Fichas de jugadores y equipos, clasificación, <Link href="/que-ver">qué ver</Link> de la semana, modo diferido,
          aviso de la mañana sin resultados, un <Link href="/gm-simulator">GM Virtual</Link> que valida los traspasos con
          el convenio colectivo y un <Link href="/compare">comparador</Link> de jugadores de cualquier época. Todo se puede
          compartir en imagen.
        </p>
      </LegalSection>

      <LegalSection title="Quién lo hace">
        <p>
          Un proyecto independiente hecho en {LEGAL.country} por {LEGAL.owner}. Ideas, errores o lo que quieras contar:{" "}
          <a href={mailto("Hoopmeter")}>{LEGAL.email}</a>.
        </p>
        <p className="text-slate-400">{NBA_DISCLAIMER}</p>
        <p>
          Más en <Link href="/privacidad">Privacidad y cookies</Link> y en el <Link href="/aviso-legal">Aviso legal</Link>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
