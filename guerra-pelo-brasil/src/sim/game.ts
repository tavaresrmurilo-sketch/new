// Motor da simulação em tempo real. Totalmente independente do Phaser:
// roda no navegador e nos testes (Node) exatamente da mesma forma.
import { UNIT_DEFS, GARRISON, RECRUITABLE, type UnitDef } from '../data/units';
import { BUILDING_DEFS, slotsFor } from '../data/buildings';
import { ABILITIES, FACTIONS, enemyOf } from '../data/factions';
import { getMap, type MapData } from './map';
import { Navigator } from './nav';
import { SpatialHash } from './spatial';
import { rand } from './rng';
import { createWorld, garrisonMax, makeUnit, spotNear, WORLD_VERSION } from './setup';
import { thinkAI } from './ai/ai';
import { OBJECTIVES } from './objectives';
import type {
  AbilityId, ArmorClass, BuildingType, Faction, FactionRT, LogEntry, MatchSettings, Owner, Res, ResKey,
  SimEvent, StateRT, TargetRef, Unit, UnitType, World,
} from './types';

export const STEP = 0.05;
export const CAPTURE_R = 70;
/** escala de renda por recurso (por segundo de jogo, por ponto de rendimento do estado) */
export const INCOME_SCALE: Res = { money: 0.55, fuel: 0.3, steel: 0.35, supplies: 0.3 };
export const EXEC_TURN_SECONDS = 15;
export const TRADE_RATE = 0.5;
const RES_KEYS: ResKey[] = ['money', 'fuel', 'steel', 'supplies'];
const AI_INCOME: Record<string, number> = { facil: 0.75, normal: 1.0, dificil: 1.2, insano: 1.5 };

export interface TargetInfo {
  x: number;
  y: number;
  armor: ArmorClass;
  owner: Owner;
  alive: boolean;
}

export function zeroRes(): Res {
  return { money: 0, fuel: 0, steel: 0, supplies: 0 };
}

export class Game {
  readonly map: MapData;
  readonly nav: Navigator;
  readonly hash: SpatialHash;
  w: World;
  events: SimEvent[] = [];
  /** fração do passo atual para interpolação visual */
  alpha = 0;
  private acc = 0;
  private byId = new Map<number, Unit>();
  private nextEco = 0;
  private nextSupply = 0;
  private nextVictory = 0;
  private nextObjectives = 0;

  constructor(world: World) {
    this.map = getMap();
    this.nav = new Navigator(this.map);
    this.hash = new SpatialHash(this.map.width, this.map.height, 64);
    this.w = world;
    for (const u of world.units) this.byId.set(u.id, u);
    this.recomputeEconomy();
  }

  static create(settings: MatchSettings): Game {
    return new Game(createWorld(settings));
  }

  static fromJSON(json: string): Game {
    const w = JSON.parse(json) as World;
    if (!w || w.version !== WORLD_VERSION || !Array.isArray(w.units)) throw new Error('Save incompatível');
    return new Game(w);
  }

  toJSON(): string {
    return JSON.stringify(this.w);
  }

  // ------------------------------------------------------------------ utilidades
  unit(id: number): Unit | undefined {
    const u = this.byId.get(id);
    return u && u.hp > 0 ? u : undefined;
  }

  fac(o: Owner): FactionRT | null {
    return o === 'neutral' ? null : this.w.factions[o];
  }

  emit(e: SimEvent): void {
    if (this.events.length > 4000) this.events.splice(0, 2000);
    this.events.push(e);
  }

  log(text: string, kind: LogEntry['kind'], f?: Owner, s?: number): void {
    this.w.log.push({ t: this.w.time, text, kind, f, s });
    if (this.w.log.length > 80) this.w.log.splice(0, this.w.log.length - 80);
  }

  stateName(i: number): string {
    return this.map.states[i].name;
  }

  capital(i: number): { x: number; y: number } {
    return this.map.states[i].capital;
  }

  statesOf(f: Owner): number[] {
    const out: number[] = [];
    for (const s of this.w.states) if (s.owner === f) out.push(s.i);
    return out;
  }

  unitsOf(f: Owner): Unit[] {
    return this.w.units.filter((u) => u.f === f && u.hp > 0);
  }

  resolve(ref: TargetRef | null): TargetInfo | null {
    if (!ref) return null;
    if (ref.t === 'u') {
      const u = this.unit(ref.id);
      if (!u) return null;
      return { x: u.x, y: u.y, armor: UNIT_DEFS[u.type].armor, owner: u.f, alive: true };
    }
    const s = this.w.states[ref.s];
    if (!s) return null;
    const c = this.capital(ref.s);
    return { x: c.x, y: c.y, armor: 'structure', owner: s.owner, alive: s.gHp > 0 };
  }

  costOf(f: Faction, type: UnitType): Res {
    const c = { ...UNIT_DEFS[type].cost };
    let mul = 1;
    if (f === 'lula' && type === 'infantry') mul *= 0.8;
    if (f === 'bolso' && type === 'tank') mul *= 0.85;
    if (this.w.factions[f].buffs.prodT > 0) mul *= 0.75;
    for (const k of RES_KEYS) c[k] = Math.round(c[k] * mul);
    return c;
  }

  canAfford(f: Faction, cost: Res): boolean {
    const fr = this.w.factions[f];
    if (fr.infinite) return true;
    return RES_KEYS.every((k) => fr.res[k] + 1e-6 >= cost[k]);
  }

  private pay(f: Faction, cost: Res): void {
    const fr = this.w.factions[f];
    if (fr.infinite) return;
    for (const k of RES_KEYS) fr.res[k] -= cost[k];
    fr.stats.spent += cost.money;
  }

  private refund(f: Faction, cost: Res): void {
    const fr = this.w.factions[f];
    if (fr.infinite) return;
    for (const k of RES_KEYS) fr.res[k] += cost[k];
  }

  speedOf(u: Unit, def: UnitDef): number {
    let s = def.speed;
    const fr = this.fac(u.f);
    if (fr) {
      if (u.f === 'bolso') s *= 1.08;
      if (fr.buffs.speedT > 0) s *= 1.5;
      if ((u.type === 'tank' || u.type === 'heli') && fr.res.fuel <= 0 && !fr.infinite) s *= 0.5;
    }
    if (!u.supplied) s *= 0.85;
    return s;
  }

  private damageMul(u: Unit): number {
    let m = u.supplied ? 1 : 0.6;
    const fr = this.fac(u.f);
    if (fr) {
      if (fr.buffs.dmgT > 0) m *= 1.2;
      if (fr.buffs.coordT > 0 && Math.hypot(u.x - fr.buffs.coordX, u.y - fr.buffs.coordY) < 280) m *= 1.35;
    }
    return m;
  }

