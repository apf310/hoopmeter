// Identidad de la app en un único sitio. El logo vive en components/layout/LogoMark.tsx y,
// para iconos de la PWA y de las apps nativas, en assets/logo.svg (`npm run icons`).
export const BRAND = {
  name: "Hoopmeter",
  lead: "Hoop", // Parte en blanco del logotipo
  accent: "meter", // Parte en naranja
  claim: "Qué partido ver, sin spoilers",
} as const;
