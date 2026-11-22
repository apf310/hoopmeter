// robots.txt (Tarea 6.25): todo indexable salvo la API. Las imágenes de los enlaces (`opengraph-image`
// y `/og/compare`) quedan fuera de `/api/` para que X y WhatsApp puedan leerlas.
import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
