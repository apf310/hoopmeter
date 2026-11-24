// Patrones de las fichas 3D (Tarea 7.4) en `public/cards/*.svg`. Son máscaras: el color y el brillo los pone
// `components/players/player-card.css`. Dibujo propio y siempre igual (azar con semilla). Uso: npm run cards
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
const stroke = (d, width) => `<path d="${d}" fill="none" stroke="#000" stroke-width="${width}"/>`;

/** Curva cerrada en polares, con el centro detrás de la cabeza del jugador. */
function polar(radius, points = 72) {
  let d = "";
  for (let i = 0; i < points; i++) {
    const t = (i / points) * Math.PI * 2;
    const r = radius(t);
    d += `${i ? "L" : "M"}${round(50 + r * Math.cos(t))} ${round(52 + r * Math.sin(t))}`;
  }
  return `${d}Z`;
}

// Bueno: facetas de zafiro en tres grupos, que brillan en momentos distintos
{
  const cols = 7;
  const rows = 10;
  const grid = Array.from({ length: rows + 1 }, (_, y) =>
    Array.from({ length: cols + 1 }, (_, x) => {
      const jx = x === 0 || x === cols ? 0 : (random() - 0.5) * 10;
      const jy = y === 0 || y === rows ? 0 : (random() - 0.5) * 10;
      return [round((x * 100) / cols + jx), round((y * 140) / rows + jy)];
    })
  );
  const groups = ["", "", ""];
  let edges = "";
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const [a, b, c, d] = [grid[y][x], grid[y][x + 1], grid[y + 1][x + 1], grid[y + 1][x]];
      for (const triangle of random() < 0.5 ? [[a, b, c], [a, c, d]] : [[a, b, d], [b, c, d]]) {
        const path = triangle.map((p) => p.join(" ")).join("L");
        groups[Math.floor(random() * 3)] += `<path d="M${path}Z" fill-opacity="${(0.18 + random() * 0.82).toFixed(2)}"/>`;
      }
      edges += `M${a.join(" ")}L${b.join(" ")}M${a.join(" ")}L${d.join(" ")}`;
    }
  }
  write("facets-a", groups[0]);
  write("facets-b", groups[1]);
  write("facets-c", groups[2] + stroke(edges, 0.35));
}

// Notable: ondas
{
  const groups = ["", ""];
  for (let i = 0; i < 26; i++) {
    const base = 8 + i * 4.1;
    groups[i % 2] += polar((t) => base * (1 + 0.055 * Math.sin(5 * t + i * 0.42) + 0.03 * Math.sin(9 * t - i * 0.3)));
  }
  write("waves-a", stroke(groups[0], 2.1));
  write("waves-b", stroke(groups[1], 1.5));
}

// Leyenda: guilloché, el grabado de los billetes
{
  const rings = [
    [19, 4.5, 10],
    [32, 6, 16],
    [47, 7, 22],
    [63, 8, 28],
    [80, 8, 34],
  ];
  const groups = ["", ""];
  rings.forEach(([base, amplitude, lobes], i) => {
    for (let phase = 0; phase < 6; phase++) groups[i % 2] += polar((t) => base + amplitude * Math.sin(lobes * t + (phase * Math.PI) / 3), lobes * 9);
  });
  write("guilloche-a", stroke(groups[0], 0.42));
  write("guilloche-b", stroke(groups[1], 0.42));
}

// Élite: rayos, red de canasta y destellos
{
  const groups = ["", "", ""];
  const count = 54;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const half = ((0.25 + random() * 0.75) * Math.PI) / count;
    const edge = (q) => `${round(50 + 160 * Math.cos(q))} ${round(52 + 160 * Math.sin(q))}`;
    groups[i % 3] += `<path d="M50 52L${edge(angle - half)}L${edge(angle + half)}Z" fill-opacity="${(0.25 + random() * 0.6).toFixed(2)}"/>`;
  }
  ["a", "b", "c"].forEach((name, i) => write(`rays-${name}`, groups[i]));

  let net = "";
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const [left, top] = [x * 12.5, y * 17.5];
      net += `M${left} ${top}q2 6.4 6.25 8.75q4.25-2.4 6.25-8.75M${left} ${top + 17.5}q2-6.4 6.25-8.75q4.25 2.4 6.25 8.75`;
    }
  }
  write("net", stroke(net, 0.8));

  let sparks = "";
  for (let i = 0; i < 60; i++) {
    const [x, y, s] = [round(random() * 100), round(random() * 140), round(0.5 + random() * 1.5)];
    const k = s * 0.22;
    const points = [[0, -s], [k, -k], [s, 0], [k, k], [0, s], [-k, k], [-s, 0], [-k, -k]];
    sparks += `M${points.map(([dx, dy]) => `${round(x + dx)} ${round(y + dy)}`).join("L")}Z`;
  }
  write("sparks", `<path d="${sparks}"/>`);
}

// Resto: parquet de arce (es una imagen, no una máscara) y la zona pintada
{
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