  // ------------------------------------------------------------------ laço principal
  /** Avança a simulação em tempo real (dt já multiplicado pela velocidade do jogo). */
  advance(dt: number): void {
    this.acc += Math.min(dt, 0.5);
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.step(STEP);
    }
    this.alpha = this.acc / STEP;
  }

  get paused(): boolean {
    return !!this.w.winner || (!!this.w.turn && this.w.turn.phase === 'plan');
  }

  step(dt: number): void {
    const w = this.w;
    if (this.paused) return;
    w.time += dt;
    w.tick++;
    for (const u of w.units) { u.px = u.x; u.py = u.y; }

    if (w.time >= this.nextEco) { this.nextEco = w.time + 0.5; this.recomputeEconomy(); }
    this.applyIncome(dt);
    this.updateBuffs(dt);
    this.updateProduction(dt);

    this.hash.rebuild(w.units);
    if (w.time >= this.nextSupply) { this.nextSupply = w.time + 0.5; this.updateSupplyAndHealing(0.5); }
    for (const u of w.units) if (u.hp > 0) this.updateUnit(u, dt);
    this.separate(dt);
    this.updateShells(dt);
    this.updateGarrisons(dt);
    this.updateCapture(dt);
    this.removeDead();

    for (const f of ['lula', 'bolso'] as Faction[]) {
      const ai = w.ai[f];
      if (ai && w.factions[f].control === 'ai' && w.time >= ai.nextThink) thinkAI(this, f);
    }
    if (w.time >= this.nextObjectives) { this.nextObjectives = w.time + 2; this.checkObjectives(); }
    if (w.time >= this.nextVictory) { this.nextVictory = w.time + 1; this.checkVictory(); }

    if (w.turn && w.turn.phase === 'exec') {
      w.turn.t -= dt;
      if (w.turn.t <= 0) {
        w.turn.phase = 'plan';
        w.turn.active = 'lula';
        w.turn.n++;
        this.emit({ k: 'turn', phase: 'plan', active: 'lula', n: w.turn.n });
      }
    }
  }

  // ------------------------------------------------------------------ economia
  recomputeEconomy(): void {
    const w = this.w, map = this.map;
    for (const f of ['lula', 'bolso'] as Faction[]) {
      const fr = w.factions[f];
      // conectividade (BFS a partir da sede; depósitos funcionam como hubs)
      const owned = new Set(this.statesOf(f));
      const conn = new Set<number>();
      const queue: number[] = [];
      if (owned.has(fr.hq)) { conn.add(fr.hq); queue.push(fr.hq); }
      while (queue.length) {
        const c = queue.shift()!;
        for (const n of map.states[c].adj) if (owned.has(n) && !conn.has(n)) { conn.add(n); queue.push(n); }
      }
      const income = zeroRes();
      let industry = f === 'lula' ? 4 : 0;
      let popCap = 10;
      for (const i of owned) {
        const s = w.states[i];
        const info = map.states[i].info;
        s.connected = conn.has(i) || s.b.depot > 0;
        const m = s.connected ? 1 : 0.5;
        income.money += info.money * m;
        income.fuel += info.fuel * m;
        income.steel += info.steel * m;
        income.supplies += (info.supplies * (s.b.depot ? 1.5 : 1) + (s.b.depot ? 1.5 : 0)) * m;
        industry += info.industry * (s.connected ? 1 : 0.5) + s.b.factory * 3;
        popCap += 1 + Math.round(info.imp / 3) + s.b.barracks * 2 + s.b.depot * 2;
      }
      let mul = w.settings.incomeMul;
      if (fr.control === 'ai') mul *= AI_INCOME[fr.difficulty] ?? 1;
      if (fr.crisisT > 0) mul *= 0.7;
      for (const k of RES_KEYS) income[k] *= mul * INCOME_SCALE[k];
      if (owned.has(map.byUf.DF)) income.money *= 1.15;
      fr.income = income;
      fr.industry = Math.round(industry);
      fr.prodMul = Math.max(0.6, Math.min(2.0, 0.6 + industry / 35));
      fr.popCap = fr.infinite ? 999 : Math.min(150, popCap);
      // população e manutenção
      let pop = 0, sup = 0, fuel = 0;
      for (const u of w.units) {
        if (u.f !== f || u.hp <= 0) continue;
        const d = UNIT_DEFS[u.type];
        pop += d.pop;
        sup += d.pop * 0.1;
        fuel += d.fuelUse;
      }
      for (const s of w.states) if (s.owner === f) for (const q of s.queue) pop += UNIT_DEFS[q.type].pop;
      fr.pop = pop;
      fr.upkeep = { money: 0, fuel, steel: 0, supplies: sup };
    }
  }

  private applyIncome(dt: number): void {
    for (const f of ['lula', 'bolso'] as Faction[]) {
      const fr = this.w.factions[f];
      if (fr.infinite) {
        for (const k of RES_KEYS) fr.res[k] = 99999;
        continue;
      }
      for (const k of RES_KEYS) fr.res[k] = Math.max(0, fr.res[k] + (fr.income[k] - fr.upkeep[k]) * dt);
    }
  }

  private updateBuffs(dt: number): void {
    for (const f of ['lula', 'bolso'] as Faction[]) {
      const fr = this.w.factions[f];
      const b = fr.buffs;
      b.speedT = Math.max(0, b.speedT - dt);
      b.dmgT = Math.max(0, b.dmgT - dt);
      b.prodT = Math.max(0, b.prodT - dt);
      b.defT = Math.max(0, b.defT - dt);
      b.coordT = Math.max(0, b.coordT - dt);
      fr.crisisT = Math.max(0, fr.crisisT - dt);
      for (const a of fr.abilities) {
        a.cd = Math.max(0, a.cd - dt);
        a.active = Math.max(0, a.active - dt);
      }
    }
  }

  private updateProduction(dt: number): void {
    for (const s of this.w.states) {
      if (s.owner === 'neutral') continue;
      const fr = this.w.factions[s.owner];
      const fast = fr.infinite ? 6 : 1;
      if (s.cons) {
        s.cons.t += dt * (0.5 + 0.5 * fr.prodMul) * fast;
        if (s.cons.t >= s.cons.total) {
          const type = s.cons.type;
          s.b[type] = Math.min(BUILDING_DEFS[type].maxLevel, s.b[type] + 1);
          s.cons = null;
          if (type === 'fort') {
            const old = s.gMax;
            s.gMax = garrisonMax(s, this.map);
            s.gHp += s.gMax - old;
          }
          this.emit({ k: 'built', s: s.i, b: type, f: s.owner });
          this.log(`${BUILDING_DEFS[type].name} concluído(a) em ${this.stateName(s.i)}.`, 'build', s.owner, s.i);
        }
      }
      const q = s.queue[0];
      if (q) {
        q.t += dt * fr.prodMul * (fr.buffs.prodT > 0 ? 1.8 : 1) * (fr.crisisT > 0 ? 0.7 : 1) * fast;
        if (q.t >= q.total) {
          s.queue.shift();
          const u = this.spawnUnit(q.type, s.owner, s.i);
          fr.stats.produced++;
          if (s.rally) this.orderMove(u, s.rally.x, s.rally.y, true);
        }
      }
    }
  }

  spawnUnit(type: UnitType, f: Owner, s: number): Unit {
    const c = this.capital(s);
    const p = spotNear(this.w, this.map, c.x, c.y, 32);
    const u = makeUnit(this.w, type, f, p.x, p.y, s);
    if (UNIT_DEFS[type].air) { u.x = c.x + (rand(this.w) - 0.5) * 30; u.y = c.y + (rand(this.w) - 0.5) * 30; u.px = u.x; u.py = u.y; }
    this.w.units.push(u);
    this.byId.set(u.id, u);
    this.emit({ k: 'spawn', id: u.id, f, s });
    return u;
  }

  // ------------------------------------------------------------------ suprimento e cura
  private updateSupplyAndHealing(dt: number): void {
    const w = this.w, map = this.map;
    // apoio logístico: posições
    const supports = w.units.filter((u) => u.type === 'support' && u.hp > 0);
    for (const u of w.units) {
      if (u.hp <= 0) continue;
      u.st = map.stateAt(u.x, u.y);
      const def = UNIT_DEFS[u.type];
      if (u.f === 'neutral') { u.supplied = true; continue; }
      const fr = w.factions[u.f];
      if (def.air) { u.supplied = fr.res.supplies > 0 || fr.infinite; continue; }
      let ok = false;
      if (u.st >= 0) {
        const s = w.states[u.st];
        if (s.owner === u.f && s.connected) ok = true;
        else if (map.states[u.st].adj.some((n) => w.states[n].owner === u.f && w.states[n].connected)) ok = true;
      }
      if (!ok) ok = supports.some((sp) => sp.f === u.f && (sp.x - u.x) ** 2 + (sp.y - u.y) ** 2 < 170 * 170);
      if (fr.res.supplies <= 0 && !fr.infinite) ok = false;
      u.supplied = ok;

      // cura / atrito
      if (!ok) {
        if (u.hp > u.maxHp * 0.2) u.hp = Math.max(u.maxHp * 0.2, u.hp - 1.0 * dt);
      } else if (u.st >= 0 && w.states[u.st].owner === u.f && w.time - u.lastHitT > 6) {
        const rate = w.states[u.st].b.depot ? 4 : 1.5;
        u.hp = Math.min(u.maxHp, u.hp + rate * dt);
      }
    }
    // apoio: repara unidades e guarnições
    for (const sp of supports) {
      const def = UNIT_DEFS.support;
      this.hash.query(sp.x, sp.y, def.healRadius, (o) => {
        if (o.f !== sp.f || o.hp <= 0 || o.hp >= o.maxHp || o === sp) return;
        if ((o.x - sp.x) ** 2 + (o.y - sp.y) ** 2 > def.healRadius ** 2) return;
        o.hp = Math.min(o.maxHp, o.hp + def.heal * dt);
      });
      if (sp.st >= 0) {
        const s = w.states[sp.st];
        const c = this.capital(sp.st);
        if (s.owner === sp.f && Math.hypot(c.x - sp.x, c.y - sp.y) < def.healRadius) s.gHp = Math.min(s.gMax, s.gHp + 10 * dt);
      }
      // apoio também cura a si mesmo devagar
      if (sp.hp < sp.maxHp) sp.hp = Math.min(sp.maxHp, sp.hp + 2 * dt);
    }
  }

  // ------------------------------------------------------------------ unidades
  private setPath(u: Unit, x: number, y: number): void {
    if (UNIT_DEFS[u.type].air) {
      u.path = [x, y];
    } else {
      u.path = this.nav.find(u.x, u.y, x, y, this.w.tick);
    }
    u.pi = 0;
    u.moving = !!u.path;
  }

  orderMove(u: Unit, x: number, y: number, aggressive: boolean): void {
    if (u.type === 'militia') return;
    u.order = { kind: 'move', x, y, aggressive };
    u.target = null;
    if (u.type === 'plane') {
      if (u.phase === 'rearm') return; // decola quando terminar de rearmar
      u.phase = 'sortie';
    }
    this.setPath(u, x, y);
  }

  orderAttack(u: Unit, target: TargetRef): void {
    if (u.type === 'militia' || u.type === 'support') return;
    const def = UNIT_DEFS[u.type];
    const t = this.resolve(target);
    if (!t || !t.alive || def.vs[t.armor] <= 0) return;
    u.order = { kind: 'attack', target };
    u.target = target;
    if (u.type === 'plane' && u.phase !== 'rearm') u.phase = 'sortie';
    this.setPath(u, t.x, t.y);
    u.repathT = 1.5;
  }

  private stopUnit(u: Unit): void {
    u.order = { kind: 'idle' };
    u.path = null;
    u.moving = false;
    u.anchorX = u.x;
    u.anchorY = u.y;
  }

  private followPath(u: Unit, speed: number, dt: number): boolean {
    if (!u.path || u.pi >= u.path.length) { u.moving = false; return true; }
    let remaining = speed * dt;
    while (remaining > 0 && u.pi < u.path.length) {
      const tx = u.path[u.pi], ty = u.path[u.pi + 1];
      const dx = tx - u.x, dy = ty - u.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.01) u.angle = Math.atan2(dy, dx);
      if (d <= remaining) {
        u.x = tx; u.y = ty;
        u.pi += 2;
        remaining -= d;
      } else {
        u.x += (dx / d) * remaining;
        u.y += (dy / d) * remaining;
        remaining = 0;
      }
    }
    u.moving = u.pi < u.path.length;
    return !u.moving;
  }

  /** Procura o melhor alvo dentro do raio de visão. */
  private acquire(u: Unit, def: UnitDef, radius: number): TargetRef | null {
    let best: TargetRef | null = null;
    let bestScore = Infinity;
    const leashFromHome = u.type === 'militia' ? u.home : -1;
    this.hash.query(u.x, u.y, radius, (o) => {
      if (o.hp <= 0 || o.f === u.f) return;
      const od = UNIT_DEFS[o.type];
      if (def.vs[od.armor] <= 0) return;
      const d = Math.hypot(o.x - u.x, o.y - u.y);
      if (d > radius) return;
      if (leashFromHome >= 0 && this.map.stateAt(o.x, o.y) !== leashFromHome) return;
      let score = d + (d > def.range ? 60 : 0) + (o.hp / o.maxHp) * 25;
      if (od.damage <= 0) score += 40; // unidades desarmadas por último
      if (u.type === 'artillery' && d < def.minRange) return;
      if (u.type === 'plane' && od.air) score -= 50; // superioridade aérea
      if (u.type === 'heli' && o.type === 'tank') score -= 30;
      if (score < bestScore) { bestScore = score; best = { t: 'u', id: o.id }; }
    });
    if (def.vs.structure > 0 && u.type !== 'militia') {
      for (const s of this.w.states) {
        if (s.owner === u.f || s.gHp <= 0) continue;
        const c = this.capital(s.i);
        const d = Math.hypot(c.x - u.x, c.y - u.y);
        if (d > radius) continue;
        let score = d + 30 + (d > def.range ? 60 : 0);
        if (u.type === 'artillery') score -= 80;
        if (score < bestScore) { bestScore = score; best = { t: 'b', s: s.i }; }
      }
    }
    return best;
  }

  private inRange(u: Unit, def: UnitDef, t: TargetInfo): boolean {
    const d = Math.hypot(t.x - u.x, t.y - u.y);
    return d <= def.range + (t.armor === 'structure' ? 6 : 0) && d >= def.minRange;
  }

  private fire(u: Unit, def: UnitDef, ref: TargetRef, t: TargetInfo): void {
    u.cd = def.cooldown * (0.95 + rand(this.w) * 0.1);
    u.lastFireT = this.w.time;
    u.angle = Math.atan2(t.y - u.y, t.x - u.x);
    if (u.type === 'plane') u.ammo--;
    const dmg = def.damage * def.vs[t.armor] * this.damageMul(u) * (0.85 + rand(this.w) * 0.3);
    if (def.splash > 0) {
      const spread = ref.t === 'u' ? 14 : 8;
      const x1 = t.x + (rand(this.w) - 0.5) * spread, y1 = t.y + (rand(this.w) - 0.5) * spread;
      const dur = 0.6 + Math.hypot(x1 - u.x, y1 - u.y) / 380;
      this.w.shells.push({ x0: u.x, y0: u.y, x1, y1, t: 0, dur, dmg: def.damage * this.damageMul(u), f: u.f, splash: def.splash, src: u.id });
      this.emit({ k: 'shell', x1: u.x, y1: u.y, x2: x1, y2: y1, dur, f: u.f });
      return;
    }
    this.emit({ k: 'shot', x1: u.x, y1: u.y, x2: t.x, y2: t.y, ut: u.type, f: u.f });
    this.applyDamage(ref, dmg, u.f, u);
  }

  /** Aplica dano a uma unidade ou guarnição, com todos os modificadores defensivos. */
  applyDamage(ref: TargetRef, dmg: number, by: Owner, src: Unit | null): void {
    const w = this.w;
    if (ref.t === 'u') {
      const v = this.unit(ref.id);
      if (!v) return;
      const vf = this.fac(v.f);
      let m = 1;
      const st = this.map.stateAt(v.x, v.y);
      if (vf && vf.buffs.defT > 0 && st >= 0 && w.states[st].owner === v.f) m *= 0.6;
      if (st >= 0 && w.states[st].owner === v.f && w.states[st].b.fort > 0) {
        const c = this.capital(st);
        if (Math.hypot(c.x - v.x, c.y - v.y) < 110) m *= 1 - 0.08 * w.states[st].b.fort;
      }
      const real = Math.min(v.hp, dmg * m);
      v.hp -= dmg * m;
      v.lastHitT = w.time;
      const bf = this.fac(by);
      if (bf) bf.stats.damage += real;
      if (st >= 0) {
        w.states[st].lastCombatT = w.time;
        if (w.states[st].owner === v.f) this.raiseAlert(st, by);
      }
      // revida automaticamente se estiver ocioso
      if (src && v.hp > 0 && !v.target && v.order.kind !== 'move') {
        const vd = UNIT_DEFS[v.type];
        if (vd.vs[UNIT_DEFS[src.type].armor] > 0) v.target = { t: 'u', id: src.id };
      }
      if (v.hp <= 0) {
        if (src) src.kills++;
        if (bf) bf.stats.killed++;
        if (vf) vf.stats.lost++;
      }
    } else {
      const s = w.states[ref.s];
      if (!s || s.gHp <= 0) return;
      const sf = this.fac(s.owner);
      let m = 1;
      if (sf && sf.buffs.defT > 0) m *= 0.5;
      const before = s.gHp;
      s.gHp = Math.max(0, s.gHp - dmg * m);
      s.lastAttackT = w.time;
      s.lastCombatT = w.time;
      const bf = this.fac(by);
      if (bf) bf.stats.damage += before - s.gHp;
      this.raiseAlert(s.i, by);
      if (s.gHp <= 0) {
        this.emit({ k: 'garrisonDown', s: s.i });
        this.emit({ k: 'boom', x: this.capital(s.i).x, y: this.capital(s.i).y, size: 2 });
        this.log(`A guarnição de ${this.stateName(s.i)} foi neutralizada!`, 'combat', by, s.i);
      }
    }
  }

  private raiseAlert(s: number, by: Owner): void {
    const st = this.w.states[s];
    if (st.owner === 'neutral' || by === st.owner) return;
    if (this.w.time - st.alertT < 25) return;
    st.alertT = this.w.time;
    this.emit({ k: 'alert', s, victim: st.owner, by });
    this.log(`⚠ Ataque em ${this.stateName(s)}!`, 'alert', st.owner, s);
  }

  private updateUnit(u: Unit, dt: number): void {
    const def = UNIT_DEFS[u.type];
    if (u.type === 'plane') { this.updatePlane(u, def, dt); return; }
    u.cd -= dt;
    u.repathT -= dt;
    const speed = this.speedOf(u, def);

    if (u.type === 'support') {
      if (u.order.kind === 'move') { if (this.followPath(u, speed, dt)) this.stopUnit(u); }
      return;
    }

    // validação do alvo atual
    let tinfo = this.resolve(u.target);
    if (u.target && (!tinfo || !tinfo.alive || tinfo.owner === u.f)) { u.target = null; tinfo = null; }

    const order = u.order;
    if (order.kind === 'attack') {
      const t = this.resolve(order.target);
      if (!t || !t.alive || t.owner === u.f) { this.stopUnit(u); u.target = null; return; }
      u.target = order.target;
      if (this.inRange(u, def, t)) {
        u.moving = false;
        if (u.cd <= 0) this.fire(u, def, order.target, t);
      } else {
        if (u.repathT <= 0 || !u.path) {
          u.repathT = 1.2;
          if (def.minRange > 0 && Math.hypot(t.x - u.x, t.y - u.y) < def.minRange) {
            const a = Math.atan2(u.y - t.y, u.x - t.x);
            this.setPath(u, u.x + Math.cos(a) * 50, u.y + Math.sin(a) * 50);
          } else this.setPath(u, t.x, t.y);
        }
        this.followPath(u, speed, dt);
      }
      return;
    }

    // aquisição automática
    u.scanT -= dt;
    if (u.scanT <= 0) {
      u.scanT = 0.4 + rand(this.w) * 0.25;
      const aggressive = order.kind === 'idle' || order.kind === 'hold' || (order.kind === 'move' && order.aggressive);
      const radius = order.kind === 'hold' || (order.kind === 'move' && !order.aggressive) ? def.range : def.sight;
      if (aggressive || order.kind === 'move') {
        const keep = tinfo && Math.hypot(tinfo.x - u.x, tinfo.y - u.y) <= radius && this.inRange(u, def, tinfo);
        if (!keep) {
          const best = this.acquire(u, def, radius);
          if (best) { u.target = best; tinfo = this.resolve(best); }
          else if (!tinfo || Math.hypot(tinfo.x - u.x, tinfo.y - u.y) > def.sight * 1.3) { u.target = null; tinfo = null; }
        }
      }
    }

    if (order.kind === 'move') {
      if (tinfo && u.target) {
        if (this.inRange(u, def, tinfo)) {
          if (u.cd <= 0 && !(u.type === 'artillery' && u.moving && !order.aggressive)) this.fire(u, def, u.target, tinfo);
          if (order.aggressive) { u.moving = false; return; } // para e luta
        } else if (order.aggressive) {
          // persegue o alvo próximo e depois retoma a rota
          const d = Math.hypot(tinfo.x - u.x, tinfo.y - u.y);
          if (d <= def.sight * 1.2) {
            this.stepToward(u, tinfo.x, tinfo.y, speed, dt);
            u.path = null; // recalcula a rota ao terminar
            return;
          }
        }
      }
      if (!u.path) this.setPath(u, order.x, order.y);
      if (this.followPath(u, speed, dt)) this.stopUnit(u);
      return;
    }

    // ocioso / manter posição
    if (tinfo && u.target) {
      if (this.inRange(u, def, tinfo)) {
        u.moving = false;
        if (u.cd <= 0) this.fire(u, def, u.target, tinfo);
        return;
      }
      if (order.kind === 'idle') {
        const leash = u.type === 'militia' ? 130 : 170;
        const homeOk = u.type !== 'militia' || this.map.stateAt(tinfo.x, tinfo.y) === u.home;
        if (Math.hypot(tinfo.x - u.anchorX, tinfo.y - u.anchorY) < leash && homeOk) {
          if (def.minRange > 0 && Math.hypot(tinfo.x - u.x, tinfo.y - u.y) < def.minRange) {
            const a = Math.atan2(u.y - tinfo.y, u.x - tinfo.x);
            this.stepToward(u, u.x + Math.cos(a) * 20, u.y + Math.sin(a) * 20, speed, dt);
          } else this.stepToward(u, tinfo.x, tinfo.y, speed, dt);
          return;
        }
        u.target = null;
      }
    }
    // volta para a âncora se se afastou
    if (order.kind === 'idle') {
      const d = Math.hypot(u.anchorX - u.x, u.anchorY - u.y);
      if (d > 12) this.stepToward(u, u.anchorX, u.anchorY, speed * 0.8, dt);
      else u.moving = false;
    }
  }

  /** Movimento direto curto (perseguição local), respeitando terreno para unidades terrestres. */
  private stepToward(u: Unit, x: number, y: number, speed: number, dt: number): void {
    const dx = x - u.x, dy = y - u.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.5) return;
    const step = Math.min(d, speed * dt);
    const nx = u.x + (dx / d) * step, ny = u.y + (dy / d) * step;
    u.angle = Math.atan2(dy, dx);
    if (UNIT_DEFS[u.type].air || this.map.isWalkable(nx, ny)) { u.x = nx; u.y = ny; u.moving = true; }
    else u.moving = false;
  }

  private planeHome(u: Unit): number {
    const f = u.f;
    let best = -1, bd = Infinity;
    for (const s of this.w.states) {
      if (s.owner !== f) continue;
      const c = this.capital(s.i);
      const d = Math.hypot(c.x - u.x, c.y - u.y) - (s.b.airbase ? 100000 : 0);
      if (d < bd) { bd = d; best = s.i; }
    }
    return best;
  }

  private updatePlane(u: Unit, def: UnitDef, dt: number): void {
    const w = this.w;
    u.cd -= dt;
    const speed = this.speedOf(u, def);
    if (u.home < 0 || w.states[u.home].owner !== u.f) u.home = this.planeHome(u);
    const home = u.home >= 0 ? this.capital(u.home) : { x: u.x, y: u.y };

    if (u.phase === 'rearm') {
      u.rearmT -= dt;
      u.x = home.x + 6; u.y = home.y - 6;
      u.hp = Math.min(u.maxHp, u.hp + 8 * dt);
      if (u.rearmT <= 0) {
        u.phase = 'ready';
        u.ammo = def.ammo;
        u.fuel = def.fuel;
        // se recebeu ordem durante o rearme, decola
        if (u.order.kind === 'move' || u.order.kind === 'attack') {
          u.phase = 'sortie';
          const t = u.order.kind === 'move' ? { x: u.order.x, y: u.order.y } : this.resolve(u.order.target);
          if (t) this.setPath(u, t.x, t.y); else this.stopUnit(u);
        }
      }
      return;
    }

    if (u.phase === 'ready') {
      // estacionado na base: intercepta ameaças próximas
      u.fuel = def.fuel;
      u.scanT -= dt;
      if (u.scanT <= 0) {
        u.scanT = 0.6;
        const t = this.acquire(u, def, 260);
        if (t) { u.phase = 'sortie'; u.order = { kind: 'attack', target: t }; u.target = t; }
      }
      // circula sobre a base
      const a = w.time * 1.6 + u.id;
      this.stepToward(u, home.x + Math.cos(a) * 26, home.y + Math.sin(a) * 26, speed * 0.4, dt);
      return;
    }

    u.fuel -= dt;
    const distHome = Math.hypot(home.x - u.x, home.y - u.y);
    if (u.phase === 'sortie' && (u.ammo <= 0 || u.fuel <= distHome / speed + 2)) {
      u.phase = 'rtb';
      u.target = null;
    }

    if (u.phase === 'rtb' || u.order.kind === 'rtb') {
      u.phase = 'rtb';
      this.stepToward(u, home.x, home.y, speed, dt);
      if (Math.hypot(home.x - u.x, home.y - u.y) < 8) {
        const fr = this.w.factions[u.f as Faction];
        const hasBase = u.home >= 0 && w.states[u.home].b.airbase > 0;
        u.phase = 'rearm';
        u.rearmT = hasBase ? 10 : 22;
        if (fr && !fr.infinite) {
          if (fr.res.fuel >= 10) fr.res.fuel -= 10; else u.rearmT += 10;
        }
        if (u.order.kind === 'rtb') u.order = { kind: 'idle' };
        if (u.order.kind === 'attack') u.order = { kind: 'idle' };
      }
      return;
    }

    // sortie: ataque
    let tinfo = this.resolve(u.target);
    if (u.target && (!tinfo || !tinfo.alive || tinfo.owner === u.f)) { u.target = null; tinfo = null; }
    if (u.order.kind === 'attack') {
      const t = this.resolve(u.order.target);
      if (!t || !t.alive) { u.order = { kind: 'idle' }; u.target = null; }
      else { u.target = u.order.target; tinfo = t; }
    }
    u.scanT -= dt;
    if (!u.target && u.scanT <= 0) {
      u.scanT = 0.4;
      const t = this.acquire(u, def, def.sight);
      if (t) { u.target = t; tinfo = this.resolve(t); }
    }
    if (u.target && tinfo) {
      const d = Math.hypot(tinfo.x - u.x, tinfo.y - u.y);
      if (d <= def.range && u.cd <= 0) this.fire(u, def, u.target, tinfo);
      // passadas de ataque: mergulha no alvo e contorna
      const a = Math.atan2(tinfo.y - u.y, tinfo.x - u.x) + (d < 30 ? 1.2 : 0);
      this.stepToward(u, u.x + Math.cos(a) * 50, u.y + Math.sin(a) * 50, speed, dt);
      return;
    }
    if (u.order.kind === 'move') {
      const d = Math.hypot(u.order.x - u.x, u.order.y - u.y);
      if (d > 30) { this.stepToward(u, u.order.x, u.order.y, speed, dt); return; }
      const a = w.time * 2.2 + u.id;
      this.stepToward(u, u.order.x + Math.cos(a) * 40, u.order.y + Math.sin(a) * 40, speed * 0.7, dt);
      return;
    }
    // sem ordens: volta para a base
    u.phase = 'rtb';
  }

  /** Separação simples entre unidades terrestres para evitar empilhamento. */
  private separate(dt: number): void {
    const R = 9;
    for (const u of this.w.units) {
      if (u.hp <= 0 || UNIT_DEFS[u.type].air) continue;
      let px = 0, py = 0;
      this.hash.query(u.x, u.y, R, (o) => {
        if (o === u || o.hp <= 0 || UNIT_DEFS[o.type].air) return;
        const dx = u.x - o.x, dy = u.y - o.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= R * R) return;
        if (d2 < 0.0001) { px += (u.id % 7) - 3; py += (u.id % 5) - 2; return; }
        const d = Math.sqrt(d2);
        const push = (R - d) / R;
        px += (dx / d) * push;
        py += (dy / d) * push;
      });
      if (px || py) {
        const nx = u.x + px * 18 * dt, ny = u.y + py * 18 * dt;
        if (this.map.isWalkable(nx, ny)) { u.x = nx; u.y = ny; }
      }
    }
  }

  private updateShells(dt: number): void {
    const w = this.w;
    for (let i = w.shells.length - 1; i >= 0; i--) {
      const sh = w.shells[i];
      sh.t += dt;
      if (sh.t < sh.dur) continue;
      w.shells.splice(i, 1);
      this.emit({ k: 'boom', x: sh.x1, y: sh.y1, size: sh.splash > 35 ? 1.6 : 1.2 });
      const src = sh.src ? this.unit(sh.src) ?? null : null;
      this.hash.query(sh.x1, sh.y1, sh.splash, (o) => {
        if (o.hp <= 0 || o.f === sh.f) return;
        const od = UNIT_DEFS[o.type];
        if (od.air) return;
        const d = Math.hypot(o.x - sh.x1, o.y - sh.y1);
        if (d > sh.splash) return;
        const art = UNIT_DEFS.artillery.vs;
        this.applyDamage({ t: 'u', id: o.id }, sh.dmg * art[od.armor] * (1 - 0.5 * (d / sh.splash)), sh.f, src);
      });
      for (const s of w.states) {
        if (s.owner === sh.f || s.gHp <= 0) continue;
        const c = this.capital(s.i);
        if (Math.hypot(c.x - sh.x1, c.y - sh.y1) <= sh.splash + 16) {
          this.applyDamage({ t: 'b', s: s.i }, sh.dmg * UNIT_DEFS.artillery.vs.structure, sh.f, src);
        }
      }
    }
  }

  private updateGarrisons(dt: number): void {
    const w = this.w;
    for (const s of w.states) {
      const c = this.capital(s.i);
      const fr = this.fac(s.owner);
      // regeneração quando não há combate
      if (w.time - s.lastAttackT > 6 && s.gHp < s.gMax) {
        let enemyNear = false;
        this.hash.query(c.x, c.y, 140, (o) => { if (o.f !== s.owner && o.hp > 0 && !UNIT_DEFS[o.type].air) enemyNear = true; });
        if (!enemyNear) s.gHp = Math.min(s.gMax, s.gHp + GARRISON.regen * (s.b.depot ? 2 : 1) * dt);
      }
      if (s.gHp <= 0) continue;
      s.gCd -= dt;
      if (s.gCd > 0) continue;
      let tinfo = this.resolve(s.gTarget);
      if (!tinfo || !tinfo.alive || tinfo.owner === s.owner || Math.hypot(tinfo.x - c.x, tinfo.y - c.y) > GARRISON.range) {
        s.gTarget = null;
        let best: Unit | null = null, bd = Infinity;
        this.hash.query(c.x, c.y, GARRISON.range, (o) => {
          if (o.hp <= 0 || o.f === s.owner) return;
          const d = Math.hypot(o.x - c.x, o.y - c.y);
          if (d <= GARRISON.range && d < bd) { bd = d; best = o; }
        });
        if (best) { s.gTarget = { t: 'u', id: (best as Unit).id }; tinfo = this.resolve(s.gTarget); }
      }
      if (!s.gTarget || !tinfo) { s.gCd = 0.3; continue; }
      s.gCd = GARRISON.cooldown;
      let dmg = (GARRISON.damage + s.b.fort * GARRISON.perFortDmg) * GARRISON.vs[tinfo.armor];
      if (fr && fr.buffs.defT > 0) dmg *= 1.5;
      dmg *= 0.85 + rand(w) * 0.3;
      this.emit({ k: 'shot', x1: c.x, y1: c.y, x2: tinfo.x, y2: tinfo.y, ut: 'base', f: s.owner });
      this.applyDamage(s.gTarget, dmg, s.owner, null);
    }
  }

  private updateCapture(dt: number): void {
    const w = this.w;
    for (const s of w.states) {
      const c = this.capital(s.i);
      let defenders = 0;
      const capt: Record<Faction, number> = { lula: 0, bolso: 0 };
      this.hash.query(c.x, c.y, CAPTURE_R, (o) => {
        if (o.hp <= 0) return;
        const od = UNIT_DEFS[o.type];
        if (od.air) return;
        if (Math.hypot(o.x - c.x, o.y - c.y) > CAPTURE_R) return;
        if (o.f === s.owner) defenders++;
        else if (o.f !== 'neutral' && od.canCapture) capt[o.f]++;
      });
      const factions = (['lula', 'bolso'] as Faction[]).filter((f) => capt[f] > 0);
      if (s.gHp <= 0 && defenders === 0 && factions.length === 1) {
        const f = factions[0];
        if (s.capF !== f) { s.capF = f; s.capP = 0; }
        s.capP += (2 + 1.5 * Math.min(capt[f], 8)) * dt;
        s.lastCombatT = w.time;
        if (s.capP >= 100) this.transferState(s, f);
      } else if (factions.length === 0 || defenders > 0) {
        s.capP = Math.max(0, s.capP - 6 * dt);
        if (s.capP <= 0) s.capF = null;
      }
    }
  }

  transferState(s: StateRT, f: Faction): void {
    const w = this.w;
    const from = s.owner;
    s.owner = f;
    s.b.fort = Math.max(0, s.b.fort - 1);
    s.gMax = garrisonMax(s, this.map);
    s.gHp = Math.round(s.gMax * 0.3);
    s.capP = 0;
    s.capF = null;
    s.queue = [];
    s.cons = null;
    s.rally = null;
    s.gTarget = null;
    s.capturedT = w.time;
    s.lastAttackT = w.time;
    w.factions[f].stats.captured++;
    this.emit({ k: 'capture', s: s.i, f, from });
    const fromName = from === 'neutral' ? 'forças locais' : FACTIONS[from].name;
    this.log(`${FACTIONS[f].name} capturou ${this.stateName(s.i)} (${fromName}).`, 'capture', f, s.i);
    if (from !== 'neutral') {
      const fr = w.factions[from];
      fr.stats.statesLost++;
      const ai = w.ai[from];
      if (ai) ai.lost.push({ s: s.i, t: w.time });
      if (fr.hq === s.i) {
        const remaining = this.statesOf(from);
        if (remaining.length) {
          const nh = remaining.sort((a, b) => this.map.states[b].info.imp - this.map.states[a].info.imp)[0];
          fr.hq = nh;
          fr.crisisT = 60;
          this.emit({ k: 'hqLost', f: from, s: s.i, newHq: nh });
          this.log(`A sede de ${FACTIONS[from].name} caiu! Governo transferido para ${this.stateName(nh)} (crise de 60 s).`, 'alert', from, nh);
        }
      }
    }
    this.recomputeEconomy();
  }

  private removeDead(): void {
    const w = this.w;
    let any = false;
    for (const u of w.units) {
      if (u.hp > 0) continue;
      any = true;
      this.byId.delete(u.id);
      this.emit({ k: 'death', x: u.x, y: u.y, ut: u.type, f: u.f });
      if (u.type !== 'infantry' && u.type !== 'militia') this.emit({ k: 'boom', x: u.x, y: u.y, size: u.type === 'tank' ? 1.5 : 1.1 });
    }
    if (any) w.units = w.units.filter((u) => u.hp > 0);
  }

  // ------------------------------------------------------------------ objetivos e vitória
  private checkObjectives(): void {
    for (const f of ['lula', 'bolso'] as Faction[]) {
      const fr = this.w.factions[f];
      for (const o of OBJECTIVES) {
        if (fr.objectives.includes(o.id)) continue;
        if (!o.check(this, f)) continue;
        fr.objectives.push(o.id);
        if (!fr.infinite) for (const k of RES_KEYS) fr.res[k] += o.reward[k];
        this.emit({ k: 'objective', f, id: o.id });
        this.log(`Objetivo cumprido por ${FACTIONS[f].short}: ${o.name}.`, 'objective', f);
      }
    }
  }

  checkVictory(): void {
    const w = this.w;
    if (w.winner) return;
    const total = this.map.states.length;
    const count = { lula: this.statesOf('lula').length, bolso: this.statesOf('bolso').length };
    for (const f of ['lula', 'bolso'] as Faction[]) {
      const e = enemyOf(f);
      if (count[f] === total) return this.endGame(f, `${FACTIONS[f].name} conquistou os 26 estados e o Distrito Federal.`);
      if (count[e] === 0) return this.endGame(f, `${FACTIONS[e].name} perdeu todos os seus territórios.`);
      if (count[e] <= 2 && count[f] >= 15) {
        w.factions[e].surrendered = true;
        return this.endGame(f, `${FACTIONS[e].name} se rendeu: restavam apenas ${count[e]} estado(s) contra ${count[f]}.`);
      }
    }
  }

  surrender(f: Faction): void {
    if (this.w.winner) return;
    this.w.factions[f].surrendered = true;
    this.endGame(enemyOf(f), `${FACTIONS[f].name} assinou a rendição.`);
  }

  private endGame(winner: Faction, reason: string): void {
    this.w.winner = winner;
    this.w.endReason = reason;
    this.log(reason, 'info', winner);
    this.emit({ k: 'gameover', winner, reason });
  }

  // ------------------------------------------------------------------ comandos (jogador e IA)
  /** Unidades controláveis por uma facção, a partir de uma lista de ids. */
  own(f: Faction, ids: number[]): Unit[] {
    const out: Unit[] = [];
    for (const id of ids) {
      const u = this.unit(id);
      if (u && u.f === f && u.type !== 'militia') out.push(u);
    }
    return out;
  }

  commandMove(f: Faction, ids: number[], x: number, y: number, aggressive: boolean): number {
    const units = this.own(f, ids);
    // formação em espiral (Vogel) ao redor do destino
    const ground = units.filter((u) => !UNIT_DEFS[u.type].air);
    const air = units.filter((u) => UNIT_DEFS[u.type].air);
    ground.sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
    ground.forEach((u, i) => {
      const r = 10 * Math.sqrt(i), th = i * 2.39996;
      let tx = x + Math.cos(th) * r, ty = y + Math.sin(th) * r;
      if (!this.map.isWalkable(tx, ty)) { const p = this.map.nearestWalkable(tx, ty); tx = p.x; ty = p.y; }
      this.orderMove(u, tx, ty, aggressive);
      u.anchorX = tx; u.anchorY = ty;
    });
    air.forEach((u, i) => {
      const r = 14 * Math.sqrt(i), th = i * 2.39996;
      this.orderMove(u, x + Math.cos(th) * r, y + Math.sin(th) * r, aggressive);
    });
    return units.length;
  }

  commandAttack(f: Faction, ids: number[], target: TargetRef): number {
    let n = 0;
    for (const u of this.own(f, ids)) {
      const before = u.order;
      this.orderAttack(u, target);
      if (u.order !== before) n++;
      else if (UNIT_DEFS[u.type].damage > 0) {
        // não pode atingir este alvo: avança até ele
        const t = this.resolve(target);
        if (t) this.orderMove(u, t.x, t.y, true);
      }
    }
    return n;
  }

  commandStop(f: Faction, ids: number[], hold = false): void {
    for (const u of this.own(f, ids)) {
      if (u.type === 'plane') {
        if (u.phase === 'sortie') { u.phase = 'rtb'; u.order = { kind: 'rtb' }; }
        continue;
      }
      this.stopUnit(u);
      u.target = null;
      if (hold) u.order = { kind: 'hold' };
    }
  }

  commandRTB(f: Faction, ids: number[]): void {
    for (const u of this.own(f, ids)) {
      if (u.type !== 'plane') continue;
      if (u.phase === 'sortie' || u.phase === 'ready') { u.phase = 'rtb'; u.order = { kind: 'rtb' }; u.target = null; }
    }
  }

  canCommand(f: Faction): boolean {
    const w = this.w;
    if (w.winner) return false;
    if (w.turn) return w.turn.phase === 'plan' && w.turn.active === f;
    return true;
  }

  recruitCheck(f: Faction, si: number, type: UnitType): string | null {
    const s = this.w.states[si];
    const fr = this.w.factions[f];
    if (!s || s.owner !== f) return 'Estado não pertence a você.';
    if (!RECRUITABLE.includes(type)) return 'Unidade inválida.';
    const def = UNIT_DEFS[type];
    if (def.requires && s.b[def.requires] <= 0) return `Requer ${BUILDING_DEFS[def.requires].name} neste estado.`;
    if (s.queue.length >= 6) return 'Fila de produção cheia (máx. 6).';
    if (fr.pop + def.pop > fr.popCap) return 'Limite de tropas atingido. Conquiste estados ou construa Quartéis/Depósitos.';
    if (!this.canAfford(f, this.costOf(f, type))) return 'Recursos insuficientes.';
    return null;
  }

  recruit(f: Faction, si: number, type: UnitType): string | null {
    const err = this.recruitCheck(f, si, type);
    if (err) return err;
    const cost = this.costOf(f, type);
    this.pay(f, cost);
    const s = this.w.states[si];
    s.queue.push({ type, t: 0, total: UNIT_DEFS[type].buildTime, paid: cost });
    this.w.factions[f].pop += UNIT_DEFS[type].pop;
    return null;
  }

  cancelRecruit(f: Faction, si: number, index: number): void {
    const s = this.w.states[si];
    if (!s || s.owner !== f || !s.queue[index]) return;
    const [q] = s.queue.splice(index, 1);
    this.refund(f, q.paid);
    this.w.factions[f].pop -= UNIT_DEFS[q.type].pop;
  }

  buildCost(si: number, type: BuildingType): Res | null {
    const s = this.w.states[si];
    const def = BUILDING_DEFS[type];
    const lvl = s.b[type];
    if (lvl >= def.maxLevel) return null;
    return def.cost[lvl];
  }

  usedSlots(si: number): number {
    const s = this.w.states[si];
    return s.b.barracks + s.b.factory + s.b.airbase + s.b.depot + (s.cons && BUILDING_DEFS[s.cons.type].usesSlot ? 1 : 0);
  }

  slots(si: number): number {
    return slotsFor(this.map.states[si].info.imp);
  }

  buildCheck(f: Faction, si: number, type: BuildingType): string | null {
    const s = this.w.states[si];
    if (!s || s.owner !== f) return 'Estado não pertence a você.';
    if (s.cons) return 'Já há uma obra em andamento neste estado.';
    const def = BUILDING_DEFS[type];
    if (s.b[type] >= def.maxLevel) return 'Nível máximo atingido.';
    if (def.usesSlot && this.usedSlots(si) >= this.slots(si)) return 'Sem espaço para novas construções neste estado.';
    const cost = this.buildCost(si, type)!;
    if (!this.canAfford(f, cost)) return 'Recursos insuficientes.';
    return null;
  }

  build(f: Faction, si: number, type: BuildingType): string | null {
    const err = this.buildCheck(f, si, type);
    if (err) return err;
    const s = this.w.states[si];
    const cost = this.buildCost(si, type)!;
    this.pay(f, cost);
    s.cons = { type, t: 0, total: BUILDING_DEFS[type].time[s.b[type]], paid: cost };
    return null;
  }

  cancelBuild(f: Faction, si: number): void {
    const s = this.w.states[si];
    if (!s || s.owner !== f || !s.cons) return;
    this.refund(f, s.cons.paid);
    s.cons = null;
  }

  /** Mercado de guerra: troca recursos com perda (2 por 1). */
  trade(f: Faction, from: ResKey, to: ResKey, amount: number): string | null {
    const fr = this.w.factions[f];
    if (from === to) return 'Escolha recursos diferentes.';
    if (amount <= 0) return 'Quantidade inválida.';
    if (fr.infinite) return null;
    if (fr.res[from] < amount) return 'Recursos insuficientes.';
    fr.res[from] -= amount;
    fr.res[to] += amount * TRADE_RATE;
    return null;
  }

  setRally(f: Faction, si: number, x: number | null, y = 0): void {
    const s = this.w.states[si];
    if (!s || s.owner !== f) return;
    s.rally = x === null ? null : { x, y };
  }

  abilityCheck(f: Faction, id: AbilityId, si?: number): string | null {
    const fr = this.w.factions[f];
    const a = fr.abilities.find((x) => x.id === id);
    if (!a) return 'Habilidade indisponível.';
    if (a.cd > 0) return `Em recarga (${Math.ceil(a.cd)} s).`;
    if (!this.canAfford(f, ABILITIES[id].cost)) return 'Recursos insuficientes.';
    if (id === 'blindados') {
      if (this.abilityState(f, id, si) < 0) return 'Requer um estado com Fábrica Militar.';
      if (fr.pop + 6 > fr.popCap) return 'Limite de tropas atingido.';
    }
    if (id === 'massa') {
      if (this.abilityState(f, id, si) < 0) return 'Nenhum estado disponível.';
      if (fr.pop + 6 > fr.popCap) return 'Limite de tropas atingido.';
    }
    return null;
  }

  /** Estado usado por habilidades de mobilização. */
  abilityState(f: Faction, id: AbilityId, si?: number): number {
    const w = this.w;
    const ok = (i: number | undefined): boolean =>
      i !== undefined && i >= 0 && w.states[i].owner === f && (id !== 'blindados' || w.states[i].b.factory > 0);
    if (ok(si)) return si!;
    const hq = w.factions[f].hq;
    if (ok(hq)) return hq;
    const list = this.statesOf(f).filter((i) => ok(i));
    return list.length ? list[0] : -1;
  }

  useAbility(f: Faction, id: AbilityId, opts: { x?: number; y?: number; s?: number } = {}): string | null {
    const err = this.abilityCheck(f, id, opts.s);
    if (err) return err;
    const fr = this.w.factions[f];
    const def = ABILITIES[id];
    const a = fr.abilities.find((x) => x.id === id)!;
    if (def.targeted && (opts.x === undefined || opts.y === undefined)) return 'Escolha um ponto no mapa.';
    this.pay(f, def.cost);
    a.cd = def.cooldown;
    a.active = def.duration;
    let x = this.capital(fr.hq).x, y = this.capital(fr.hq).y;
    switch (id) {
      case 'blitz':
        fr.buffs.speedT = def.duration;
        fr.buffs.dmgT = def.duration;
        break;
      case 'industria':
        fr.buffs.prodT = def.duration;
        break;
      case 'ferrea':
        fr.buffs.defT = def.duration;
        break;
      case 'coordenado': {
        x = opts.x!; y = opts.y!;
        fr.buffs.coordT = def.duration;
        fr.buffs.coordX = x;
        fr.buffs.coordY = y;
        for (let i = 0; i < 9; i++) {
          const a2 = rand(this.w) * Math.PI * 2, r = rand(this.w) * 55;
          const x1 = x + Math.cos(a2) * r, y1 = y + Math.sin(a2) * r;
          const dur = 0.9 + i * 0.28;
          this.w.shells.push({ x0: x1 - 300, y0: y1 - 300, x1, y1, t: 0, dur, dmg: 60, f, splash: 38, src: 0 });
          this.emit({ k: 'shell', x1: x1 - 300, y1: y1 - 300, x2: x1, y2: y1, dur, f });
        }
        const ids = this.w.units
          .filter((u) => u.f === f && u.type !== 'support' && u.type !== 'plane' && (u.order.kind === 'idle' || u.order.kind === 'hold') && Math.hypot(u.x - x, u.y - y) < 480)
          .map((u) => u.id);
        this.commandMove(f, ids, x, y, true);
        break;
      }
      case 'blindados':
      case 'massa': {
        const si = this.abilityState(f, id, opts.s);
        const type: UnitType = id === 'blindados' ? 'tank' : 'infantry';
        const n = id === 'blindados' ? 3 : 6;
        for (let i = 0; i < n; i++) {
          this.spawnUnit(type, f, si);
          fr.stats.produced++;
        }
        x = this.capital(si).x; y = this.capital(si).y;
        break;
      }
    }
    this.recomputeEconomy();
    this.emit({ k: 'ability', f, id, x, y });
    this.log(`${f === 'bolso' ? 'Hitler' : 'Stalin'} ativou: ${def.name}.`, 'ability', f);
    return null;
  }

  /** Modo local: encerra o planejamento do jogador ativo. */
  endPlanning(): void {
    const t = this.w.turn;
    if (!t || t.phase !== 'plan') return;
    if (t.active === 'lula') {
      t.active = 'bolso';
      this.emit({ k: 'turn', phase: 'plan', active: 'bolso', n: t.n });
    } else {
      t.phase = 'exec';
      t.t = EXEC_TURN_SECONDS;
      this.emit({ k: 'turn', phase: 'exec', active: 'bolso', n: t.n });
    }
  }

  // ------------------------------------------------------------------ consultas para IA/UI
  powerNear(x: number, y: number, r: number, f: Owner): number {
    let p = 0;
    this.hash.query(x, y, r, (o) => {
      if (o.f !== f || o.hp <= 0) return;
      if ((o.x - x) ** 2 + (o.y - y) ** 2 > r * r) return;
      p += UNIT_DEFS[o.type].power * (o.hp / o.maxHp);
    });
    return p;
  }

  hostilePowerNear(x: number, y: number, r: number, f: Owner): number {
    let p = 0;
    this.hash.query(x, y, r, (o) => {
      if (o.f === f || o.hp <= 0) return;
      if ((o.x - x) ** 2 + (o.y - y) ** 2 > r * r) return;
      p += UNIT_DEFS[o.type].power * (o.hp / o.maxHp);
    });
    return p;
  }

  garrisonPower(si: number): number {
    const s = this.w.states[si];
    return (s.gHp / 140) * (1 + s.b.fort * 0.25);
  }
}
