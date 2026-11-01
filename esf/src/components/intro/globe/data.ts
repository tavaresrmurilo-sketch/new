import { MASK_COLS, MASK_ROWS, MASK_RLE } from "./land-mask";
import { introGlyphShapes, logoShape, rng, sampleShape, sampleShapeWithFlags } from "@/lib/shapes";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const DEG = Math.PI / 180;

/** Brasília — sede institucional da ESF (referência visual da cena 3). */
export const BRASILIA = { lat: -15.79, lon: -47.88 } as const;

export function toUnit(latDeg: number, lonDeg: number): [number, number, number] {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  return [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)];
}

let decoded: Uint8Array | null = null;

/** Decodifica a grade terra/Brasil (0 oceano, 1 terra, 2 Brasil). */
export function decodeMask(): Uint8Array {
  if (decoded) return decoded;
  const lookup = new Int8Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i++) lookup[ALPHABET.charCodeAt(i)] = i;
  const grid = new Uint8Array(MASK_COLS * MASK_ROWS);
  let pos = 0;
  let value = 0;
  let shift = 0;
  for (let i = 0; i < MASK_RLE.length; i++) {
    const chunk = lookup[MASK_RLE.charCodeAt(i)];
    value |= (chunk & 31) << shift;
    if (chunk & 32) {
      shift += 5;
      continue;
    }
    const kind = value % 3;
    const len = (value - kind) / 3;
    if (kind) grid.fill(kind, pos, pos + len);
    pos += len;
    value = 0;
    shift = 0;
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

export interface DotData {
  count: number;
  /** vec3 unitário por ponto */
  positions: Float32Array;
  /** x: semente, y: 1 se Brasil, z: distância angular até Brasília (rad) */
  info: Float32Array;
  brazilIndices: number[];
}

/**
 * Pontos de terra numa malha de latitudes regulares (linhas alternadas deslocadas meio passo),
 * o que produz o visual de "mapa pontilhado" típico de atlas.
 */
export function buildDots(stepDeg: number): DotData {
  const grid = decodeMask();
  const rand = rng(7);
  const b = toUnit(BRASILIA.lat, BRASILIA.lon);
  const pos: number[] = [];
  const info: number[] = [];
  const brazil: number[] = [];
  let row = 0;
  for (let lat = 83; lat >= -84; lat -= stepDeg, row++) {
    const n = Math.max(1, Math.round((360 * Math.cos(lat * DEG)) / stepDeg));
    const offset = row % 2 ? 0.5 : 0;
    for (let j = 0; j < n; j++) {
      const lon = -180 + ((j + offset) * 360) / n;
      const v = sampleMask(grid, lat, lon);
      if (!v) continue;
      const p = toUnit(lat, lon);
      const isBrazil = v === 2 ? 1 : 0;
      const dot = Math.min(1, Math.max(-1, p[0] * b[0] + p[1] * b[1] + p[2] * b[2]));
      if (isBrazil) brazil.push(pos.length / 3);
      pos.push(p[0], p[1], p[2]);
      info.push(rand(), isBrazil, Math.acos(dot));
    }
  }
  return {
    count: pos.length / 3,
    positions: new Float32Array(pos),
    info: new Float32Array(info),
    brazilIndices: brazil,
  };
}

function slerp(a: number[], b: number[], t: number): number[] {
  const d = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const omega = Math.acos(d);
  if (omega < 1e-5) return a.slice();
  const s = Math.sin(omega);
  const wa = Math.sin((1 - t) * omega) / s;
  const wb = Math.sin(t * omega) / s;
  return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb];
}

export interface ArcData {
  /** vértices de quads: a(3) b(3) meta(4: t, lado, extremidade, semente) */
  vertices: Float32Array;
  vertexCount: number;
  /** pontos das extremidades: pos(3) meta(2: semente, extremidade) */
  nodes: Float32Array;
  nodeCount: number;
}

/**
 * Conexões abstratas entre pontos de terra espalhados pelo mundo.
 * Não representam rotas migratórias: os pares são sorteados, nunca envolvem o Brasil
 * e servem apenas como metáfora visual de conexões humanas.
 */
