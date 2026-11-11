import type { CapacitorConfig } from "@capacitor/cli";
import { BRAND } from "./src/lib/brand";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Sin .env.local: la URL puede llegar por el entorno
}

// La web necesita servidor (rutas /api, claves privadas, componentes de servidor), así que no
// admite exportación estática: la app nativa carga la web desplegada en esta URL.
const url = process.env.CAPACITOR_SERVER_URL;

const config: CapacitorConfig = {
  appId: "com.hoopmeter.app", // No se puede cambiar tras publicar en las tiendas
  appName: BRAND.name,
  webDir: "native-shell",
  backgroundColor: "#020617",
  server: {
    url,
    cleartext: url?.startsWith("http://"), // Solo para probar contra el PC en la red local
    errorPath: "index.html",
  },
  plugins: {
    SystemBars: { insetsHandling: "native", style: "DARK" },
  },
};

export default config;
