// Imagen de la marca al compartir cualquier página sin imagen propia (Tarea 6.25).
import { BRAND } from "@/lib/brand";
import { brandLogo, Kicker, OG_CONTENT_TYPE, OgFrame, renderOgImage, Wordmark } from "@/lib/og-image";
import { OG_SIZE } from "@/lib/seo";

export const alt = `${BRAND.name}: ${BRAND.claim}`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

const FEATURES = [
  { label: "Sin spoilers", color: "#ef4444" },
  { label: "Nota 1-10", color: "#f59e0b" },
  { label: "GM Virtual", color: "#10b981" },
];

export default async function Image() {
  const logo = await brandLogo();
  return renderOgImage(
    <OgFrame logo={logo} footer={false}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 0 0 80px", width: 760 }}>
        <Kicker>La NBA en español</Kicker>
        <div style={{ display: "flex", marginTop: 18 }}>
          <Wordmark size={178} />
        </div>
        <div style={{ display: "flex", marginTop: 22, fontSize: 50, fontWeight: 600, color: "#e2e8f0" }}>{BRAND.claim}.</div>
        <div style={{ display: "flex", gap: 36, marginTop: 40 }}>
          {FEATURES.map((f) => (
            <div key={f.label} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 30, fontWeight: 800, letterSpacing: 3, textTransform: "uppercase", color: "#cbd5e1" }}>
              <div style={{ width: 7, height: 30, borderRadius: 4, background: f.color }} />
              {f.label}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", marginTop: 40, fontSize: 26, fontWeight: 800, letterSpacing: 6, textTransform: "uppercase", color: "#64748b" }}>
          hoopmeter.com
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", paddingRight: 40 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori solo entiende <img> */}
        <img src={logo} width={420} height={420} alt="" />
      </div>
    </OgFrame>
  );
}
