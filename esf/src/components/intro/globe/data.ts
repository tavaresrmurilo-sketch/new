import { MASK_COLS, MASK_ROWS, MASK_RLE } from "./land-mask";
import { BORDERS_Q, BORDERS_RLE } from "./borders";
import { DOOR_H, DOOR_W, DOOR_Z, FLOOR, VIEW_LAT, VIEW_LON, heroPath } from "./scene";
import { introGlyphShapes, logoShape, rng, sampleShape, sampleShapeWithFlags } from "@/lib/shapes";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const DEG = Math.PI / 180;

/** Brasília — sede institucional da ESF (origem do caminho de luz). */
export const BRASILIA = { lat: VIEW_LAT, lon: VIEW_LON } as const;

let lookup: Int8Array | null = null;
function varints(src: string): number[] {
  if (!lookup) {
    lookup = new Int8Array(128).fill(-1);
    for (let i = 0; i < ALPHABET.length; i++) lookup[ALPHABET.charCodeAt(i)] = i;
  }
  const out: number[] = [];
  let value = 0;
  let shift = 0;
  for (let i = 0; i < src.length; i++) {
    const chunk = lookup[src.charCodeAt(i)];
    value |= (chunk & 31) << shift;
    if (chunk & 32) {
      shift += 5;
      continue;
    }
    out.push(value);
    value = 0;
    shift = 0;
  }
  return out;
}

let decoded: Uint8Array | null = null;

/** Decodifica a grade terra/Brasil (0 oceano, 1 terra, 2 Brasil). */
export function decodeMask(): Uint8Array {
  if (decoded) return decoded;
  const grid = new Uint8Array(MASK_COLS * MASK_ROWS);
  let pos = 0;
  for (const value of varints(MASK_RLE)) {
    const kind = value % 3;
    const len = (value - kind) / 3;
    if (kind) grid.fill(kind, pos, pos + len);
    pos += len;
  }
  decoded = grid;
  return grid;
}

function sampleMask(grid: Uint8Array, latDeg: number, lonDeg: number): number {
  const row = Math.min(MASK_ROWS - 1, Math.max(0, Math.floor((90 - latDeg) / (180 / MASK_ROWS))));
  let lon = lonDeg;
  while (lon < -180) lon += 360;
  while (lon >= 180) lon -= 360;
  const col = Math.min(MASK_COLS - 1, Math.max(0, Math.floor((lon + 180) / (360 / MASK_COLS))));
  return grid[row * MASK_COLS + col];
}

const wrapPi = (a: number) => {
  let x = (a + Math.PI) % (2 * Math.PI);
  if (x < 0) x += 2 * Math.PI;
  return x - Math.PI;
};

/** Posição no mapa (mundo) com o centro de vista final em Brasília. */
export function mapPos(latDeg: number, lonDeg: number): [number, number, number] {
  return [wrapPi((lonDeg - VIEW_LON) * DEG), 0, -(latDeg - VIEW_LAT) * DEG];
}

/* ------------------------------------------------------------------ */
/* Pontos de terra                                                     */
/* ------------------------------------------------------------------ */

export interface DotData {
  count: number;
  /** (lat, lon) em radianos */
  ll: Float32Array;
  /** destino no campo de luz da cena 3: (x, z) */
  floor: Float32Array;
  /** (semente, 1 se Brasil) */
  info: Float32Array;
  landLL: [number, number][];
}

/**
 * Pontos de terra numa malha de latitudes regulares (o "mapa pontilhado"),
 * mais o destino de cada ponto no campo de luz — atribuído de forma coerente
 * (pontos ao norte vão para longe, ao sul ficam perto) para que a reorganização flua.
 */
