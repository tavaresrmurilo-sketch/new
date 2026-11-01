/**
 * Gera src/components/intro/globe/land-mask.ts a partir do world-atlas (Natural Earth 1:50m).
 *
 * Rasteriza os países numa grade equiretangular de 0,5° (720 × 360) com três valores:
 *   0 = oceano · 1 = terra · 2 = Brasil
 * e codifica a grade em RLE compacto. O arquivo gerado é versionado — este script
 * só precisa rodar de novo se a resolução ou a fonte de dados mudar.
 *
 *   npm run globe:data
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { feature } from "topojson-client";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const topo = JSON.parse(readFileSync(resolve(root, "node_modules/world-atlas/countries-50m.json"), "utf8"));
const countries = feature(topo, topo.objects.countries).features;

const COLS = 720;
const ROWS = 360;
const STEP = 360 / COLS;
const grid = new Uint8Array(COLS * ROWS);

function polygonsOf(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  return [];
}

/**
 * Anéis que cruzam o antimeridiano (Rússia/Chukotka, Fiji) chegam "cortados" com saltos de 360°.
 * Desenrolamos a longitude para que o anel fique contínuo; as colunas são depois envolvidas (mod 360°).
 * Anéis polares (Antártida) já fecham pelo polo e são mantidos como estão.
 */
function unwrapRing(ring) {
  const out = [ring[0].slice()];
  let offset = 0;
  for (let i = 1; i < ring.length; i++) {
    const delta = ring[i][0] - ring[i - 1][0];
    if (delta > 180) offset -= 360;
    else if (delta < -180) offset += 360;
    out.push([ring[i][0] + offset, ring[i][1]]);
  }
  const closesNormally = Math.abs(out[out.length - 1][0] - out[0][0]) < 1;
  return closesNormally ? out : ring;
}

function rasterizePolygon(rawRings, value) {
  const rings = rawRings.map(unwrapRing);
  for (let row = 0; row < ROWS; row++) {
    const lat = 90 - (row + 0.5) * STEP;
    const xs = [];
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [x1, y1] = ring[j];
        const [x2, y2] = ring[i];
        if ((y1 > lat) !== (y2 > lat)) {
          xs.push(x1 + ((lat - y1) / (y2 - y1)) * (x2 - x1));
        }
      }
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.ceil((xs[k] + 180) / STEP - 0.5);
      const c1 = Math.floor((xs[k + 1] + 180) / STEP - 0.5);
      for (let c = c0; c <= c1; c++) {
        const idx = row * COLS + (((c % COLS) + COLS) % COLS);
        if (value === 2 || grid[idx] === 0) grid[idx] = value;
      }
    }
  }
}

for (const country of countries) {
  const isBrazil = country.id === "076";
  for (const rings of polygonsOf(country.geometry)) rasterizePolygon(rings, isBrazil ? 2 : 1);
}

// RLE: cada corrida vira "valor + comprimento" em base 32 de largura variável.
// Alfabeto de 64 símbolos seguros para string literal; o bit 5 indica "continua".
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
function encodeVarint(n, out) {
  do {
    let chunk = n & 31;
    n >>>= 5;
    if (n > 0) chunk |= 32;
    out.push(ALPHABET[chunk]);
  } while (n > 0);
}
const out = [];
let runs = 0;
for (let i = 0; i < grid.length; ) {
  const v = grid[i];
  let len = 1;
  while (i + len < grid.length && grid[i + len] === v) len++;
  encodeVarint(len * 3 + v, out);
  runs++;
  i += len;
}
const encoded = out.join("");

let land = 0;
let brazil = 0;
for (const v of grid) {
  if (v === 1) land++;
  if (v === 2) brazil++;
}

const file = `// Arquivo gerado por scripts/build-globe-data.mjs — não edite à mão.
// Fonte: Natural Earth 1:50m via world-atlas@2 (domínio público).
// Grade equiretangular ${COLS}×${ROWS} (passo de ${STEP}°), linhas de 90°N a 90°S, colunas de 180°W a 180°E.
// Valores: 0 = oceano, 1 = terra, 2 = Brasil. Codificação: RLE com varint base 32 (ver decodeLandMask).

export const MASK_COLS = ${COLS};
export const MASK_ROWS = ${ROWS};
export const MASK_RLE =
  "${encoded}";
`;
writeFileSync(resolve(root, "src/components/intro/globe/land-mask.ts"), file);
console.log({ runs, chars: encoded.length, land, brazil });

// pré-visualização ASCII (a cada 4 linhas/colunas)
if (process.argv.includes("--preview")) {
  for (let r = 0; r < ROWS; r += 6) {
    let line = "";
    for (let c = 0; c < COLS; c += 3) line += [" ", "·", "#"][grid[r * COLS + c]];
    console.log(line);
  }
}
