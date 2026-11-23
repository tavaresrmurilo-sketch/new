// Sincronização de estado: o servidor codifica snapshots compactos por equipe
// (respeitando a névoa de guerra) e o cliente os aplica num mundo espelho.
import type { Game } from '../sim/game';
import { makeUnit } from '../sim/setup';
import { ROLES } from '../sim/rules';
import type {
  BuildingType, Faction, FactionRT, LogEntry, Owner, PlanePhase, Formation, SimEvent, UnitType, World, AbilityId,
} from '../sim/types';

export const UNIT_TYPES: UnitType[] = ['infantry', 'tank', 'artillery', 'heli', 'plane', 'support', 'recon', 'militia'];
const OWNERS: Owner[] = ['lula', 'bolso', 'neutral'];
const PHASES: PlanePhase[] = ['ready', 'sortie', 'rtb', 'rearm'];
const FORMS: Formation[] = ['livre', 'linha', 'coluna', 'dispersa', 'escolta', 'cerco', 'defesa'];
const ORDERS = ['idle', 'hold', 'move', 'attack', 'rtb'] as const;
const BLD: BuildingType[] = ['barracks', 'factory', 'airbase', 'depot', 'fort'];

export const U_STRIDE = 21;
export const S_STRIDE = 18;

export interface Snapshot {
  seq: number;
  full: boolean;
  t: number;
  tick: number;
  u: number[];
  rm: number[];
  s?: number[];
  q?: Record<number, { q: number[]; r: number[] | null }>;
  f: Partial<Record<Faction, Partial<FactionRT>>>;
  sh: number[];
  ev: unknown[];
  log: LogEntry[];
  m: {
    winner: Faction | null;
    draw: boolean;
    reason: string;
    gevents: World['gevents'];
    obj: number;
    reveals: World['reveals'];
  };
}

const q4 = (v: number) => Math.round(v * 4);

/** Codificador por "ponto de vista" (uma equipe ou espectador). */
export class SnapshotEncoder {
  private seq = 0;
  private sent = new Map<number, string>();
  private lastStates = '';
  private lastQ = '';
  private lastLog = 0;

  constructor(private view: Faction | 'spectator') {}

  reset(): void {
    this.sent.clear();
    this.lastStates = '';
    this.lastQ = '';
  }

