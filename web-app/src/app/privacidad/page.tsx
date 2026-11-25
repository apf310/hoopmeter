import type { Metadata } from "next";
import Link from "next/link";
import { DeleteDeviceData } from "@/components/legal/DeleteDeviceData";
import { LegalPage, LegalSection } from "@/components/legal/LegalPage";
import { DEVICE_DATA, LEGAL, mailto } from "@/lib/legal";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Privacidad y cookies",
  description: "Qué datos trata Hoopmeter, para qué y cómo borrarlos. Sin cuentas, sin publicidad y sin cookies de terceros.",
  path: "/privacidad",
});

const WHERE_LABEL = { cookie: "Cookie", localStorage: "Almacenamiento local", sessionStorage: "Almacenamiento de sesión" } as const;

/**
 * Política de privacidad y cookies (Tarea 6.26). Describe solo lo que la app hace hoy: si cambia lo que se
 * guarda (cuentas 8.1, publicidad, un proveedor nuevo), se cambia este texto y `LEGAL_UPDATED` en `lib/legal.ts`.
 * Tarea 6.27: estadísticas de visitas (Vercel Web Analytics, sin cookies) y errores en `app_errors` (sin IP).
 */
export default function PrivacyPage() {
  return (
    <LegalPage kicker="Tus datos" title="Privacidad y cookies" path="/privacidad">
      <LegalSection title="En resumen">
        <ul>
          <li>
            <strong>Sin cuentas:</strong> no te pedimos nombre, email ni teléfono. No sabemos quién eres.
          </li>
          <li>
            <strong>Sin publicidad y sin cookies de terceros.</strong> No vendemos ni cedemos datos.
          </li>
          <li>
            Contamos las visitas <strong>sin cookies y sin saber quién eres</strong>, y recogemos los fallos de la app sin
            tu IP.
          </li>
          <li>
            Tus favoritos y tus búsquedas se quedan <strong>en tu dispositivo</strong>.
          </li>
          <li>
            Lo único que guardamos en nuestro servidor es la suscripción al <strong>aviso de la mañana</strong>, y solo si
            la activas tú.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Responsable">
        <p>
          El responsable del tratamiento es <strong>{LEGAL.owner}</strong> ({LEGAL.country}). Para cualquier cosa sobre
          tus datos escribe a <a href={mailto("Privacidad")}>{LEGAL.email}</a>.
        </p>
      </LegalSection>

      <LegalSection title="Qué datos se tratan y para qué">
        <p>
          <strong>Al usar la web o la app.</strong> Como cualquier web, el servidor que la aloja (Vercel) recibe tu dirección
          IP, tu navegador y la página que pides, y guarda registros técnicos durante poco tiempo. Sirven para que la web
          funcione y para protegerla; no los usamos para saber quién eres. Base legal: interés legítimo en prestar el
          servicio de forma segura (art. 6.1.f del RGPD).
        </p>
        <p>
          <strong>Estadísticas de visitas.</strong> Para saber qué pantallas se usan, Vercel Web Analytics cuenta las
          páginas vistas con su ruta (sin los parámetros de la dirección), la web de la que vienes, el país, el tipo de
          dispositivo, el navegador y el sistema. No usa cookies ni guarda nada en tu dispositivo: distingue visitantes con
          un código calculado a partir de la petición que cambia cada día, así que no puede seguirte de un día a otro ni
          saber quién eres. Base legal: interés legítimo en mejorar la app (art. 6.1.f del RGPD).
        </p>
        <p>
          <strong>Errores de la app.</strong> Si una pantalla falla, se guarda en nuestra base de datos (Supabase) qué ha
          fallado, en qué ruta (sin los parámetros) y el navegador y el sistema a grandes rasgos (por ejemplo, «Chrome ·
          Android»). Ni tu IP ni nada que te identifique. Se borra a los 30 días si no se repite. Base legal: interés
          legítimo en que la app funcione (art. 6.1.f).
        </p>
        <p>
          <strong>Fotos de jugadores.</strong> Tu navegador las descarga directamente de la NBA (<code>cdn.nba.com</code>),
          que recibe tu IP como cualquier web que visitas.
        </p>
        <p>
          <strong>Evaluación del GM con IA.</strong> Al pedirla, enviamos a Google (Gemini API) solo el traspaso: equipos,
          jugadores, rondas y contratos. Nada tuyo. La respuesta se guarda tres días en nuestra base de datos (Supabase)
          para no repetirla, sin nada que diga quién la pidió. Para evitar abusos, el servidor cuenta las peticiones de cada IP en
          memoria durante un minuto; nunca se guarda.
        </p>
        <p>
          <strong>Aviso de la mañana (solo si lo activas).</strong> Guardamos en nuestra base de datos (Supabase) la
          dirección de avisos que da tu navegador o tu móvil (con sus claves de cifrado), la hora y el tipo de aviso
          elegidos, los ids de tus equipos favoritos (para nombrar su partido) y el día del último aviso enviado. Ni nombre
          ni email. Base legal: tu consentimiento (art. 6.1.a), que retiras al desactivarlo. Se borra al desactivarlo, al
          pulsar «Borrar los datos de este dispositivo» o cuando el servicio de avisos nos dice que ya no existe. El aviso
          lo envía un proceso automático (GitHub Actions) por el servicio de tu navegador (Google, Mozilla, Apple o
          Microsoft) o, en la app de Android, por Firebase Cloud Messaging de Google.
        </p>
        <p>
          <strong>Imágenes y vídeos para compartir.</strong> Se crean en tu propio dispositivo y no se suben a ningún sitio.
        </p>
      </LegalSection>

      <LegalSection id="cookies" title="Cookies y datos del dispositivo">
        <p>
          Hoopmeter usa <strong>una sola cookie</strong>, propia y técnica, y el almacenamiento del navegador para lo que
          eliges tú. Al ser necesarios para lo que pides (art. 22.2 de la LSSI), no hace falta pedirte permiso ni mostrar
          un banner. No hay cookies de terceros, de publicidad ni de analítica: las estadísticas de visitas y los avisos de
          errores no guardan nada en tu dispositivo.
        </p>
        {/* Lista y no tabla: a 360 px tres columnas obligaban a desplazarse de lado */}
        <ul className="list-none! space-y-0! border-y border-slate-800 pl-0!">
          {DEVICE_DATA.map((item) => (
            <li key={item.key} className="border-b border-slate-800/70 py-3 pl-0! last:border-0 md:grid md:grid-cols-[14rem_1fr] md:gap-6">
              <div>
                <code className="text-white">
                  {item.key}
                  {item.key.endsWith(":") && "…"}
                </code>
                <span className="block text-xs text-slate-500">{WHERE_LABEL[item.where]}</span>
              </div>
              <div className="mt-1 md:mt-0">
                <p>{item.what}</p>
                <p className="text-sm text-slate-400">{item.lasts}</p>
              </div>
            </li>
          ))}
        </ul>
        <p>
          La app también guarda una copia de la página «Sin conexión» para enseñártela si te quedas sin red. No lleva datos
          tuyos ni de partidos.
        </p>
      </LegalSection>

      <LegalSection id="borrar" title="Borrar tus datos">
        <p>
          Con este botón das de baja el aviso de la mañana (se borra también de nuestro servidor) y quitas favoritos,
          búsquedas recientes y la cookie de este dispositivo. El nivel de spoilers ya se borra solo al cerrar la app.
        </p>
        <DeleteDeviceData />
        <p>
          También puedes borrarlos desde los ajustes de tu navegador o, en Android, en Ajustes › Aplicaciones › Hoopmeter ›
          Almacenamiento. Si no tienes ya el dispositivo, escríbenos a{" "}
          <a href={mailto("Borrar mis datos")}>{LEGAL.email}</a> y borraremos lo que podamos identificar.
        </p>
      </LegalSection>

      <LegalSection title="Proveedores">
        <p>Para que la app funcione usamos estos proveedores, que tratan los datos solo por encargo nuestro:</p>
        <ul>
          <li>
            <strong>Vercel</strong>: alojamiento de la web y estadísticas de visitas (Web Analytics).
          </li>
          <li>
            <strong>Supabase</strong>: base de datos (suscripciones del aviso de la mañana, registro de errores y
            evaluaciones del GM, sin datos tuyos).
          </li>
          <li>
            <strong>GitHub</strong>: procesos automáticos que envían el aviso y avisan de los errores.
          </li>
          <li>
            <strong>Google</strong>: Gemini API (evaluación del GM, sin datos tuyos) y Firebase Cloud Messaging (avisos en
            Android).
          </li>
        </ul>
        <p>
          Algunos están en Estados Unidos. Esas transferencias se amparan en el Marco de Privacidad de Datos UE-EE. UU. o en
          las cláusulas contractuales tipo de la Comisión Europea, según el proveedor.
        </p>
      </LegalSection>

      <LegalSection title="Tus derechos">
        <p>
          Puedes pedir el acceso, la rectificación, la supresión, la limitación, la portabilidad de tus datos u oponerte a
          su tratamiento escribiendo a <a href={mailto("Ejercer mis derechos")}>{LEGAL.email}</a>. Como no tenemos tu nombre
          ni tu email, lo más rápido para el aviso de la mañana es desactivarlo en <Link href="/avisos">Avisos</Link> o usar
          el botón de arriba. Si crees que no hemos atendido bien tu petición, puedes reclamar ante la Agencia Española de
          Protección de Datos (<a href="https://www.aepd.es">aepd.es</a>).
        </p>
      </LegalSection>

      <LegalSection id="menores" title="Menores y edad mínima">
        <p>
          Hoopmeter se puede usar sin dar ningún dato. Para activar el aviso de la mañana hay que tener al menos{" "}
          <strong>{LEGAL.minAge} años</strong> (art. 7 de la LOPDGDD) o hacerlo con permiso de tu madre, padre o tutor.
        </p>
      </LegalSection>

      <LegalSection id="cuentas" title="Cuentas (todavía no existen)">
        <p>
          Hoy no hay cuentas. Cuando lleguen (para los juegos y las clasificaciones), esta página se actualizará antes y
          funcionarán así:
        </p>
        <ul>
          <li>Serán opcionales: todo lo de hoy seguirá funcionando sin cuenta.</li>
          <li>
            Se entrará con Google. Guardaremos solo el identificador y el email que da Google, el alias que elijas y lo que
            hagas en los juegos y favoritos.
          </li>
          <li>
            Hará falta tener al menos <strong>{LEGAL.minAge} años</strong>.
          </li>
          <li>Podrás borrar la cuenta desde la propia app, y con ella todos sus datos.</li>
          <li>El nivel de spoilers nunca se guardará en la cuenta: la app seguirá abriéndose siempre en «Todo oculto».</li>
        </ul>
      </LegalSection>

      <LegalSection title="Publicidad, analítica y cambios">
        <p>
          Hoy no hay publicidad ni analítica. Si alguna vez las hay, lo explicaremos aquí antes y te pediremos permiso para
          cualquier cookie que no sea técnica. La fecha de arriba indica la última versión de este texto.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
