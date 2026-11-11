// Genera todos los iconos a partir de assets/logo.svg. Al cambiar el logo: `npm run icons`.
import sharp from "sharp";

const BACKGROUND = "#020617";
const LOGO = "assets/logo.svg";

const logo = (size) => sharp(LOGO, { density: 300 }).resize(size, size).png().toBuffer();

async function icon(size, output) {
  await sharp({ create: { width: size, height: size, channels: 4, background: BACKGROUND } })
    .composite([{ input: await logo(size) }])
    .png()
    .toFile(output);
}

await Promise.all([
  icon(192, "public/icons/icon-192.png"),
  icon(512, "public/icons/icon-512.png"),
  icon(180, "src/app/apple-icon.png"),
  // Entrada de @capacitor/assets, que produce los iconos y splash de Android e iOS
  logo(1024).then((buffer) => sharp(buffer).toFile("assets/logo.png")),
]);
