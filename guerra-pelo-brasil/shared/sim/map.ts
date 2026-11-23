// Dados geográficos estáticos (independentes da partida): polígonos reais dos
// estados, adjacências, raster de estados, grade de navegação e capitais.
import mapJson from '../data/brazil-map.json';
import { STATE_INFO, type StateInfo } from '../data/states';
import type { Vec } from './types';

export interface StateGeo {
  i: number;
  uf: string;
  name: string;
  info: StateInfo;
  rings: number[][];
  bbox: [number, number, number, number];
  label: Vec;
  adj: number[];
  area: number;
  capital: Vec;
}

export interface BorderGeo {
  a: number;
  b: number;
  lines: number[][];
}

interface RawState {
  uf: string;
  name: string;
  bbox: number[];
  label: number[];
  rings: number[][];
  adj: string[];
}

interface RawMap {
  width: number;
  height: number;
  projection: { lonMin: number; latMax: number; cos: number; k: number; margin: number };
  states: RawState[];
  borders: { a: string; b: string; lines: number[][] }[];
  outline: number[][];
  neighbors: { name: string; ring: number[] }[];
}

const raw = mapJson as unknown as RawMap;

export const CELL = 16;

function ringArea(r: number[]): number {
  let a = 0;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    a += (r[j] + r[i]) * (r[j + 1] - r[i + 1]);
  }
  return Math.abs(a / 2);
}

