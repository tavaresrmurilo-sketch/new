/**
 * Gera os arquivos da marca em public/brand e os ícones do app.
 * A logo combina a letra C, uma chave e camadas horizontais de impressão 3D.
 *   npx tsx scripts/generate-brand.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import opentype from "opentype.js";
import sharp from "sharp";

const INK = "#0e0e13";
const ACCENT = "#5b3df5";
const WHITE = "#ffffff";

// ── símbolo (viewBox 40×40) ──
const cx = 15.5;
const cy = 20;
const r = 10.25;
const a = (46 * Math.PI) / 180;
const start = [cx + r * Math.cos(-a), cy + r * Math.sin(-a)];
const end = [cx + r * Math.cos(a), cy + r * Math.sin(a)];
const f = (n: number) => n.toFixed(2);

const markShapes = (color: string) => `
  <path d="M${f(start[0])} ${f(start[1])} A${r} ${r} 0 1 0 ${f(end[0])} ${f(end[1])}" fill="none" stroke="${color}" stroke-width="7.2"/>
  <path d="M15.5 16.9 H36.9 a1.675 1.675 0 0 1 0 3.35 H15.5 Z" fill="${color}"/>
  <rect x="27.6" y="20" width="3.2" height="4.55" fill="${color}"/>
  <rect x="32.8" y="20" width="3.2" height="3.4" fill="${color}"/>`;

/** Faixas horizontais: cada faixa é uma "camada" da impressão. */
const layersMask = (id: string) => {
  const bands: string[] = [];
  for (let y = 4; y < 38; y += 4.3) bands.push(`<rect x="0" y="${f(y)}" width="40" height="3.35" fill="#fff"/>`);
  return `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="40" height="40">${bands.join("")}</mask>`;
};

function markSvg(color: string, layered = true, size = 40) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 40 40" fill="none">
  ${layered ? `<defs>${layersMask("layers")}</defs><g mask="url(#layers)">${markShapes(color)}</g>` : markShapes(color)}
</svg>`;
}

// ── wordmark em vetor (Geist Bold + Geist Mono) ──
function loadFont(file: string) {
  const buffer = readFileSync(path.join(process.cwd(), "node_modules/geist/dist/fonts", file));
  return opentype.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
}
const sans = loadFont("geist-sans/Geist-Bold.ttf");
const mono = loadFont("geist-mono/GeistMono-Medium.ttf");

function logoSvg(ink: string, accent: string) {
  const word = sans.getPath("CHAVIX", 50, 29.5, 26, { letterSpacing: -0.02 });
  const wb = word.getBoundingBox();
  const tagX = wb.x2 + 7;
  const tag = mono.getPath("3D", tagX + 4.5, 26.2, 11.5);
  const tb = tag.getBoundingBox();
  const tagW = tb.x2 - tagX + 4.5;
  const width = Math.ceil(tagX + tagW + 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width * 2}" height="80" viewBox="0 0 ${width} 40" fill="none">
  <defs>${layersMask("layers")}</defs>
  <g mask="url(#layers)">${markShapes(accent)}</g>
  <path d="${word.toPathData(2)}" fill="${ink}"/>
  <rect x="${f(tagX)}" y="15.2" width="${f(tagW)}" height="14" rx="3.5" fill="none" stroke="${ink}" stroke-width="1.4"/>
  <path d="${tag.toPathData(2)}" fill="${ink}"/>
</svg>`;
}

function appIconSvg(size: number, layered = true) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 40 40">
  <rect width="40" height="40" rx="9" fill="${INK}"/>
  <g transform="translate(3.6 4) scale(0.8)">${layered ? `<defs>${layersMask("layers")}</defs><g mask="url(#layers)">${markShapes(ACCENT)}</g>` : markShapes(ACCENT)}</g>
</svg>`;
}

const brandDir = path.join(process.cwd(), "public/brand");
const appDir = path.join(process.cwd(), "src/app");
mkdirSync(brandDir, { recursive: true });

writeFileSync(path.join(brandDir, "chavix-mark.svg"), markSvg(ACCENT));
writeFileSync(path.join(brandDir, "chavix-mark-ink.svg"), markSvg(INK));
writeFileSync(path.join(brandDir, "chavix-logo.svg"), logoSvg(INK, ACCENT));
writeFileSync(path.join(brandDir, "chavix-logo-light.svg"), logoSvg(WHITE, "#8f7dff"));
// Favicon sem faixas: em 16–32 px as camadas viram ruído.
writeFileSync(path.join(appDir, "icon.svg"), appIconSvg(40, false));

(async () => {
  await sharp(Buffer.from(appIconSvg(180))).resize(180, 180).png().toFile(path.join(appDir, "apple-icon.png"));
  await sharp(Buffer.from(appIconSvg(512))).resize(512, 512).png().toFile(path.join(brandDir, "chavix-icon-512.png"));
  console.log("Marca gerada em public/brand e src/app/icon.svg");
})();
