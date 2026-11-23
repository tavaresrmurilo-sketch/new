// Hash espacial uniforme para consultas de vizinhança rápidas.
import type { Unit } from './types';

export class SpatialHash {
  readonly size: number;
  private cols: number;
  private rows: number;
  private buckets: Unit[][];

  constructor(width: number, height: number, size = 64) {
    this.size = size;
    this.cols = Math.ceil(width / size) + 1;
    this.rows = Math.ceil(height / size) + 1;
    this.buckets = Array.from({ length: this.cols * this.rows }, () => []);
  }

  rebuild(units: Unit[]): void {
    for (const b of this.buckets) b.length = 0;
    for (const u of units) {
      if (u.hp <= 0) continue;
      const c = Math.min(this.cols - 1, Math.max(0, Math.floor(u.x / this.size)));
      const r = Math.min(this.rows - 1, Math.max(0, Math.floor(u.y / this.size)));
      this.buckets[r * this.cols + c].push(u);
    }
  }

  /** Chama fn para cada unidade cujo bucket intersecta o círculo (x,y,rad). */
  query(x: number, y: number, rad: number, fn: (u: Unit) => void): void {
    const c0 = Math.max(0, Math.floor((x - rad) / this.size));
    const c1 = Math.min(this.cols - 1, Math.floor((x + rad) / this.size));
    const r0 = Math.max(0, Math.floor((y - rad) / this.size));
    const r1 = Math.min(this.rows - 1, Math.floor((y + rad) / this.size));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const b = this.buckets[r * this.cols + c];
        for (let i = 0; i < b.length; i++) fn(b[i]);
      }
    }
  }
}