  /** Gera o próximo snapshot. `full` envia tudo (entrada, reconexão). */
  encode(g: Game, events: SimEvent[], full = false): Snapshot {
    const w = g.w;
    const team = this.view === 'spectator' ? null : this.view;
    if (full) this.reset();
    const seen = new Set<number>();
    const u: number[] = [];
    for (const un of w.units) {
      if (un.hp <= 0) continue;
      const own = team !== null && un.f === team;
      if (team && !own && !g.isVisible(team, un.x, un.y)) continue;
      seen.add(un.id);
      let ok = 0, ox = 0, oy = 0, agg = 0;
      if (own || !team) {
        const o = un.order;
        ok = ORDERS.indexOf(o.kind);
        if (o.kind === 'move') { ox = q4(o.x); oy = q4(o.y); agg = o.aggressive ? 1 : 0; }
        else if (o.kind === 'attack') { const r = g.resolve(o.target); if (r) { ox = q4(r.x); oy = q4(r.y); agg = 1; } }
      }
      const flags = (un.supplied ? 1 : 0) | (un.moving ? 2 : 0) | (un.routed ? 4 : 0) | (w.time - un.lastHitT < 0.15 ? 8 : 0);
      const row = [
        un.id, UNIT_TYPES.indexOf(un.type), OWNERS.indexOf(un.f), q4(un.x), q4(un.y), Math.ceil(un.hp), un.maxHp,
        Math.round(un.angle * 100), flags, ROLES.indexOf(un.ctrl), un.ammo, Math.round(un.xp * 10), Math.round(un.morale),
        PHASES.indexOf(un.phase), ok, ox, oy, agg, un.kills, FORMS.indexOf(un.form), Math.ceil(own || !team ? un.rearmT : 0),
      ];
      const key = row.join(',');
      if (this.sent.get(un.id) !== key) { u.push(...row); this.sent.set(un.id, key); }
    }
    const rm: number[] = [];
    for (const id of this.sent.keys()) if (!seen.has(id)) { rm.push(id); this.sent.delete(id); }

    // estados (públicos)
    const sRows: number[] = [];
    for (const s of w.states) {
      sRows.push(
        OWNERS.indexOf(s.owner), Math.ceil(s.gHp), s.gMax, s.capF ? OWNERS.indexOf(s.capF) : -1, Math.floor(s.capP),
        s.b.barracks, s.b.factory, s.b.airbase, s.b.depot, s.b.fort,
        s.cons ? BLD.indexOf(s.cons.type) : -1, s.cons ? Math.round((s.cons.t / s.cons.total) * 1000) : 0,
        s.connected ? 1 : 0, Math.round(s.lastCombatT * 10), Math.round(s.lastAttackT * 10), Math.round(s.alertT * 10),
        Math.round(s.reserveT * 10), Math.round(s.capturedT * 10),
      );
    }
    const sKey = sRows.join(',');
    const snapS = sKey !== this.lastStates ? sRows : undefined;
    this.lastStates = sKey;

    // filas e pontos de encontro (só da própria equipe)
    const q: Record<number, { q: number[]; r: number[] | null }> = {};
    for (const s of w.states) {
      if (team && s.owner !== team) continue;
      if (!s.queue.length && !s.rally) continue;
      q[s.i] = {
        q: s.queue.flatMap((it) => [UNIT_TYPES.indexOf(it.type), Math.round(it.t * 100), Math.round(it.total * 100)]),
        r: s.rally ? [Math.round(s.rally.x), Math.round(s.rally.y)] : null,
      };
    }
    const qKey = JSON.stringify(q);
    const snapQ = qKey !== this.lastQ ? q : undefined;
    this.lastQ = qKey;

    // facções: a própria completa; a inimiga só com dados públicos
    const f: Snapshot['f'] = {};
    for (const fx of ['lula', 'bolso'] as Faction[]) {
      const fr = w.factions[fx];
      const pub: Partial<FactionRT> = {
        hq: fr.hq, origHq: fr.origHq, stats: fr.stats, objectives: fr.objectives, buffs: fr.buffs, crisisT: fr.crisisT,
        surrendered: fr.surrendered, abilities: fr.abilities,
      };
      f[fx] = !team || team === fx
        ? { ...pub, res: fr.res, income: fr.income, upkeep: fr.upkeep, industry: fr.industry, prodMul: fr.prodMul, pop: fr.pop, popCap: fr.popCap, infinite: fr.infinite }
        : pub;
    }

    // projéteis visíveis
    const sh: number[] = [];
    for (const x of w.shells) {
      if (team && x.f !== team && !g.isVisible(team, x.x1, x.y1) && !g.isVisible(team, x.x0, x.y0)) continue;
      sh.push(Math.round(x.x0), Math.round(x.y0), Math.round(x.x1), Math.round(x.y1), Math.round(x.t * 100), Math.round(x.dur * 100), OWNERS.indexOf(x.f), x.splash);
    }

    // eventos filtrados
    const ev: unknown[] = [];
    let shots = 0;
    const vis = (x: number, y: number) => !team || g.isVisible(team, x, y);
    for (const e of events) {
      switch (e.k) {
        case 'shot':
          if (shots < 90 && (vis(e.x1, e.y1) || vis(e.x2, e.y2))) { shots++; ev.push([Math.round(e.x1), Math.round(e.y1), Math.round(e.x2), Math.round(e.y2), e.ut === 'base' ? -1 : UNIT_TYPES.indexOf(e.ut), OWNERS.indexOf(e.f)]); }
          break;
        case 'shell': break;
        case 'boom': if (vis(e.x, e.y)) ev.push(e); break;
        case 'death': if (vis(e.x, e.y) || e.f === team) ev.push(e); break;
        case 'alert': if (!team || e.victim === team) ev.push(e); break;
        case 'spawn': case 'built': case 'promote': if (!team || e.f === team) ev.push(e); break;
        case 'reveal': if (!team || e.f === team) ev.push(e); break;
        default: ev.push(e);
      }
    }

    // novas entradas do relatório (alertas só para a equipe atacada)
    const newCount = Math.min(g.logCount - this.lastLog, w.log.length);
    const log = (full ? w.log : newCount > 0 ? w.log.slice(-newCount) : []).filter((l) => !team || l.kind !== 'alert' || l.f === team);
    this.lastLog = g.logCount;

    return {
      seq: ++this.seq,
      full,
      t: w.time,
      tick: w.tick,
      u,
      rm,
      s: full ? sRows : snapS,
      q: full ? q : snapQ,
      f,
      sh,
      ev,
      log,
      m: {
        winner: w.winner,
        draw: !!w.draw,
        reason: w.endReason,
        gevents: w.gevents,
        obj: team ? w.teamObjective[team] : -1,
        reveals: team ? w.reveals.filter((r) => r.f === team) : w.reveals,
      },
    };
  }
}

