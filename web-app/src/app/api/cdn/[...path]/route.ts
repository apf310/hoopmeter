// Proxy mínimo de cdn.nba.com: la CDN no envía cabeceras CORS y `html-to-image` necesita
// leer las fotos y logos desde nuestro propio dominio para incrustarlos en el PNG exportado.

const CDN_ORIGIN = "https://cdn.nba.com";
const ALLOWED_PREFIXES = ["headshots", "logos"];
const SAFE_SEGMENT = /^[\w.-]+$/;

export async function GET(_request: Request, ctx: RouteContext<"/api/cdn/[...path]">) {
  const { path } = await ctx.params;
  const valid =
    ALLOWED_PREFIXES.includes(path[0]) && path.every((segment) => SAFE_SEGMENT.test(segment) && segment !== "..");
  if (!valid) return new Response("Not found", { status: 404 });

  const upstream = await fetch(`${CDN_ORIGIN}/${path.join("/")}`);
  if (!upstream.ok || !upstream.body) return new Response(null, { status: upstream.status === 200 ? 502 : upstream.status });

  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
      "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
      // Los SVG servidos desde nuestro dominio no pueden ejecutar scripts
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
