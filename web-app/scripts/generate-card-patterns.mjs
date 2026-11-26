// Patrones fijos de las fichas 3D (Tarea 7.4) en `public/cards/*.svg`. Son máscaras: el color y el brillo los pone
// `components/players/player-card.css`. Dibujo propio y siempre igual (azar con semilla). Uso: npm run cards
// Desde la Tarea 7.11 el dibujo principal de cada carta es su huella (lib/card-huella.ts), que sale de sus atributos.
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = new URL("../public/cards/", import.meta.url);
mkdirSync(OUT, { recursive: true });

let seed = 7;
const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const round = (n) => +n.toFixed(1);
const write = (name, body) =>
  writeFileSync(
    new URL(`${name}.svg`, OUT),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 140" preserveAspectRatio="none">${body}</svg>\n`
  );

// Élite: rayos y destellos (la red de cada carta es su huella, Tarea 7.11: lib/card-huella.ts)
{
  seed = 7;
  const groups = ["", "", ""];
  const count = 54;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const half = ((0.25 + random() * 0.75) * Math.PI) / count;
    const edge = (q) => `${round(50 + 160 * Math.cos(q))} ${round(52 + 160 * Math.sin(q))}`;
    groups[i % 3] += `<path d="M50 52L${edge(angle - half)}L${edge(angle + half)}Z" fill-opacity="${(0.25 + random() * 0.6).toFixed(2)}"/>`;
  }
  ["a", "b", "c"].forEach((name, i) => write(`rays-${name}`, groups[i]));

  let sparks = "";
  for (let i = 0; i < 60; i++) {
    const [x, y, s] = [round(random() * 100), round(random() * 140), round(0.5 + random() * 1.5)];
    const k = s * 0.22;
    const points = [[0, -s], [k, -k], [s, 0], [k, k], [0, s], [-k, k], [-s, 0], [-k, -k]];
    sparks += `M${points.map(([dx, dy]) => `${round(x + dx)} ${round(y + dy)}`).join("L")}Z`;
  }
  write("sparks", `<path d="${sparks}"/>`);
}

// Resto: parquet de arce (es una imagen, no una máscara) y la zona pintada de quien aún no tiene atributos
{
  seed = 11;
  const woods = ["#d9a566", "#cf9857", "#e0b077", "#c98f4e", "#d6a05f", "#e6b983"];
  let planks = '<rect width="100" height="140" fill="#d4a062"/>';
  for (let x = 0; x < 14; x++) {
    let y = -random() * 40;
    while (y < 140) {
      const height = 26 + random() * 38;
      const fill = woods[Math.floor(random() * woods.length)];
      planks += `<rect x="${round(x * 7.15)}" y="${round(y)}" width="7" height="${round(height - 0.35)}" fill="${fill}"/>`;
      for (let grain = 0; grain < 2; grain++) {
        planks += `<path d="M${round(x * 7.15 + 1 + random() * 5)} ${round(y)}v${round(height)}" stroke="#8a5a22" stroke-opacity=".14" stroke-width=".25"/>`;
      }
      y += height;
    }
  }
  write("parquet", planks);
  write(
    "key",
    '<path d="M26 62H74V140H26Z"/><g fill="none" stroke="#000" stroke-width="1.5"><circle cx="50" cy="62" r="24"/><path d="M-6 140V96A58 66 0 0 1 106 96V140"/></g>'
  );
}

console.log("Patrones de las fichas en public/cards/");
