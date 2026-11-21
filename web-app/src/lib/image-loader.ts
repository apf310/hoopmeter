// Loader propio de `next/image` (Tarea 6.17): nada pasa por la optimización de Vercel, cuyo cupo del plan
// Hobby se agota y responde 402. Las fotos de la CDN de la NBA ya existen en tres tamaños: se pide el más
// pequeño que cubra el ancho que necesita el navegador. Lo demás (logos SVG locales) se sirve tal cual.

type LoaderProps = { src: string; width: number; quality?: number };

const HEADSHOT = /^https:\/\/cdn\.nba\.com\/headshots\/nba\/latest\/\d+x\d+\/(\d+)\.png$/;

/** Tamaños publicados por la CDN (2080x1520 y menores de 260 no existen: 403). */
export const HEADSHOT_SIZES = [
  [260, 190],
  [520, 380],
  [1040, 760],
] as const;

export default function imageLoader({ src, width }: LoaderProps): string {
  const match = HEADSHOT.exec(src);
  if (!match) return src;
  const [w, h] = HEADSHOT_SIZES.find(([size]) => size >= width) ?? HEADSHOT_SIZES[HEADSHOT_SIZES.length - 1];
  return `https://cdn.nba.com/headshots/nba/latest/${w}x${h}/${match[1]}.png`;
}
