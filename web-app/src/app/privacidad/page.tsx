import type { Metadata } from "next";
import Link from "next/link";
import { DeleteDeviceData } from "@/components/legal/DeleteDeviceData";
import { LegalPage, LegalSection } from "@/components/legal/LegalPage";
import { DEVICE_DATA, LEGAL, mailto } from "@/lib/legal";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Privacidad y cookies",
  description: "Qué datos trata Hoopmeter, para qué y cómo borrarlos. Cuentas opcionales, sin publicidad y sin cookies de terceros.",
  path: "/privacidad",
});

const WHERE_LABEL = { cookie: "Cookie", localStorage: "Almacenamiento local", sessionStorage: "Almacenamiento de sesión" } as const;

/**
 * Política de privacidad y cookies (Tarea 6.26). Describe solo lo que la app hace hoy: si cambia lo que se
 * guarda (publicidad, un proveedor nuevo), se cambia este texto y `LEGAL_UPDATED` en `lib/legal.ts`.
 * Tarea 6.27: estadísticas de visitas (Vercel Web Analytics, sin cookies) y errores en `app_errors` (sin IP).
 * Tarea 8.5: cuentas con Google (`cuentas.sql`), recibos de los juegos y borrar la cuenta.
 */
export default function PrivacyPage() {
  return (
    <LegalPage kicker="Tus datos" title="Privacidad y cookies" path="/privacidad">
      <LegalSection title="En resumen">
        <ul>
          <li>
            <strong>La cuenta es opcional:</strong> sin ella no te pedimos nombre, email ni teléfono y no sabemos quién eres.
            Si la creas (con Google), guardamos tu email, tu alias, tus resultados de los juegos y tus favoritos, y la puedes
            borrar cuando quieras.
          </li>
          <li>
            <strong>Sin publicidad y sin cookies de terceros.</strong> No vendemos ni cedemos datos.
          </li>
          <li>
            Contamos las visitas <strong>sin cookies y sin saber quién eres</strong>, y recogemos los fallos de la app sin
            tu IP.
          </li>
          <li>
            Sin cuenta, tus favoritos, tus búsquedas y tus puntos de los juegos se quedan <strong>en tu dispositivo</strong>.
          </li>
          <li>
            De ti, en nuestro servidor solo guardamos <strong>tu cuenta</strong> si la creas y la suscripción al{" "}
            <strong>aviso de la mañana</strong> si la activas.
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
          <strong>Juegos.</strong> Para que nadie pueda hacer trampas, los retos los pone y los corrige nuestro servidor: cada
          partida (en ¿Más o menos?, sus preguntas, tus respuestas y lo que tardas en cada una; en Adivina el jugador y
          Carrera oculta, los jugadores que dices y, en la segunda, si has visto los equipos) se guarda dos días en nuestra
          base de datos (Supabase), sin nada que diga quién juega. Al acabar cada reto, el servidor firma tu resultado (un
          «recibo») y la app lo guarda con él: así, si creas una cuenta, tus puntos pasan a ella sin que nadie pueda
          inventárselos. Sin cuenta, tus resultados, tu ELO, tu racha y el número de tus partidas de Adivina y Carrera
          oculta (para seguirlas si cierras la app) se quedan en tu dispositivo; para calcular el ELO, la app solo pide al
          servidor lo que sacó la mitad de la gente ese día, sin enviar nada tuyo. Para evitar abusos, el servidor cuenta
          las peticiones de cada IP en memoria durante un minuto; nunca se guarda. Base legal: interés legítimo en que los
          juegos sean limpios (art. 6.1.f).
        </p>
        <p>
          <strong>Tu cuenta (solo si la creas).</strong> Entras con Google, y nuestro proveedor de acceso (Supabase Auth)
          guarda lo que Google da al entrar: un identificador, tu email y, si los tienes en Google, tu nombre y tu foto.
          Nosotros solo usamos el email para decirte con qué cuenta has entrado; el nombre y la foto no los usamos ni los
          enseñamos nunca. Además guardamos el alias que eliges, la fecha de alta, tus resultados de los juegos (día, reto,
          puntos, tiempo de respuesta, los cuadros para compartir y lo que sacó la mitad de la gente ese día) y tus
          favoritos. Base legal: darte el servicio que pides al crearla (art. 6.1.b del RGPD). Se borra todo al borrar la
          cuenta y, si entras con Google y no llegas a elegir alias, lo que dio Google se borra a los 7 días. Más
          detalles en <a href="#cuentas">Cuentas</a>.
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
          Con este botón das de baja el aviso de la mañana (se borra también de nuestro servidor), cierras la sesión de tu
          cuenta y quitas favoritos, búsquedas recientes, puntos, racha, récord y partida en curso de los juegos y la
          cookie de este dispositivo. El nivel de spoilers ya se borra solo al cerrar la app. Tu cuenta sigue en nuestro
          servidor: para borrarla, entra en <Link href="/cuenta">Tu cuenta</Link> › «Borrar la cuenta».
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
            <strong>Supabase</strong>: base de datos y acceso a las cuentas, en la Unión Europea (Fráncfort): cuentas,
            suscripciones del aviso de la mañana, registro de errores, evaluaciones del GM y partidas de los juegos (estas
            tres, sin datos tuyos).
          </li>
          <li>
            <strong>GitHub</strong>: procesos automáticos que envían el aviso y avisan de los errores.
          </li>
          <li>
            <strong>Google</strong>: inicio de sesión con Google (si creas una cuenta, con su propia política de
            privacidad), Gemini API (evaluación del GM, sin datos tuyos) y Firebase Cloud Messaging (avisos en Android).
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
          su tratamiento escribiendo a <a href={mailto("Ejercer mis derechos")}>{LEGAL.email}</a>. Si tienes cuenta, en{" "}
          <Link href="/cuenta">Tu cuenta</Link> ves lo que guarda, cambias el alias y la borras tú mismo al momento. Para el
          aviso de la mañana, lo más rápido es desactivarlo en <Link href="/avisos">Avisos</Link> o usar el botón de arriba.
          Si crees que no hemos atendido bien tu petición, puedes reclamar ante la Agencia Española de Protección de Datos
          (<a href="https://www.aepd.es">aepd.es</a>).
        </p>
      </LegalSection>

      <LegalSection id="menores" title="Menores y edad mínima">
        <p>
          Hoopmeter se puede usar sin dar ningún dato. Para crear una cuenta hay que tener al menos{" "}
          <strong>{LEGAL.minAge} años</strong> (art. 7 de la LOPDGDD), y la app lo pregunta al elegir el alias. Para activar
          el aviso de la mañana, también, o hacerlo con permiso de tu madre, padre o tutor.
        </p>
      </LegalSection>

      <LegalSection id="cuentas" title="Cuentas">
        <ul>
          <li>Son opcionales: todo funciona sin cuenta.</li>
          <li>
            Se entra con Google (en la app de Android se abre el navegador del móvil para hacerlo: Google no deja hacerlo
            dentro de una app). Hace falta tener al menos <strong>{LEGAL.minAge} años</strong>.
          </li>
          <li>
            Lo que ve la gente es <strong>solo tu alias</strong> (en las clasificaciones, cuando lleguen). Nunca tu email,
            tu nombre ni tu foto. El alias no puede llevar insultos ni parecer de Hoopmeter, y se puede cambiar una vez por
            semana.
          </li>
          <li>
            Al crearla, lo de este dispositivo pasa a ella: tus favoritos y tus resultados de los juegos que tengan su
            recibo. Después, cada reto que acabes y cada favorito que cambies se guardan en ella, y llegan a cualquier
            dispositivo en el que entres.
          </li>
          <li>
            La borras tú mismo desde <Link href="/cuenta">Tu cuenta</Link>: se borran al momento tu alias, tus resultados,
            tus favoritos de la cuenta y lo que dio Google. Lo de tu dispositivo se queda hasta que lo borres arriba.
          </li>
          <li>El nivel de spoilers nunca se guarda en la cuenta: la app sigue abriéndose siempre en «Todo oculto».</li>
        </ul>
      </LegalSection>

      <LegalSection title="Publicidad, analítica y cambios">
        <p>
          Hoy no hay publicidad, y las estadísticas de visitas no usan cookies. Si alguna vez hay publicidad, lo
          explicaremos aquí antes y te pediremos permiso para cualquier cookie que no sea técnica. La fecha de arriba indica
          la última versión de este texto.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