export function buildDots(stepDeg: number): DotData {
  const grid = decodeMask();
  const rand = rng(7);
  const ll: number[] = [];
  const info: number[] = [];
  const landLL: [number, number][] = [];
  let row = 0;
  for (let lat = 83; lat >= -84; lat -= stepDeg, row++) {
    const n = Math.max(1, Math.round((360 * Math.cos(lat * DEG)) / stepDeg));
    const offset = row % 2 ? 0.5 : 0;
    for (let j = 0; j < n; j++) {
      const lon = -180 + ((j + offset) * 360) / n;
      const v = sampleMask(grid, lat, lon);
      if (!v) continue;
      ll.push(lat * DEG, lon * DEG);
      info.push(rand(), v === 2 ? 1 : 0);
      landLL.push([lat, lon]);
    }
  }
  const count = ll.length / 2;

  // malha hexagonal do campo de luz, da frente (perto da câmera) para o fundo
  const width = FLOOR.x1 - FLOOR.x0;
  const depth = FLOOR.z0 - FLOOR.z1;
  const s = Math.sqrt((width * depth) / count);
  const rows: [number, number][][] = [];
  let total = 0;
  for (let r = 0; total < count; r++) {
    const z = FLOOR.z0 - r * s * 0.866;
    const line: [number, number][] = [];
    for (let x = FLOOR.x0 + (r % 2 ? s / 2 : 0); x <= FLOOR.x1; x += s) line.push([x, z]);
    rows.push(line);
    total += line.length;
  }
  rows.reverse(); // do mais distante (norte) ao mais próximo (sul)

  // pontos ordenados do norte para o sul, pareados linha a linha e, dentro da linha, de oeste para leste
  const order = Array.from({ length: count }, (_, i) => i);
  const mz = (i: number) => -(landLL[i][0] - VIEW_LAT);
  const mx = (i: number) => wrapPi((landLL[i][1] - VIEW_LON) * DEG);
  order.sort((a, b) => mz(a) - mz(b));
  const floor = new Float32Array(count * 2);
  let cursor = 0;
  const skip = total - count; // linhas mais distantes ficam incompletas
  let skipped = 0;
  for (const line of rows) {
    let cells = line;
    if (skipped < skip) {
      const drop = Math.min(skip - skipped, line.length);
      cells = line.slice(drop);
      skipped += drop;
    }
    if (!cells.length) continue;
    const chunk = order.slice(cursor, cursor + cells.length).sort((a, b) => mx(a) - mx(b));
    chunk.forEach((dot, k) => floor.set(cells[k], dot * 2));
    cursor += cells.length;
  }

  return { count, ll: new Float32Array(ll), floor, info: new Float32Array(info), landLL };
}

/* ------------------------------------------------------------------ */
/* Linhas: fronteiras, conexões e moldura da passagem                  */
/* ------------------------------------------------------------------ */

/** Cada segmento vira um quad (6 vértices): a(3) b(3) meta(4: t, lado, extremidade, semente). */
const CORNERS: [number, number][] = [
  [0, -1],
  [0, 1],
  [1, -1],
  [1, -1],
  [0, 1],
  [1, 1],
];

function pushSegment(out: number[], a: number[], b: number[], ta: number, tb: number, seed: number) {
  for (const [end, side] of CORNERS) {
    out.push(a[0], a[1], a[2], b[0], b[1], b[2], end ? tb : ta, side, end, seed);
  }
}

/** Fronteiras internas entre países, em (lat, lon) radianos — posicionadas na GPU (planeta → mapa). */
export function buildBorders(): Float32Array {
  const values = varints(BORDERS_RLE);
  const unzig = (n: number) => (n >>> 1) ^ -(n & 1);
  const rand = rng(31);
  const out: number[] = [];
  let i = 0;
  while (i < values.length) {
    const n = values[i++];
    let qx = 0;
    let qy = 0;
    let prev: number[] | null = null;
    // cada linha recebe uma semente própria (dissolve por trechos), com pequena variação por segmento
    const lineSeed = rand();
    for (let k = 0; k < n; k++) {
      qx += unzig(values[i++]);
      qy += unzig(values[i++]);
      const p = [(qy / BORDERS_Q) * DEG, (qx / BORDERS_Q) * DEG, 0];
      if (prev) pushSegment(out, prev, p, 0, 1, Math.min(0.999, Math.max(0, lineSeed * 0.8 + rand() * 0.2)));
      prev = p;
    }
  }
  return new Float32Array(out);
}

/**
 * Conexões luminosas que atravessam o mapa (cena 2). Os pares são sorteados entre pontos de terra
 * na região visível e não representam rotas reais: são uma metáfora visual de caminhos possíveis.
 */
export function buildLinks(dots: DotData, count: number, segments: number): Float32Array {
  const rand = rng(23);
  const candidates = dots.landLL.filter(([lat, lon]) => {
    const [x, , z] = mapPos(lat, lon);
    return Math.abs(x) < 1.45 && Math.abs(z) < 0.95;
  });
  const out: number[] = [];
  let made = 0;
  let guard = 0;
  while (made < count && guard++ < count * 500 && candidates.length > 2) {
    const A = candidates[Math.floor(rand() * candidates.length)];
    const B = candidates[Math.floor(rand() * candidates.length)];
    const a = mapPos(A[0], A[1]);
    const b = mapPos(B[0], B[1]);
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
    if (len < 0.45 || len > 1.6) continue;
    // não toca a origem do caminho principal
    if (Math.hypot(a[0], a[2]) < 0.12 || Math.hypot(b[0], b[2]) < 0.12) continue;
    const bend = (rand() - 0.5) * 0.5 * len;
    const nx = -(b[2] - a[2]) / len;
    const nz = (b[0] - a[0]) / len;
    const cx = (a[0] + b[0]) / 2 + nx * bend;
    const cz = (a[2] + b[2]) / 2 + nz * bend;
    const lift = 0.06 + len * 0.14;
    const seed = made / count + rand() * (0.5 / count);
    const pt = (t: number) => {
      const u = 1 - t;
      return [u * u * a[0] + 2 * u * t * cx + t * t * b[0], Math.sin(Math.PI * t) * lift, u * u * a[2] + 2 * u * t * cz + t * t * b[2]];
    };
    let prev = pt(0);
    for (let s = 1; s <= segments; s++) {
      const t = s / segments;
      const p = pt(t);
      pushSegment(out, prev, p, (s - 1) / segments, t, seed);
      prev = p;
    }
    made++;
  }
  return new Float32Array(out);
}

