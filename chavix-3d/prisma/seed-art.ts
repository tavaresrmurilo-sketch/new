/**
 * Arte original dos produtos de demonstração, desenhada em SVG e rasterizada com sharp.
 * Cada chaveiro é "impresso" em pilhas de camadas (as linhas laterais imitam a
 * altura de camada de uma impressora FDM). Nenhuma imagem de terceiros é usada.
 * Texto é convertido em vetor com a fonte Geist, então não depende de fontes do sistema.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import opentype from "opentype.js";
import sharp from "sharp";

const SIZE = 1200;
const C = SIZE / 2;

// ───────────── cores ─────────────

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex([r, g, b]: number[]): string {
  return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;
}
function mix(hex: string, target: string, amount: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(target);
  return rgbToHex(a.map((v, i) => v + (b[i] - v) * amount));
}
const darken = (hex: string, amount: number) => mix(hex, "#000000", amount);

// ───────────── texto em vetor ─────────────

const fonts = new Map<string, opentype.Font>();
function font(weight: "Black" | "Bold" | "SemiBold"): opentype.Font {
  if (!fonts.has(weight)) {
    const file = path.join(process.cwd(), "node_modules/geist/dist/fonts/geist-sans", `Geist-${weight}.ttf`);
    const buffer = readFileSync(file);
    fonts.set(weight, opentype.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)));
  }
  return fonts.get(weight)!;
}

/** Caminho SVG de um texto, centralizado em (cx, cy) e limitado a maxWidth. */
function textPath(text: string, cx: number, cy: number, size: number, maxWidth: number, weight: "Black" | "Bold" = "Black"): string {
  const f = font(weight);
  let fontSize = size;
  let box = f.getPath(text, 0, 0, fontSize).getBoundingBox();
  if (box.x2 - box.x1 > maxWidth) {
    fontSize = (fontSize * maxWidth) / (box.x2 - box.x1);
    box = f.getPath(text, 0, 0, fontSize).getBoundingBox();
  }
  const x = cx - (box.x1 + box.x2) / 2;
  const y = cy - (box.y1 + box.y2) / 2;
  return `<path d="${f.getPath(text, x, y, fontSize).toPathData(1)}" fill="currentColor"/>`;
}

// ───────────── formas ─────────────

export interface ShapeSpec {
  /** Silhueta (elementos com fill/stroke = currentColor) */
  base: string;
  /** Relevo sobre a face superior */
  relief?: string;
  holes: Array<{ x: number; y: number; r: number; ringAngle: number }>;
}

function hexPoints(cx: number, cy: number, r: number, flat = true): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = ((flat ? 0 : 30) + i * 60) * (Math.PI / 180);
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
}

const HEART = (cx: number, cy: number, s: number) =>
  `M ${cx} ${cy + s * 0.9} C ${cx - s * 1.25} ${cy + s * 0.05}, ${cx - s * 1.05} ${cy - s * 0.95}, ${cx} ${cy - s * 0.42} C ${cx + s * 1.05} ${cy - s * 0.95}, ${cx + s * 1.25} ${cy + s * 0.05}, ${cx} ${cy + s * 0.9} Z`;