export function buildArcs(dots: DotData, count: number, segments: number): ArcData {
  const rand = rng(23);
  const candidates: number[] = [];
  for (let i = 0; i < dots.count; i++) {
    const y = dots.positions[i * 3 + 1];
    if (dots.info[i * 3 + 1] === 0 && y > -0.82 && y < 0.9) candidates.push(i);
  }
  const quads: number[] = [];
  const nodes: number[] = [];
  let made = 0;
  let guard = 0;
  while (made < count && guard++ < count * 400) {
    const ia = candidates[Math.floor(rand() * candidates.length)];
    const ib = candidates[Math.floor(rand() * candidates.length)];
    const a = [dots.positions[ia * 3], dots.positions[ia * 3 + 1], dots.positions[ia * 3 + 2]];
    const b = [dots.positions[ib * 3], dots.positions[ib * 3 + 1], dots.positions[ib * 3 + 2]];
    const angle = Math.acos(Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
    if (angle < 22 * DEG || angle > 85 * DEG) continue;
    const seed = made / count + rand() * (0.6 / count);
    const lift = 0.035 + (angle / Math.PI) * 0.26;
    const pts: number[][] = [];
    for (let s = 0; s <= segments; s++) {
      const t = s / segments;
      const p = slerp(a, b, t);
      const h = 1 + Math.sin(Math.PI * t) * lift;
      pts.push([p[0] * h, p[1] * h, p[2] * h, t]);
    }
    for (let s = 0; s < segments; s++) {
      const p = pts[s];
      const q = pts[s + 1];
      // dois triângulos por segmento: (a,-1) (a,+1) (b,-1) / (b,-1) (a,+1) (b,+1)
      const corners: [number, number][] = [
        [0, -1],
        [0, 1],
        [1, -1],
        [1, -1],
        [0, 1],
        [1, 1],
      ];
      for (const [end, side] of corners) {
        quads.push(p[0], p[1], p[2], q[0], q[1], q[2], end ? q[3] : p[3], side, end, seed);
      }
    }
    nodes.push(a[0], a[1], a[2], seed, 0, b[0], b[1], b[2], seed, 1);
    made++;
  }
  return {
    vertices: new Float32Array(quads),
    vertexCount: quads.length / 10,
    nodes: new Float32Array(nodes),
    nodeCount: nodes.length / 5,
  };
}

export interface SparkData {
  count: number;
  /** ponto de partida (Brasil) vec3 */
  start: Float32Array;
  /** destino no símbolo: x, y locais [-1,1] e índice do símbolo */
  glyph: Float32Array;
  /** destino na marca: x, y locais e 1 se pertence ao "sol" */
  logo: Float32Array;
  seed: Float32Array;
}

/**
 * Partículas que nascem sobre o Brasil e se reorganizam em símbolos (cena 4)
 * e, depois, na marca da ESF (cena 5).
 */
export function buildSparks(dots: DotData, perGlyph: number): SparkData {
  const rand = rng(91);
  const glyphCount = introGlyphShapes.length;
  const count = perGlyph * glyphCount;
  const start = new Float32Array(count * 3);
  const glyph = new Float32Array(count * 3);
  const logo = new Float32Array(count * 3);
  const seed = new Float32Array(count * 2);

  const glyphSamples = introGlyphShapes.map((shape, g) => sampleShape(shape, perGlyph, 100 + g, 0.7));
  const logoSamples = sampleShapeWithFlags(logoShape, count, 300, 0.45);

  // embaralha o destino na marca para que os quatro símbolos convirjam como um enxame
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  const brazil = dots.brazilIndices.length ? dots.brazilIndices : [0];
  for (let i = 0; i < count; i++) {
    const g = i % glyphCount;
    const k = Math.floor(i / glyphCount);
    const src = brazil[Math.floor(rand() * brazil.length)];
    // pequena variação para não coincidir exatamente com os pontos do globo
    const jx = (rand() - 0.5) * 0.012;
    const jy = (rand() - 0.5) * 0.012;
    const x = dots.positions[src * 3] + jx;
    const y = dots.positions[src * 3 + 1] + jy;
    const z = dots.positions[src * 3 + 2];
    const len = Math.hypot(x, y, z);
    start.set([x / len, y / len, z / len], i * 3);
    glyph.set([glyphSamples[g][k * 2], glyphSamples[g][k * 2 + 1], g], i * 3);
    const o = order[i];
    logo.set([logoSamples.points[o * 2], logoSamples.points[o * 2 + 1], logoSamples.flags[o]], i * 3);
    seed.set([rand(), rand()], i * 2);
  }
  return { count, start, glyph, logo, seed };
}

/** Poeira cósmica: pontos em espaço de tela (0..1) com semente. */
export function buildDust(count: number): Float32Array {
  const rand = rng(5);
  const out = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) out.set([rand(), rand(), rand(), rand()], i * 4);
  return out;
}
