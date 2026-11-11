// Primer paso de `npm run cap:sync`. La app nativa carga la web desplegada; lo único que
// lleva dentro es esta página, que se muestra si no hay conexión. Reintentar debe ir a la URL
// remota: desde el origen local, "/" volvería a abrir esta misma página.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Sin .env.local: la URL puede llegar por el entorno
}

const url = process.env.CAPACITOR_SERVER_URL;
if (!url) console.warn("Aviso: falta CAPACITOR_SERVER_URL; la app nativa no tendrá qué cargar.");

const page = readFileSync("public/offline.html", "utf8");
const marker = 'const RETRY_URL = "/";';
if (!page.includes(marker)) throw new Error(`public/offline.html debe contener: ${marker}`);

mkdirSync("native-shell", { recursive: true });
writeFileSync("native-shell/index.html", page.replace(marker, `const RETRY_URL = ${JSON.stringify(url ?? "/")};`));