export const SHAPES: Record<string, (text?: string) => ShapeSpec> = {
  hexa: () => ({
    base: `<polygon points="${hexPoints(C, 620, 260)}" fill="currentColor"/>`,
    relief:
      `<polygon points="${hexPoints(C, 620, 218)} ${hexPoints(C, 620, 196)}" fill="currentColor" fill-rule="evenodd"/>` +
      [
        [C - 44, 660],
        [C + 44, 660],
        [C, 584],
      ]
        .map(([x, y]) => `<polygon points="${hexPoints(x, y, 40)}" fill="currentColor"/>`)
        .join(""),
    holes: [{ x: C, y: 452, r: 26, ringAngle: -90 }],
  }),

  tag: (text = "LUCAS") => ({
    base: `<rect x="290" y="485" width="620" height="250" rx="72" fill="currentColor"/>`,
    relief: textPath(text, 648, 610, 150, 420),
    holes: [{ x: 362, y: 610, r: 28, ringAngle: 180 }],
  }),

  gamepad: () => ({
    base:
      `<rect x="320" y="505" width="560" height="220" rx="110" fill="currentColor"/>` +
      `<circle cx="405" cy="690" r="112" fill="currentColor"/><circle cx="795" cy="690" r="112" fill="currentColor"/>`,
    relief:
      `<rect x="370" y="618" width="120" height="38" rx="9" fill="currentColor"/>` +
      `<rect x="411" y="577" width="38" height="120" rx="9" fill="currentColor"/>` +
      `<circle cx="770" cy="660" r="29" fill="currentColor"/><circle cx="838" cy="604" r="29" fill="currentColor"/>` +
      `<rect x="556" y="648" width="40" height="15" rx="7.5" fill="currentColor"/><rect x="608" y="648" width="40" height="15" rx="7.5" fill="currentColor"/>`,
    holes: [{ x: C, y: 560, r: 24, ringAngle: -90 }],
  }),

  d20: () => {
    const outer = Array.from({ length: 6 }, (_, i) => {
      const a = (-90 + i * 60) * (Math.PI / 180);
      return [C + 262 * Math.cos(a), 625 + 262 * Math.sin(a)];
    });
    const tri = [
      [C, 505],
      [C + 128, 718],
      [C - 128, 718],
    ];
    const lines = [
      [tri[0], outer[0]],
      [tri[0], outer[1]],
      [tri[0], outer[5]],
      [tri[1], outer[1]],
      [tri[1], outer[2]],
      [tri[1], outer[3]],
      [tri[2], outer[3]],
      [tri[2], outer[4]],
      [tri[2], outer[5]],
    ];
    return {
      base: `<polygon points="${outer.map((p) => p.join(",")).join(" ")}" fill="currentColor" stroke="currentColor" stroke-width="24" stroke-linejoin="round"/>`,
      relief:
        `<polygon points="${tri.map((p) => p.join(",")).join(" ")}" fill="none" stroke="currentColor" stroke-width="13" stroke-linejoin="round"/>` +
        lines.map(([a, b]) => `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="currentColor" stroke-width="11" stroke-linecap="round"/>`).join("") +
        textPath("20", C, 650, 92, 120),
      holes: [{ x: C, y: 410, r: 22, ringAngle: -90 }],
    };
  },

  clapper: () => ({
    base:
      `<rect x="330" y="560" width="540" height="270" rx="30" fill="currentColor"/>` +
      `<g transform="rotate(-11 330 548)"><rect x="330" y="470" width="540" height="78" rx="16" fill="currentColor"/></g>`,
    relief:
      `<g transform="rotate(-11 330 548)">` +
      [0, 1, 2, 3, 4].map((i) => `<polygon points="${380 + i * 100},482 ${430 + i * 100},482 ${400 + i * 100},536 ${350 + i * 100},536" fill="currentColor"/>`).join("") +
      `</g>` +
      `<rect x="380" y="640" width="200" height="18" rx="9" fill="currentColor"/>` +
      `<rect x="380" y="690" width="300" height="18" rx="9" fill="currentColor"/>` +
      `<rect x="380" y="740" width="150" height="18" rx="9" fill="currentColor"/>`,
    holes: [{ x: 812, y: 790, r: 22, ringAngle: 30 }],
  }),

  car: () => ({
    base:
      `<path d="M300 700 L300 655 Q302 622 345 612 L468 596 Q522 540 590 528 L708 526 Q772 532 812 588 L868 600 Q902 610 902 644 L902 700 Q902 716 886 716 L316 716 Q300 716 300 700 Z" fill="currentColor"/>` +
      `<circle cx="420" cy="716" r="62" fill="currentColor"/><circle cx="782" cy="716" r="62" fill="currentColor"/>`,
    relief:
      `<path d="M496 600 Q540 556 596 548 L640 548 L640 600 Z" fill="currentColor"/>` +
      `<path d="M662 548 L704 548 Q748 552 776 600 L662 600 Z" fill="currentColor"/>` +
      `<circle cx="420" cy="716" r="30" fill="currentColor"/><circle cx="782" cy="716" r="30" fill="currentColor"/>` +
      `<rect x="846" y="628" width="36" height="14" rx="7" fill="currentColor"/>`,
    holes: [{ x: 350, y: 652, r: 18, ringAngle: 200 }],
  }),

  ball: () => ({
    base: `<circle cx="${C}" cy="630" r="240" fill="currentColor"/><circle cx="${C}" cy="372" r="50" fill="currentColor"/>`,
    relief:
      `<g fill="none" stroke="currentColor" stroke-width="15" stroke-linecap="round">` +
      `<line x1="${C}" y1="398" x2="${C}" y2="862"/>` +
      `<line x1="368" y1="630" x2="832" y2="630"/>` +
      `<path d="M430 462 Q520 630 430 798"/><path d="M770 462 Q680 630 770 798"/></g>`,
    holes: [{ x: C, y: 368, r: 21, ringAngle: -90 }],
  }),

  paw: () => ({
    base: `<circle cx="${C}" cy="620" r="258" fill="currentColor"/>`,
    relief:
      `<ellipse cx="${C}" cy="700" rx="128" ry="104" fill="currentColor"/>` +
      `<ellipse cx="452" cy="560" rx="48" ry="62" transform="rotate(-22 452 560)" fill="currentColor"/>` +
      `<ellipse cx="548" cy="500" rx="50" ry="66" transform="rotate(-6 548 500)" fill="currentColor"/>` +
      `<ellipse cx="652" cy="500" rx="50" ry="66" transform="rotate(6 652 500)" fill="currentColor"/>` +
      `<ellipse cx="748" cy="560" rx="48" ry="62" transform="rotate(22 748 560)" fill="currentColor"/>`,
    holes: [{ x: C, y: 404, r: 22, ringAngle: -90 }],
  }),

  halves: (text = "A L") => {
    const [left, right] = text.split(" ");
    const curve = "C 540 470 660 540 600 630 C 540 720 660 790 600 910";
    return {
      base:
        `<defs><clipPath id="hl"><path d="M200 300 L600 330 ${curve} L200 910 Z"/></clipPath><clipPath id="hr"><path d="M1000 300 L600 330 ${curve} L1000 910 Z"/></clipPath></defs>` +
        `<g transform="translate(-24 0)"><path d="${HEART(C, 640, 270)}" clip-path="url(#hl)" fill="currentColor"/></g>` +
        `<g transform="translate(24 10)"><path d="${HEART(C, 640, 270)}" clip-path="url(#hr)" fill="currentColor"/></g>`,
      relief: textPath(left ?? "A", 462, 612, 150, 140) + `<g transform="translate(24 10)">${textPath(right ?? "L", 714, 600, 150, 140)}</g>`,
      holes: [
        { x: 452, y: 470, r: 20, ringAngle: -120 },
        { x: 772, y: 480, r: 20, ringAngle: -60 },
      ],
    };
  },

  initial: (text = "M") => ({
    base: textPath(text, C, 650, 620, 560) + `<circle cx="332" cy="360" r="54" fill="currentColor"/>`,
    holes: [{ x: 332, y: 360, r: 22, ringAngle: -135 }],
  }),

  wave: () => ({
    base: `<circle cx="${C}" cy="630" r="244" fill="currentColor"/>`,
    relief:
      `<defs><clipPath id="wc"><circle cx="${C}" cy="630" r="206"/></clipPath></defs>` +
      `<g clip-path="url(#wc)" fill="none" stroke="currentColor" stroke-width="17" stroke-linecap="round">` +
      [560, 630, 700]
        .map((y) => `<path d="M340 ${y} Q405 ${y - 44} 470 ${y} T600 ${y} T730 ${y} T860 ${y}"/>`)
        .join("") +
      `</g>`,
    holes: [{ x: C, y: 432, r: 22, ringAngle: -90 }],
  }),

  peak: () => ({
    base: `<polygon points="330,800 520,468 604,586 690,476 870,800" fill="currentColor" stroke="currentColor" stroke-width="44" stroke-linejoin="round"/>`,
    relief:
      `<polygon points="520,468 566,548 544,536 522,560 498,532 474,546" fill="currentColor" stroke="currentColor" stroke-width="10" stroke-linejoin="round"/>` +
      `<polygon points="690,476 740,566 716,552 692,574 668,550 646,562" fill="currentColor" stroke="currentColor" stroke-width="10" stroke-linejoin="round"/>` +
      `<path d="M420 780 Q520 700 600 730 T780 700" fill="none" stroke="currentColor" stroke-width="12" stroke-linecap="round" stroke-dasharray="1 30"/>`,
    holes: [{ x: 520, y: 540, r: 20, ringAngle: -110 }],
  }),

  pixelHeart: () => {
    const rows = ["..XXX.XXX..", ".XXXXXXXXX.", "XXXXXXXXXXX", "XXXXXXXXXXX", "XXXXXXXXXXX", ".XXXXXXXXX.", "..XXXXXXX..", "...XXXXX...", "....XXX....", ".....X....."];
    const cell = 46;
    const x0 = C - (11 * cell) / 2;
    const y0 = 400;
    const squares: string[] = [];
    rows.forEach((row, r) =>
      [...row].forEach((ch, c) => {
        if (ch === "X") squares.push(`<rect x="${x0 + c * cell}" y="${y0 + r * cell}" width="${cell + 0.6}" height="${cell + 0.6}" fill="currentColor"/>`);
      }),
    );
    const shine = [
      [2, 1],
      [1, 2],
      [2, 2],
      [1, 3],
    ]
      .map(([c, r]) => `<rect x="${x0 + c * cell + 6}" y="${y0 + r * cell + 6}" width="${cell - 12}" height="${cell - 12}" rx="4" fill="currentColor"/>`)
      .join("");
    return { base: squares.join(""), relief: shine, holes: [{ x: C, y: y0 + 1.5 * cell, r: 17, ringAngle: -90 }] };
  },
};