/** Moldura luminosa da passagem (batentes e verga). */
export function buildDoorFrame(): Float32Array {
  const out: number[] = [];
  const x = DOOR_W / 2 + 0.035;
  const y = DOOR_H + 0.035;
  const z = -DOOR_Z;
  const lines: [number[], number[]][] = [
    [[-x, 0, z], [-x, y, z]],
    [[-x, y, z], [x, y, z]],
    [[x, y, z], [x, 0, z]],
  ];
  for (const [a, b] of lines) pushSegment(out, a, b, 0, 1, 0);
  return new Float32Array(out);
}

/* ------------------------------------------------------------------ */
/* Caminho de luz (fita sobre o chão)                                  */
/* ------------------------------------------------------------------ */

/** Fita: centro(3) normal(3) uv(2: lado, s). A largura é aplicada na GPU. */
export function buildHeroRibbon(samples: number): Float32Array {
  const out: number[] = [];
  const pts = Array.from({ length: samples + 1 }, (_, i) => heroPath(i / samples));
  const normalAt = (i: number) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(samples, i + 1)];
    const dx = b[0] - a[0];
    const dz = b[2] - a[2];
    const l = Math.hypot(dx, dz) || 1;
    return [-dz / l, 0, dx / l];
  };
  for (let i = 0; i < samples; i++) {
    const ca = pts[i];
    const cb = pts[i + 1];
    const na = normalAt(i);
    const nb = normalAt(i + 1);
    const sa = i / samples;
    const sb = (i + 1) / samples;
    const v = (c: number[], n: number[], side: number, s: number) => out.push(c[0], 0.004, c[2], n[0], n[1], n[2], side, s);
    v(ca, na, -1, sa);
    v(ca, na, 1, sa);
    v(cb, nb, -1, sb);
    v(cb, nb, -1, sb);
    v(ca, na, 1, sa);
    v(cb, nb, 1, sb);
  }
  return new Float32Array(out);
}

/* ------------------------------------------------------------------ */
/* Partículas dos símbolos e da marca                                  */
/* ------------------------------------------------------------------ */

export interface SparkData {
  count: number;
  /** posição inicial dentro da passagem, em [-0.5, 0.5]² (relativa ao retângulo projetado da porta) */
  start: Float32Array;
  /** destino no símbolo: x, y locais [-1,1] e índice do símbolo */
  glyph: Float32Array;
  /** destino na marca: x, y locais e 1 se pertence ao "sol" */
  logo: Float32Array;
  seed: Float32Array;
}

export function buildSparks(perGlyph: number): SparkData {
  const rand = rng(91);
  const glyphCount = introGlyphShapes.length;
  const count = perGlyph * glyphCount;
  const start = new Float32Array(count * 2);
  const glyph = new Float32Array(count * 3);
  const logo = new Float32Array(count * 3);
  const seed = new Float32Array(count * 2);
  const glyphSamples = introGlyphShapes.map((shape, g) => sampleShape(shape, perGlyph, 100 + g, 0.7));
  const logoSamples = sampleShapeWithFlags(logoShape, count, 300, 0.45);
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (let i = 0; i < count; i++) {
    const g = i % glyphCount;
    const k = Math.floor(i / glyphCount);
    start.set([(rand() - 0.5) * 0.7, rand() * 0.9 - 0.45], i * 2);
    glyph.set([glyphSamples[g][k * 2], glyphSamples[g][k * 2 + 1], g], i * 3);
    const o = order[i];
    logo.set([logoSamples.points[o * 2], logoSamples.points[o * 2 + 1], logoSamples.flags[o]], i * 3);
    seed.set([rand(), rand()], i * 2);
  }
  return { count, start, glyph, logo, seed };
}

/** Estrelas: pontos em espaço de tela (0..1) com semente. */
export function buildDust(count: number): Float32Array {
  const rand = rng(5);
  const out = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) out.set([rand(), rand(), rand(), rand()], i * 4);
  return out;
}
