import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/legal/LegalPage";
import { LEGAL, mailto, NBA_DISCLAIMER } from "@/lib/legal";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Aviso legal",
  description: "Titular de Hoopmeter, relación con la NBA, origen de los datos y condiciones de uso.",
  path: "/aviso-legal",
});

/** Aviso legal y condiciones de uso (Tarea 6.26). */
export default function LegalNoticePage() {
  return (
    <LegalPage kicker="Condiciones de uso" title="Aviso legal" path="/aviso-legal">
      <LegalSection title="Titular">
        <p>
          Hoopmeter (<strong>hoopmeter.com</strong> y sus apps) es un proyecto de <strong>{LEGAL.owner}</strong>, con
          residencia en {LEGAL.country}. Contacto: <a href={mailto("Hoopmeter")}>{LEGAL.email}</a>.
        </p>
      </LegalSection>

      <LegalSection id="nba" title="Sin relación con la NBA">
        <p>
          <strong>{NBA_DISCLAIMER}</strong>
        </p>
        <p>
          «NBA», los nombres, logos y escudos de los equipos y las fotos de los jugadores son marcas y contenidos de NBA
          Properties, Inc., de sus equipos o de sus titulares. Aquí solo se usan para identificar de qué equipo, jugador o
          partido se habla. Los trofeos de la vitrina son recreaciones propias en 3D, sin el logo de la NBA ni de
          patrocinadores.
        </p>
      </LegalSection>

      <LegalSection title="De dónde salen los datos">
        <ul>
          <li>
            Calendario, marcadores, estadísticas y jugadas: fuentes públicas de la NBA (nba.com y su CDN). Pueden llegar
            con retraso o cambiar cuando la NBA corrige sus cifras.
          </li>
          <li>
            La nota del Hoopmeter, el radar, la media y la clasificación con desempates se calculan aquí a partir de esos
            datos. Son estimaciones propias, no cifras oficiales.
          </li>
          <li>
            Contratos: el registro oficial de movimientos de la NBA, las cifras publicadas por Hoops Rumors y RealGM y las
            tablas del convenio colectivo. Las aproximadas llevan «≈» y las que no se conocen salen como «Sin cifra».
          </li>
        </ul>
        <p>
          Cuidamos que todo sea correcto, pero puede haber errores. Si ves alguno, escríbenos a{" "}
          <a href={mailto("Error en los datos")}>{LEGAL.email}</a>.
        </p>
      </LegalSection>

      <LegalSection title="GM Virtual e inteligencia artificial">
        <p>
          El simulador de traspasos aplica las reglas del convenio colectivo tal como las entendemos, y no sustituye a la
          revisión oficial de la liga. La valoración de cada traspaso la escribe una IA (Google Gemini) con los datos de
          la app: es una opinión automática, puede equivocarse y no es consejo de nadie.
        </p>
      </LegalSection>

      <LegalSection title="Uso de la app">
        <ul>
          <li>Hoopmeter es gratis y para entretenimiento. No tiene apuestas ni premios en dinero, ni da consejos para apostar.</li>
          <li>
            Puedes compartir libremente las imágenes y vídeos que crea la app, con su marca de agua. El diseño, el
            código, el logo y la nota del Hoopmeter son del titular; los datos, de sus fuentes.
          </li>
          <li>
            No se permite usar la web de forma automatizada para copiar sus datos en masa ni para saturarla.
          </li>
          <li>
            El servicio se ofrece tal cual: puede cambiar, interrumpirse o dejar de existir. No respondemos de daños por
            errores o retrasos en los datos.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Privacidad y ley aplicable">
        <p>
          Cómo se tratan los datos está en <Link href="/privacidad">Privacidad y cookies</Link>. Estas condiciones se rigen
          por la ley española; si eres consumidor, conservas los derechos y el fuero que te reconozca la ley de tu país.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