/** Aplica um snapshot ao mundo espelho do cliente. */
export function applySnapshot(g: Game, snap: Snapshot, team: Faction | null): void {
  const w = g.w;
  if (snap.full) w.units = [];
  const byId = new Map(w.units.map((u) => [u.id, u]));
  for (let i = 0; i + U_STRIDE <= snap.u.length; i += U_STRIDE) {
    const r = snap.u.slice(i, i + U_STRIDE);
    const id = r[0];
    const type = UNIT_TYPES[r[1]];
    const owner = OWNERS[r[2]];
    let u = byId.get(id);
    const x = r[3] / 4, y = r[4] / 4;
    if (!u) {
      u = makeUnit(w, type, owner, x, y);
      u.id = id;
      u.px = x; u.py = y;
      w.units.push(u);
      byId.set(id, u);
    } else {
      u.px = u.x; u.py = u.y;
    }
    u.type = type;
    u.f = owner;
    u.x = x; u.y = y;
    u.hp = r[5];
    u.maxHp = r[6];
    u.angle = r[7] / 100;
    u.supplied = !!(r[8] & 1);
    u.moving = !!(r[8] & 2);
    u.routed = !!(r[8] & 4);
    if (r[8] & 8) u.lastHitT = snap.t;
    u.ctrl = ROLES[r[9]] ?? 'infantaria';
    u.ammo = r[10];
    u.xp = r[11] / 10;
    u.morale = r[12];
    u.phase = PHASES[r[13]] ?? 'ready';
    const ok = ORDERS[r[14]] ?? 'idle';
    if (ok === 'move') u.order = { kind: 'move', x: r[15] / 4, y: r[16] / 4, aggressive: !!r[17] };
    else if (ok === 'attack') u.order = { kind: 'move', x: r[15] / 4, y: r[16] / 4, aggressive: true };
    else u.order = { kind: ok } as typeof u.order;
    u.kills = r[18];
    u.form = FORMS[r[19]] ?? 'livre';
    u.rearmT = r[20];
  }
  if (snap.rm.length) {
    const rm = new Set(snap.rm);
    w.units = w.units.filter((u) => !rm.has(u.id));
  }
  // unidades que não se moveram neste snapshot não devem interpolar
  const moved = new Set<number>();
  for (let i = 0; i < snap.u.length; i += U_STRIDE) moved.add(snap.u[i]);
  for (const u of w.units) if (!moved.has(u.id)) { u.px = u.x; u.py = u.y; }

  if (snap.s) {
    for (let i = 0; i < w.states.length; i++) {
      const r = snap.s.slice(i * S_STRIDE, (i + 1) * S_STRIDE);
      const s = w.states[i];
      s.owner = OWNERS[r[0]];
      s.gHp = r[1];
      s.gMax = r[2];
      s.capF = r[3] >= 0 ? OWNERS[r[3]] : null;
      s.capP = r[4];
      BLD.forEach((b, k) => (s.b[b] = r[5 + k]));
      s.cons = r[10] >= 0 ? { type: BLD[r[10]], t: r[11] / 1000, total: 1, paid: { money: 0, fuel: 0, steel: 0, supplies: 0 } } : null;
      s.connected = !!r[12];
      s.lastCombatT = r[13] / 10;
      s.lastAttackT = r[14] / 10;
      s.alertT = r[15] / 10;
      s.reserveT = r[16] / 10;
      s.capturedT = r[17] / 10;
    }
  }
  if (snap.q) {
    for (const s of w.states) {
      if (team && s.owner !== team) { s.queue = []; s.rally = null; continue; }
      const d = snap.q[s.i];
      s.queue = [];
      s.rally = d?.r ? { x: d.r[0], y: d.r[1] } : null;
      if (d) for (let k = 0; k + 3 <= d.q.length; k += 3) {
        s.queue.push({ type: UNIT_TYPES[d.q[k]], t: d.q[k + 1] / 100, total: d.q[k + 2] / 100, paid: { money: 0, fuel: 0, steel: 0, supplies: 0 } });
      }
    }
  }
  for (const fx of ['lula', 'bolso'] as Faction[]) {
    const d = snap.f[fx];
    if (d) Object.assign(w.factions[fx], d);
  }
  w.shells = [];
  for (let i = 0; i + 8 <= snap.sh.length; i += 8) {
    const r = snap.sh;
    w.shells.push({ x0: r[i], y0: r[i + 1], x1: r[i + 2], y1: r[i + 3], t: r[i + 4] / 100, dur: r[i + 5] / 100, f: OWNERS[r[i + 6]], dmg: 0, splash: r[i + 7], src: 0 });
  }
  for (const e of snap.ev) {
    if (Array.isArray(e)) {
      g.emit({ k: 'shot', x1: e[0], y1: e[1], x2: e[2], y2: e[3], ut: e[4] < 0 ? 'base' : UNIT_TYPES[e[4]], f: OWNERS[e[5]] });
    } else g.emit(e as SimEvent);
  }
  if (snap.full) w.log = [];
  for (const l of snap.log) { w.log.push(l); g.logCount++; }
  if (w.log.length > 80) w.log.splice(0, w.log.length - 80);
  w.time = snap.t;
  w.tick = snap.tick;
  w.winner = snap.m.winner;
  w.draw = snap.m.draw;
  w.endReason = snap.m.reason;
  w.gevents = snap.m.gevents;
  w.reveals = snap.m.reveals;
  if (team) w.teamObjective[team] = snap.m.obj;
  g.syncIndex();
  g.invalidateVisibility();
}

export type { AbilityId };
