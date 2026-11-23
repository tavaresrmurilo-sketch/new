// Névoa de guerra: visibilidade por equipe numa grade grossa.
// Fontes de visão: unidades próprias, capitais próprias e sensores de reconhecimento.
import { UNIT_DEFS } from '../data/units';
import type { MapData } from './map';
import { TERRAIN, GAME_EVENTS } from './rules';
import type { Faction, World } from './types';

export const FOG_CELL = 48;
const CAPITAL_VISION = 170;

export class Visibility {
  readonly cols: number;
  readonly rows: number;
  readonly grid: Record<Faction, Uint8Array>;

  constructor(private map: MapData) {
    this.cols = Math.ceil(map.width / FOG_CELL);
    this.rows = Math.ceil(map.height / FOG_CELL);
    this.grid = { lula: new Uint8Array(this.cols * this.rows), bolso: new Uint8Array(this.cols * this.rows) };
  }

  private mark(g: Uint8Array, x: number, y: number, r: number): void {
    const c0 = Math.max(0, Math.floor((x - r) / FOG_CELL)), c1 = Math.min(this.cols - 1, Math.floor((x + r) / FOG_CELL));
    const r0 = Math.max(0, Math.floor((y - r) / FOG_CELL)), r1 = Math.min(this.rows - 1, Math.floor((y + r) / FOG_CELL));
    const rr = (r + FOG_CELL * 0.5) ** 2;
    for (let row = r0; row <= r1; row++) {
      const cy = row * FOG_CELL + FOG_CELL / 2;
      for (let c = c0; c <= c1; c++) {
        const cx = c * FOG_CELL + FOG_CELL / 2;
        if ((cx - x) ** 2 + (cy - y) ** 2 <= rr) g[row * this.cols + c] = 1;
      }
    }
  }

  /** Recalcula a visibilidade das duas equipes. */
  update(w: World, only?: Faction): void {
    const map = this.map;
    const visionMul = (x: number, y: number): number => {
      let m = TERRAIN[map.terrainAt(x, y)].vision;
      for (const ev of w.gevents) {
        const def = GAME_EVENTS.find((e) => e.id === ev.id);
        if (!def?.vision) continue;
        const st = map.stateAt(x, y);
        if (!def.region || (st >= 0 && map.states[st].info.region === def.region)) m *= def.vision;
      }
      return m;
    };
    for (const f of ['lula', 'bolso'] as Faction[]) {
      if (only && only !== f) continue;
      const g = this.grid[f];
      g.fill(0);
      for (const s of w.states) if (s.owner === f) { const c = map.states[s.i].capital; this.mark(g, c.x, c.y, CAPITAL_VISION); }
      for (const u of w.units) {
        if (u.f !== f || u.hp <= 0) continue;
        const def = UNIT_DEFS[u.type];
        this.mark(g, u.x, u.y, def.vision * (def.air ? 1 : visionMul(u.x, u.y)));
      }
      for (const r of w.reveals) if (r.f === f && r.until > w.time) this.mark(g, r.x, r.y, r.r);
    }
  }

  visible(f: Faction, x: number, y: number): boolean {
    const c = Math.floor(x / FOG_CELL), r = Math.floor(y / FOG_CELL);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return false;
    return this.grid[f][r * this.cols + c] === 1;
  }
}
