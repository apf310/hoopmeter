// Descarga los escudos de las 30 franquicias (versión para fondo oscuro) a public/logos/{teamId}.svg,
// para servirlos desde la propia web sin depender de cdn.nba.com (Tarea 6.17).
// Uso: npm run logos   (volver a lanzarlo si un equipo cambia de escudo)
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "logos");
const FIRST_TEAM_ID = 1610612737;
const LAST_TEAM_ID = 1610612766;
// La CDN rechaza (403) clientes sin User-Agent de navegador
const HEADERS = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36" };
// Un SVG con scripts, manejadores de eventos o recursos externos no se guarda
const UNSAFE = /<script|<foreignObject|\son\w+\s*=|javascript:|(?:href|src)\s*=\s*["']\s*(?:https?:)?\/\//i;

await mkdir(OUT_DIR, { recursive: true });
let failed = 0;
for (let id = FIRST_TEAM_ID; id <= LAST_TEAM_ID; id++) {
  const url = `https://cdn.nba.com/logos/nba/${id}/global/D/logo.svg`;
  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const svg = await res.text();
    if (!/<svg[\s>]/i.test(svg)) throw new Error("no es un SVG");
    if (UNSAFE.test(svg)) throw new Error("contenido no permitido en el SVG");
    await writeFile(path.join(OUT_DIR, `${id}.svg`), svg);
    console.log(`✓ ${id} (${(svg.length / 1024).toFixed(1)} KB)`);
  } catch (error) {
    failed++;
    console.error(`✗ ${id}: ${error.message}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 200));
}
if (failed) {
  console.error(`${failed} escudos sin descargar`);
  process.exit(1);
}
console.log(`30 escudos en ${OUT_DIR}`);
