// Artes-fonte do app nativo (assets/*.png) a partir do símbolo SVG da marca.
// Depois: npx @capacitor/assets generate --iconBackgroundColor '#08080d' --splashBackgroundColor '#08080d'
import { readFile } from "node:fs/promises";
import sharp from "sharp";

const mark = await readFile(new URL("../public/icon.svg", import.meta.url));
const out = (name) => new URL(`../assets/${name}`, import.meta.url).pathname;
const bg = { r: 8, g: 8, b: 13, alpha: 1 };
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };

async function compose(size, scale, background, file) {
  const inner = Math.round(size * scale);
  const icon = await sharp(mark, { density: 1200 }).resize(inner, inner).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background } }).composite([{ input: icon, gravity: "center" }]).png().toFile(out(file));
}

await compose(1024, 0.7, bg, "icon-only.png"); // ícone completo (iOS e legado Android)
await compose(1024, 0.5, transparent, "icon-foreground.png"); // camada da frente do ícone adaptativo
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: bg } }).png().toFile(out("icon-background.png"));
await compose(2732, 0.18, bg, "splash.png");
await compose(2732, 0.18, bg, "splash-dark.png");
console.log("assets/ gerado");
