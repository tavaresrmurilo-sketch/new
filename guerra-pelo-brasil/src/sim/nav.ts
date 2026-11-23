// Navegação terrestre: A* em grade 8-direções + suavização por linha de visada.
import { CELL, type MapData } from './map';

const SQRT2 = Math.SQRT2;

class Heap {
  private ids: Int32Array;
  private keys: Float64Array;
  size = 0;
  constructor(cap: number) {
    this.ids = new Int32Array(cap);
    this.keys = new Float64Array(cap);
  }
  clear(): void {
    this.size = 0;
  }
  push(id: number, key: number): void {
    if (this.size >= this.ids.length) {
      const ni = new Int32Array(this.ids.length * 2); ni.set(this.ids); this.ids = ni;
      const nk = new Float64Array(this.keys.length * 2); nk.set(this.keys); this.keys = nk;
    }
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= key) break;
      this.ids[i] = this.ids[p]; this.keys[i] = this.keys[p];
      i = p;
    }
    this.ids[i] = id; this.keys[i] = key;
  }
  pop(): number {
    const top = this.ids[0];
    const lastId = this.ids[--this.size], lastKey = this.keys[this.size];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= this.size) break;
      if (c + 1 < this.size && this.keys[c + 1] < this.keys[c]) c++;
      if (this.keys[c] >= lastKey) break;
      this.ids[i] = this.ids[c]; this.keys[i] = this.keys[c];
      i = c;
    }
    this.ids[i] = lastId; this.keys[i] = lastKey;
    return top;
  }
}

export class Navigator {
  private g: Float64Array;
  private parent: Int32Array;
  private gen: Uint32Array;
  private closed: Uint32Array;
  private curGen = 0;
  private heap: Heap;
  private cache = new Map<number, number[] | null>();
  private cacheTick = -1;
  /** contador para testes/diagnóstico */
  searches = 0;

  constructor(private map: MapData) {
    const n = map.cols * map.rows;
    this.g = new Float64Array(n);
    this.parent = new Int32Array(n);
    this.gen = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.heap = new Heap(4096);
  }

  /** Linha de visada terrestre entre dois pontos (todas as células navegáveis). */
  los(x0: number, y0: number, x1: number, y1: number): boolean {
    const dx = x1 - x0, dy = y1 - y0;
    const dist = Math.hypot(dx, dy);
    const steps = Math.ceil(dist / (CELL * 0.5));
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps;
      if (!this.map.isWalkable(x0 + dx * t, y0 + dy * t)) return false;
    }
    return true;
  }

  /**
   * Caminho de (sx,sy) até (tx,ty) para unidades terrestres.
   * Retorna lista achatada [x,y,...] sem o ponto inicial, ou null se impossível.
   */
  find(sx: number, sy: number, tx: number, ty: number, tick = -1): number[] | null {
    const m = this.map;
    const start = m.nearestWalkable(sx, sy);
    const goal = m.nearestWalkable(tx, ty);
    if (this.los(start.x, start.y, goal.x, goal.y)) return [goal.x, goal.y];

    const sc = m.cellOf(start.x, start.y), gc = m.cellOf(goal.x, goal.y);
    if (sc < 0 || gc < 0) return null;
    if (tick !== this.cacheTick) { this.cache.clear(); this.cacheTick = tick; }
    const key = sc * 65536 + gc;
    let cells: number[] | null | undefined = this.cache.get(key);
    if (cells === undefined) {
      cells = this.astar(sc, gc);
      this.cache.set(key, cells);
    }
    if (!cells) return null;
    // converte para pontos e suaviza
    const pts: number[] = [start.x, start.y];
    for (const c of cells) pts.push((c % m.cols) * CELL + CELL / 2, ((c / m.cols) | 0) * CELL + CELL / 2);
    pts[pts.length - 2] = goal.x;
    pts[pts.length - 1] = goal.y;
    return this.smooth(pts).slice(2);
  }

  private smooth(pts: number[]): number[] {
    const out = [pts[0], pts[1]];
    let i = 0;
    const n = pts.length / 2;
    while (i < n - 1) {
      let j = n - 1;
      while (j > i + 1 && !this.los(pts[i * 2], pts[i * 2 + 1], pts[j * 2], pts[j * 2 + 1])) j--;
      out.push(pts[j * 2], pts[j * 2 + 1]);
      i = j;
    }
    return out;
  }

  private astar(sc: number, gc: number): number[] | null {
    this.searches++;
    const m = this.map, cols = m.cols, rows = m.rows;
    const gen = ++this.curGen;
    const heap = this.heap;
    heap.clear();
    const gx = gc % cols, gy = (gc / cols) | 0;
    const h = (c: number): number => {
      const dx = Math.abs((c % cols) - gx), dy = Math.abs(((c / cols) | 0) - gy);
      return (dx + dy) + (SQRT2 - 2) * Math.min(dx, dy);
    };
    this.gen[sc] = gen; this.g[sc] = 0; this.parent[sc] = -1;
    heap.push(sc, h(sc));
    let expanded = 0;
    while (heap.size > 0) {
      const c = heap.pop();
      if (this.closed[c] === gen) continue;
      this.closed[c] = gen;
      if (c === gc) {
        const out: number[] = [];
        let k = c;
        while (k !== sc && k >= 0) { out.push(k); k = this.parent[k]; }
        return out.reverse();
      }
      if (++expanded > 60000) return null;
      const cx = c % cols, cy = (c / cols) | 0;
      const gcur = this.g[c];
      for (let dy = -1; dy <= 1; dy++) {
        const ny = cy + dy;
        if (ny < 0 || ny >= rows) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx;
          if (nx < 0 || nx >= cols) continue;
          const nc = ny * cols + nx;
          if (!m.walk[nc] || this.closed[nc] === gen) continue;
          if (dx && dy && (!m.walk[cy * cols + nx] || !m.walk[ny * cols + cx])) continue; // sem cortar cantos
          const ng = gcur + (dx && dy ? SQRT2 : 1);
          if (this.gen[nc] !== gen || ng < this.g[nc]) {
            this.gen[nc] = gen; this.g[nc] = ng; this.parent[nc] = c;
            heap.push(nc, ng + h(nc));
          }
        }
      }
    }
    return null;
  }
}