// ───────────── renderização ─────────────

export interface RenderOptions {
  shape: ShapeSpec;
  color: string;
  reliefColor: string;
  backdrop: "studio" | "bed";
  rotate?: number;
}

function rotatePoint(x: number, y: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  const dx = x - C;
  const dy = y - C;
  return [C + dx * Math.cos(a) - dy * Math.sin(a), C + dx * Math.sin(a) + dy * Math.cos(a)];
}

export function keychainSvg({ shape, color, reliefColor, backdrop, rotate = -7 }: RenderOptions): string {
  const depth = 30;
  const layer = 3;
  const sideA = darken(color, 0.3);
  const sideB = darken(color, 0.38);
  const reliefSideA = darken(reliefColor, 0.28);
  const reliefSideB = darken(reliefColor, 0.36);
  const bg = backdrop === "studio" ? "#e9e9ed" : "#1c1c22";

  const layers: string[] = [];
  for (let i = depth; i >= 1; i--) {
    const tone = Math.floor(i / layer) % 2 === 0 ? sideA : sideB;
    layers.push(`<use href="#base" color="${tone}" transform="translate(0 ${i})"/>`);
  }
  const reliefLayers: string[] = [];
  if (shape.relief) {
    for (let i = 9; i >= 1; i--) {
      const tone = Math.floor(i / layer) % 2 === 0 ? reliefSideA : reliefSideB;
      reliefLayers.push(`<use href="#relief" color="${tone}" transform="translate(0 ${i})"/>`);
    }
  }

  const holes = shape.holes.map((h) => {
    const [x, y] = rotatePoint(h.x, h.y, rotate);
    return { ...h, x, y };
  });

  const holeMarkup = holes
    .map(
      (h, i) => `
    <clipPath id="hole${i}"><circle cx="${h.x}" cy="${h.y}" r="${h.r}"/></clipPath>
    <g clip-path="url(#hole${i})">
      <rect x="${h.x - h.r}" y="${h.y - h.r}" width="${h.r * 2}" height="${h.r * 2}" fill="${darken(color, 0.45)}"/>
      <circle cx="${h.x}" cy="${h.y + depth * 0.9}" r="${h.r}" fill="${bg}"/>
    </g>`,
    )
    .join("");

  const ringMarkup = holes
    .map((h) => {
      const R = 84;
      const a = ((h.ringAngle + rotate) * Math.PI) / 180;
      const cx = h.x + Math.cos(a) * (R - h.r * 0.35);
      const cy = h.y + Math.sin(a) * (R - h.r * 0.35);
      return `
    <circle cx="${cx + 8}" cy="${cy + 14}" r="${R}" fill="none" stroke="#000" stroke-opacity="${backdrop === "studio" ? 0.16 : 0.4}" stroke-width="11" filter="url(#soft)"/>
    <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="url(#metal)" stroke-width="10"/>
    <circle cx="${cx}" cy="${cy}" r="${R - 7}" fill="none" stroke="url(#metal2)" stroke-width="5"/>
    <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#ffffff" stroke-opacity=".55" stroke-width="2" stroke-dasharray="40 480" transform="rotate(-140 ${cx} ${cy})"/>`;
    })
    .join("");

  const backdropMarkup =
    backdrop === "studio"
      ? `<rect width="${SIZE}" height="${SIZE}" fill="url(#studio)"/><ellipse cx="${C}" cy="420" rx="620" ry="420" fill="#ffffff" opacity=".45" filter="url(#wide)"/>`
      : `<rect width="${SIZE}" height="${SIZE}" fill="#1c1c22"/><rect width="${SIZE}" height="${SIZE}" fill="url(#pei)"/>` +
        `<ellipse cx="${C}" cy="520" rx="560" ry="420" fill="#ffffff" opacity=".06" filter="url(#wide)"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <linearGradient id="studio" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f4f4f6"/><stop offset="1" stop-color="#dcdce2"/>
    </linearGradient>
    <pattern id="pei" width="7" height="7" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1.1" fill="#ffffff" opacity=".05"/><circle cx="5.5" cy="5" r=".9" fill="#000000" opacity=".25"/>
    </pattern>
    <pattern id="infill" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="14" height="7" fill="#ffffff" opacity=".045"/>
    </pattern>
    <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity=".26"/><stop offset=".45" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity=".14"/>
    </linearGradient>
    <linearGradient id="metal" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f7f7f9"/><stop offset=".35" stop-color="#a3a3ad"/><stop offset=".6" stop-color="#e6e6ea"/><stop offset="1" stop-color="#6f6f79"/>
    </linearGradient>
    <linearGradient id="metal2" x1="1" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#d4d4da"/><stop offset=".5" stop-color="#7c7c86"/><stop offset="1" stop-color="#c9c9cf"/>
    </linearGradient>
    <filter id="blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="16"/></filter>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>
    <filter id="wide" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="80"/></filter>
    <g id="base" transform="rotate(${rotate} ${C} ${C})">${shape.base}</g>
    <g id="relief" transform="rotate(${rotate} ${C} ${C})">${shape.relief ?? ""}</g>
    <mask id="baseMask"><use href="#base" color="#ffffff"/></mask>
    <mask id="reliefMask"><use href="#relief" color="#ffffff"/></mask>
  </defs>
  ${backdropMarkup}
  <g transform="translate(${C} ${C + 20}) scale(1.24) translate(${-C} ${-C})">
  <use href="#base" color="#000000" opacity="${backdrop === "studio" ? 0.2 : 0.55}" transform="translate(22 ${depth + 30})" filter="url(#blur)"/>
  ${layers.join("\n  ")}
  <use href="#base" color="${color}"/>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#infill)" mask="url(#baseMask)"/>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#sheen)" mask="url(#baseMask)"/>
  ${reliefLayers.join("\n  ")}
  ${shape.relief ? `<use href="#relief" color="${reliefColor}"/><rect width="${SIZE}" height="${SIZE}" fill="url(#sheen)" opacity=".7" mask="url(#reliefMask)"/>` : ""}
  ${holeMarkup}
  ${ringMarkup}
  </g>
</svg>`;
}

export async function renderKeychainPng(options: RenderOptions): Promise<Buffer> {
  return sharp(Buffer.from(keychainSvg(options))).png().toBuffer();
}
