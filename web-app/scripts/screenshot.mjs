// Capturas de la web como en un Galaxy S24 (360×780, densidad 3) o en escritorio, por CDP y sin dependencias.
// Necesita Google Chrome instalado. Uso (desde web-app/):
//   node scripts/screenshot.mjs <url> <salida.png> [nivel=1] [ancho=360] [alto=780] [esperaMs=3500] [paginaCompleta=1]
// Variables opcionales: CLICK="selector||selector" (pulsa en orden), CLICK_WAIT=ms, DOWNLOAD_DIR=carpeta (permite descargas),
//   LOCAL_STORAGE=JSON y COOKIES="a=1;b=2" (estado ya guardado en el navegador, p. ej. favoritos).
// Imprime JSON con el ancho real de la página: si scrollW > W, algo se sale por la derecha (y lista qué).
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [url, out, level = "1", width = "360", height = "780", wait = "3500", full = "1"] = process.argv.slice(2);
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const port = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), "shot-"));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--hide-scrollbars", "--no-first-run", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let target;
for (let i = 0; i < 50 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page"); } catch { await sleep(200); }
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pending = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });

const mobile = Number(width) < 700;
await send("Page.enable");
if (process.env.DOWNLOAD_DIR) await send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: process.env.DOWNLOAD_DIR.replaceAll("/", "\\") });
await send("Network.setUserAgentOverride", { userAgent: mobile
  ? "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36"
  : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36" });
await send("Emulation.setDeviceMetricsOverride", { width: Number(width), height: Number(height), deviceScaleFactor: mobile ? 3 : 1, mobile });
await send("Page.addScriptToEvaluateOnNewDocument", { source: `try { sessionStorage.setItem("nba-hub:spoiler-level", JSON.stringify({ level: ${Number(level)}, hiddenAt: null })); } catch {}` });
// Opcional: LOCAL_STORAGE='{"clave":"valor"}' y COOKIES="nombre=valor;otra=valor" (p. ej. favoritos ya guardados)
if (process.env.LOCAL_STORAGE) {
  const entries = Object.entries(JSON.parse(process.env.LOCAL_STORAGE)).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join("");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `try { ${entries} } catch {}` });
}
for (const cookie of (process.env.COOKIES ?? "").split(";").filter(Boolean)) {
  const [name, ...value] = cookie.split("=");
  await send("Network.setCookie", { name: name.trim(), value: value.join("="), url });
}
await send("Page.navigate", { url });
await sleep(Number(wait));
// Opcional: pulsar un elemento (CLICK = selector CSS) y esperar
for (const selector of (process.env.CLICK ?? "").split("||").filter(Boolean)) {
  const r = await send("Runtime.evaluate", { returnByValue: true, expression: `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return "no encontrado"; el.click(); return "ok"; })()` });
  console.error("click:", selector, r.result.result.value);
  await sleep(Number(process.env.CLICK_WAIT ?? 3500));
}
// Medidas de desbordamiento horizontal (contenido que no cabe en la pantalla)
const probe = await send("Runtime.evaluate", { returnByValue: true, expression: `(() => {
  const W = document.documentElement.clientWidth, wide = [];
  for (const el of document.querySelectorAll("body *")) { const r = el.getBoundingClientRect(); if (r.width && r.right > W + 1 && getComputedStyle(el).position !== "fixed") wide.push((el.tagName + "." + (el.className?.baseVal ?? el.className ?? "")).slice(0, 90) + " right=" + Math.round(r.right)); }
  return { W, scrollW: document.documentElement.scrollWidth, H: document.documentElement.scrollHeight, overflow: wide.slice(0, 8) };
})()` });
const info = probe.result.result.value;
let clip;
if (full === "1") clip = { x: 0, y: 0, width: Number(width), height: Math.min(info.H, 6000), scale: 1 };
const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: full === "1", ...(clip ? { clip } : {}) });
writeFileSync(out, Buffer.from(shot.result.data, "base64"));
console.log(JSON.stringify({ out, ...info }));
ws.close(); chrome.kill();
process.exit(0);
