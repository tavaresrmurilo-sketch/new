// Gera os ícones PNG do PWA a partir do símbolo SVG (node scripts/generate-icons.mjs).
import { readFile } from "node:fs/promises";
import sharp from "sharp";

const mark = await readFile(new URL("../public/icon.svg", import.meta.url));
const bg = { r: 8, g: 8, b: 13, alpha: 1 };

async function tile(size, scale, out, background = bg) {
  const inner = Math.round(size * scale);
  const icon = await sharp(mark, { density: 512 }).resize(inner, inner).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: icon, gravity: "center" }])
    .png()
    .toFile(new URL(`../public/icons/${out}`, import.meta.url).pathname);
}

await tile(192, 0.72, "icon-192.png");
await tile(512, 0.72, "icon-512.png");
await tile(512, 0.56, "icon-maskable-512.png");
await tile(180, 0.7, "apple-touch-icon.png");
await tile(96, 0.8, "badge-96.png", { r: 0, g: 0, b: 0, alpha: 0 });
console.log("ícones gerados em public/icons");