export function pointInRing(x: number, y: number, r: number[]): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export class MapData {
  readonly width = raw.width;
  readonly height = raw.height;
  readonly states: StateGeo[];
  readonly byUf: Record<string, number> = {};
  readonly borders: BorderGeo[];
  readonly outline = raw.outline;
  readonly neighbors = raw.neighbors;
  readonly cols: number;
  readonly rows: number;
  /** índice do estado por célula (-1 = fora do Brasil) */
  readonly grid: Int8Array;
  /** célula navegável por unidades terrestres */
  readonly walk: Uint8Array;
  /** estados ordenados do menor para o maior (para seleção precisa) */
  private readonly pickOrder: number[];

  constructor() {
    const infoByUf = Object.fromEntries(STATE_INFO.map((s) => [s.uf, s]));
    raw.states.forEach((s, i) => (this.byUf[s.uf] = i));
    this.states = raw.states.map((s, i) => ({
      i,
      uf: s.uf,
      name: s.name,
      info: infoByUf[s.uf],
      rings: s.rings,
      bbox: [s.bbox[0], s.bbox[1], s.bbox[2], s.bbox[3]],
      label: { x: s.label[0], y: s.label[1] },
      adj: s.adj.map((u) => this.byUf[u]),
      area: s.rings.reduce((a, r) => a + ringArea(r), 0),
      capital: this.project(infoByUf[s.uf].lat, infoByUf[s.uf].lon),
    }));
    this.borders = raw.borders.map((b) => ({ a: this.byUf[b.a], b: this.byUf[b.b], lines: b.lines }));
    this.pickOrder = this.states.map((s) => s.i).sort((a, b) => this.states[a].area - this.states[b].area);

    this.cols = Math.ceil(this.width / CELL);
    this.rows = Math.ceil(this.height / CELL);
    this.grid = new Int8Array(this.cols * this.rows).fill(-1);
    this.walk = new Uint8Array(this.cols * this.rows);
    this.rasterize();
    this.buildWalkable();
    this.placeCapitals();
  }

  project(lat: number, lon: number): Vec {
    const p = raw.projection;
    return { x: (lon - p.lonMin) * p.cos * p.k + p.margin, y: (p.latMax - lat) * p.k + p.margin };
  }

  /** Preenche o raster por varredura (scanline), do maior para o menor estado. */
  private rasterize(): void {
    const order = [...this.pickOrder].reverse();
    for (const si of order) {
      const s = this.states[si];
      const r0 = Math.max(0, Math.floor(s.bbox[1] / CELL));
      const r1 = Math.min(this.rows - 1, Math.ceil(s.bbox[3] / CELL));
      for (let row = r0; row <= r1; row++) {
        const y = row * CELL + CELL / 2;
        const xs: number[] = [];
        for (const r of s.rings) {
          for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
            const yi = r[i + 1], yj = r[j + 1];
            if (yi > y !== yj > y) xs.push(((r[j] - r[i]) * (y - yi)) / (yj - yi) + r[i]);
          }
        }
        xs.sort((a, b) => a - b);
        for (let k = 0; k + 1 < xs.length; k += 2) {
          const c0 = Math.max(0, Math.ceil((xs[k] - CELL / 2) / CELL));
          const c1 = Math.min(this.cols - 1, Math.floor((xs[k + 1] - CELL / 2) / CELL));
          for (let c = c0; c <= c1; c++) this.grid[row * this.cols + c] = si;
        }
      }
    }
  }

  /** Terreno navegável = maior componente conexo de terra (ilhas isoladas ficam de fora). */
  private buildWalkable(): void {
    const n = this.cols * this.rows;
    const comp = new Int32Array(n).fill(-1);
    let best = -1, bestSize = 0, id = 0;
    const stack: number[] = [];
    for (let s = 0; s < n; s++) {
      if (this.grid[s] < 0 || comp[s] >= 0) continue;
      let size = 0;
      stack.push(s);
      comp[s] = id;
      while (stack.length) {
        const c = stack.pop()!;
        size++;
        const cx = c % this.cols, cy = (c / this.cols) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
          const nc = ny * this.cols + nx;
          if (this.grid[nc] >= 0 && comp[nc] < 0) { comp[nc] = id; stack.push(nc); }
        }
      }
      if (size > bestSize) { bestSize = size; best = id; }
      id++;
    }
    for (let s = 0; s < n; s++) this.walk[s] = comp[s] === best ? 1 : 0;
  }

  /** Ajusta cada capital para uma célula navegável do próprio estado, um pouco para dentro do litoral. */
  private placeCapitals(): void {
    for (const s of this.states) {
      const c = s.capital;
      let bestX = c.x, bestY = c.y, bestD = Infinity;
      const cc = Math.floor(c.x / CELL), cr = Math.floor(c.y / CELL);
      for (let r = cr - 8; r <= cr + 8; r++) for (let q = cc - 8; q <= cc + 8; q++) {
        if (q < 1 || r < 1 || q >= this.cols - 1 || r >= this.rows - 1) continue;
        const idx = r * this.cols + q;
        if (this.grid[idx] !== s.i || !this.walk[idx]) continue;
        let interior = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (this.walk[(r + dy) * this.cols + q + dx]) interior++;
        const x = q * CELL + CELL / 2, y = r * CELL + CELL / 2;
        const d = Math.hypot(x - c.x, y - c.y) + (9 - interior) * 7;
        if (d < bestD) { bestD = d; bestX = x; bestY = y; }
      }
      s.capital = { x: bestX, y: bestY };
    }
  }

  cellOf(x: number, y: number): number {
    const c = Math.floor(x / CELL), r = Math.floor(y / CELL);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    return r * this.cols + c;
  }

  /** Estado na posição (raster, O(1)). -1 se fora do Brasil. */
  stateAt(x: number, y: number): number {
    const c = this.cellOf(x, y);
    return c < 0 ? -1 : this.grid[c];
  }

  /** Estado na posição com teste exato de polígono (para cliques). */
  stateAtPrecise(x: number, y: number): number {
    for (const i of this.pickOrder) {
      const s = this.states[i];
      if (x < s.bbox[0] || y < s.bbox[1] || x > s.bbox[2] || y > s.bbox[3]) continue;
      for (const r of s.rings) if (pointInRing(x, y, r)) return i;
    }
    return -1;
  }

  isWalkable(x: number, y: number): boolean {
    const c = this.cellOf(x, y);
    return c >= 0 && this.walk[c] === 1;
  }

  /** Ponto navegável mais próximo (busca em anéis de células). */
  nearestWalkable(x: number, y: number): Vec {
    if (this.isWalkable(x, y)) return { x, y };
    const cc = Math.floor(x / CELL), cr = Math.floor(y / CELL);
    for (let rad = 1; rad < 80; rad++) {
      let best: Vec | null = null, bd = Infinity;
      for (let r = cr - rad; r <= cr + rad; r++) for (let q = cc - rad; q <= cc + rad; q++) {
        if (Math.abs(r - cr) !== rad && Math.abs(q - cc) !== rad) continue;
        if (q < 0 || r < 0 || q >= this.cols || r >= this.rows) continue;
        if (!this.walk[r * this.cols + q]) continue;
        const px = q * CELL + CELL / 2, py = r * CELL + CELL / 2;
        const d = (px - x) ** 2 + (py - y) ** 2;
        if (d < bd) { bd = d; best = { x: px, y: py }; }
      }
      if (best) return best;
    }
    return { x, y };
  }

  isAdjacent(a: number, b: number): boolean {
    return this.states[a].adj.includes(b);
  }
}

let instance: MapData | null = null;
export function getMap(): MapData {
  if (!instance) instance = new MapData();
  return instance;
}
