// IA estratégica. Usa exatamente os mesmos comandos que o jogador (recrutar,
// construir, mover, atacar, habilidades). Decisões por avaliação de ameaças,
// valor dos alvos e relação de forças — nada de movimentos aleatórios.
import { UNIT_DEFS, RECRUITABLE } from '../../data/units';
import { enemyOf } from '../../data/factions';
import type { Game } from '../game';
import type { AIGroup, AIState, BuildingType, Difficulty, Faction, Unit, UnitType } from '../types';

interface Params {
  think: number;
  groupRetreat: boolean;
  maxGroups: number;
  attackRatio: number;
  reserve: number;
  queue: number;
  abilityGap: number;
  micro: boolean;
  maxFortHq: number;
  airbaseAfter: number;
  defendFactor: number;
}

const PARAMS: Record<Difficulty, Params> = {
  facil: { think: 5, groupRetreat: false, maxGroups: 1, attackRatio: 1.0, reserve: 0.4, queue: 1, abilityGap: 100, micro: false, maxFortHq: 1, airbaseAfter: 600, defendFactor: 0.8 },
  normal: { think: 3, groupRetreat: true, maxGroups: 2, attackRatio: 1.35, reserve: 0.25, queue: 2, abilityGap: 35, micro: false, maxFortHq: 2, airbaseAfter: 300, defendFactor: 1.2 },
  dificil: { think: 2, groupRetreat: true, maxGroups: 2, attackRatio: 1.25, reserve: 0.2, queue: 2, abilityGap: 15, micro: true, maxFortHq: 3, airbaseAfter: 200, defendFactor: 1.35 },
  insano: { think: 1.2, groupRetreat: true, maxGroups: 2, attackRatio: 1.2, reserve: 0.15, queue: 3, abilityGap: 8, micro: true, maxFortHq: 3, airbaseAfter: 200, defendFactor: 1.4 },
};

const COMPOSITION: Record<Faction, Partial<Record<UnitType, number>>> = {
  bolso: { infantry: 0.32, tank: 0.33, artillery: 0.12, heli: 0.1, plane: 0.07, support: 0.06 },
  lula: { infantry: 0.55, tank: 0.14, artillery: 0.14, heli: 0.06, plane: 0.05, support: 0.06 },
};

const power = (u: Unit) => UNIT_DEFS[u.type].power * (u.hp / u.maxHp);
const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

export function thinkAI(g: Game, f: Faction): void {
  const ai = g.w.ai[f]!;
  const fr = g.w.factions[f];
  const p = PARAMS[fr.difficulty];
  ai.nextThink = g.w.time + p.think;
  const owned = g.statesOf(f);
  if (!owned.length || g.w.winner) return;

  const myUnits = g.unitsOf(f);
  const byId = new Map(myUnits.map((u) => [u.id, u]));
  for (const u of myUnits) if (u.group > 0 && !ai.groups.some((gr) => gr.id === u.group)) u.group = 0;

  // ---------------- inteligência
  const enemy = enemyOf(f);
  const enemyUnits = g.unitsOf(enemy);
  const myPower = myUnits.reduce((s, u) => s + power(u), 0);
  const enemyPower = enemyUnits.reduce((s, u) => s + power(u), 0);
  const threats = owned
    .map((si) => {
      const c = g.capital(si);
      const t = g.powerNear(c.x, c.y, 270, enemy) + (g.w.time - g.w.states[si].lastAttackT < 5 ? 1 : 0);
      const pri = g.map.states[si].info.imp + (si === fr.hq ? 12 : 0) + t;
      return { si, t, pri };
    })
    .filter((x) => x.t > 0.4)
    .sort((a, b) => b.pri - a.pri);

  ai.lost = ai.lost.filter((l) => g.w.time - l.t < 120);
  const lostRecent = ai.lost.filter((l) => g.w.states[l.s].owner !== f).map((l) => l.s);
  const frontier = frontierStates(g, f);
  const neutralFrontier = frontier.filter((s) => g.w.states[s].owner === 'neutral');
  const ratio = myPower / Math.max(1, enemyPower);
  if (ratio < 0.7 && threats.length) ai.strategy = 'defensiva';
  else if (lostRecent.length && ratio >= 0.85) ai.strategy = 'contra-ataque';
  else if (neutralFrontier.length && (ratio < 1.3 || g.w.time < 300)) ai.strategy = 'expansao';
  else ai.strategy = 'ofensiva';

  // ---------------- limpeza dos grupos
  for (const gr of ai.groups) gr.units = gr.units.filter((id) => byId.has(id));
  ai.groups = ai.groups.filter((gr) => {
    const done =
      gr.units.length === 0 ||
      (gr.task === 'attack' && g.w.states[gr.target].owner === f) ||
      (gr.task === 'defend' && (g.w.states[gr.target].owner !== f || !threats.some((t) => t.si === gr.target)) && g.w.time - gr.t0 > 15);
    if (done) for (const id of gr.units) { const u = byId.get(id); if (u) u.group = 0; }
    return !done;
  });

  // ---------------- micro: recuo de unidades muito feridas
  if (p.micro) {
    for (const u of myUnits) {
      if (u.type === 'plane' || u.type === 'support') continue;
      if (u.group === -1) {
        if (u.hp > u.maxHp * 0.75) u.group = 0;
        continue;
      }
      if (u.hp < u.maxHp * 0.28 && g.w.time - u.lastHitT < 3) {
        const gr = ai.groups.find((x) => x.id === u.group);
        if (gr?.task === 'defend' && gr.target === fr.hq) continue;
        if (gr) gr.units = gr.units.filter((id) => id !== u.id);
        const home = nearestOwned(g, f, u.x, u.y, true);
        if (home >= 0) {
          const c = g.capital(home);
          g.commandMove(f, [u.id], c.x, c.y, false);
          u.group = -1;
        }
      }
    }
  }

  const freeCombat = () => myUnits.filter((u) => u.group === 0 && u.type !== 'plane' && u.type !== 'support' && u.hp > 0);

  // ---------------- defesa
  for (const th of threats) {
    const c = g.capital(th.si);
    const have = g.powerNear(c.x, c.y, 220, f) + g.garrisonPower(th.si) * 0.5;
    let need = th.t * p.defendFactor - have;
    if (need <= 0) continue;
    let gr = ai.groups.find((x) => x.task === 'defend' && x.target === th.si);
    const pool = freeCombat()
      .filter((u) => dist(u.x, u.y, c.x, c.y) < (th.si === fr.hq ? 1400 : 800))
      .sort((a, b) => dist(a.x, a.y, c.x, c.y) - dist(b.x, b.y, c.x, c.y));
    if (th.si === fr.hq && pool.length < 3) {
      // a sede está em perigo: puxa tropas dos grupos de ataque
      for (const ag of ai.groups.filter((x) => x.task === 'attack')) {
        for (const id of ag.units) { const u = byId.get(id); if (u) { u.group = 0; pool.push(u); } }
        ag.units = [];
      }
    }
    const picked: number[] = [];
    for (const u of pool) {
      if (need <= 0) break;
      picked.push(u.id);
      need -= power(u);
    }
    if (!picked.length) continue;
    if (!gr) {
      gr = { id: ai.nextGroupId++, task: 'defend', target: th.si, units: [], phase: 'attack', sx: c.x, sy: c.y, t0: g.w.time, lastPower: 0 };
      ai.groups.push(gr);
    }
    for (const id of picked) { gr.units.push(id); byId.get(id)!.group = gr.id; }
    g.commandMove(f, picked, c.x, c.y, true);
  }
  ai.groups = ai.groups.filter((gr) => gr.units.length > 0);

  // ---------------- ofensiva: gerenciamento dos grupos existentes
  for (const gr of ai.groups.filter((x) => x.task === 'attack')) manageAttackGroup(g, f, ai, gr, byId, p, freeCombat);

  // ---------------- ofensiva: novos grupos
  const attackGroups = ai.groups.filter((x) => x.task === 'attack');
  const maxGroups = ai.strategy === 'defensiva' ? Math.min(1, p.maxGroups) : p.maxGroups;
  if (attackGroups.length < maxGroups) {
    const free = freeCombat();
    const freePower = free.reduce((s, u) => s + power(u), 0);
    const available = freePower * (1 - p.reserve);
    const targeted = new Set(ai.groups.map((x) => x.target));
    const cands = frontier
      .filter((s) => !targeted.has(s))
      .map((s) => scoreTarget(g, f, ai, s, lostRecent, free))
      .sort((a, b) => b.score - a.score);
    for (const cand of cands.slice(0, 3)) {
      const need = cand.defense * p.attackRatio + 1.5;
      if (available < need || free.length < 3) continue;
      // na defensiva só ataca alvos claramente fracos
      if (ai.strategy === 'defensiva' && cand.defense > available * 0.5) continue;
      const c = g.capital(cand.s);
      const pool = free.filter((u) => u.group === 0).sort((a, b) => dist(a.x, a.y, c.x, c.y) - dist(b.x, b.y, c.x, c.y));
      const ids: number[] = [];
      let pw = 0;
      for (const u of pool) {
        if (pw >= need * 1.25 && ids.length >= 4) break;
        if (pw >= available) break;
        ids.push(u.id);
        pw += power(u);
      }
      if (pw < need) continue;
      const stage = stagingPoint(g, f, cand.s);
      const gr: AIGroup = { id: ai.nextGroupId++, task: 'attack', target: cand.s, units: ids, phase: 'gather', sx: stage.x, sy: stage.y, t0: g.w.time, lastPower: pw };
      ai.groups.push(gr);
      for (const id of ids) byId.get(id)!.group = gr.id;
      g.commandMove(f, ids, stage.x, stage.y, true);
      ai.focus = cand.s;
      break;
    }
  }

  // ---------------- aviação e apoio
  managePlanes(g, f, ai, myUnits, threats.map((t) => t.si));
  manageSupport(g, f, ai, myUnits, byId);

  // ---------------- economia
  balanceResources(g, f);
  planBuildings(g, f, ai, p, owned, threats.map((t) => t.si));
  produce(g, f, ai, p, owned, myUnits);

  // ---------------- habilidades dos comandantes
  useAbilities(g, f, ai, p, threats, byId);
}

function frontierStates(g: Game, f: Faction): number[] {
  const set = new Set<number>();
  for (const s of g.w.states) {
    if (s.owner !== f) continue;
    for (const n of g.map.states[s.i].adj) if (g.w.states[n].owner !== f) set.add(n);
  }
  return [...set];
}

function nearestOwned(g: Game, f: Faction, x: number, y: number, safe = false): number {
  let best = -1, bd = Infinity;
  for (const s of g.w.states) {
    if (s.owner !== f) continue;
    if (safe && g.w.time - s.lastAttackT < 8) continue;
    const c = g.capital(s.i);
    const d = dist(c.x, c.y, x, y);
    if (d < bd) { bd = d; best = s.i; }
  }
  return best;
}

function scoreTarget(g: Game, f: Faction, ai: AIState, s: number, lostRecent: number[], free: Unit[]) {
  const st = g.w.states[s];
  const info = g.map.states[s].info;
  const enemy = enemyOf(f);
  const c = g.capital(s);
  let value = info.imp * 2 + (info.money + info.fuel + info.steel + info.supplies + info.industry) / 3;
  if (st.owner === enemy && s === g.w.factions[enemy].hq) value += 6;
  if (lostRecent.includes(s)) value += 8;
  if (st.owner === 'neutral' && ai.strategy === 'expansao') value += 5;
  if (st.owner === enemy && (ai.strategy === 'ofensiva' || ai.strategy === 'contra-ataque')) value += 4;
  if (info.uf === 'DF') value += 4;
  // estados que o inimigo usa como base de ataque contra nós
  if (st.owner === enemy && g.w.time - st.lastCombatT < 20) value += 2;
  // recursos que faltam para a facção
  const fr = g.w.factions[f];
  if (fr.income.fuel < 2.5) value += info.fuel;
  if (fr.income.steel < 2.5) value += info.steel;
  // defesa local + metade das forças inimigas móveis da região (reforços prováveis)
  const local = g.hostilePowerNear(c.x, c.y, 280, f);
  const regional = st.owner === 'neutral' ? 0 : g.powerNear(c.x, c.y, 650, st.owner) - g.powerNear(c.x, c.y, 280, st.owner);
  const defense = g.garrisonPower(s) + local + Math.max(0, regional) * 0.5;
  let cx = 0, cy = 0;
  for (const u of free) { cx += u.x; cy += u.y; }
  const n = Math.max(1, free.length);
  const d = free.length ? dist(cx / n, cy / n, c.x, c.y) : 0;
  const score = value / (1 + defense * 0.5) - d / 700;
  return { s, score, defense };
}

function stagingPoint(g: Game, f: Faction, target: number): { x: number; y: number } {
  const c = g.capital(target);
  let best = -1, bd = Infinity;
  for (const n of g.map.states[target].adj) {
    if (g.w.states[n].owner !== f) continue;
    const cc = g.capital(n);
    const d = dist(cc.x, cc.y, c.x, c.y);
    if (d < bd) { bd = d; best = n; }
  }
  if (best < 0) return c;
  const sc = g.capital(best);
  // avança 40% do caminho na direção do alvo, ainda em terreno navegável
  const x = sc.x + (c.x - sc.x) * 0.4, y = sc.y + (c.y - sc.y) * 0.4;
  return g.map.nearestWalkable(x, y);
}

function manageAttackGroup(
  g: Game, f: Faction, ai: AIState, gr: AIGroup, byId: Map<number, Unit>, p: Params, freeCombat: () => Unit[],
): void {
  const units = gr.units.map((id) => byId.get(id)!).filter(Boolean);
  const pw = units.reduce((s, u) => s + power(u), 0);
  const c = g.capital(gr.target);
  const defense = g.garrisonPower(gr.target) + g.hostilePowerNear(c.x, c.y, 280, f);
  gr.lastPower = pw;

  if (gr.phase === 'gather') {
    const near = units.filter((u) => dist(u.x, u.y, gr.sx, gr.sy) < 230).length;
    if (near >= units.length * 0.7 || g.w.time - gr.t0 > 45) {
      gr.phase = 'attack';
      gr.t0 = g.w.time;
      g.commandMove(f, gr.units, c.x, c.y, true);
      useLaunchAbilities(g, f, ai, p, gr, pw);
    } else {
      const idle = units.filter((u) => u.order.kind === 'idle' && dist(u.x, u.y, gr.sx, gr.sy) > 230).map((u) => u.id);
      if (idle.length) g.commandMove(f, idle, gr.sx, gr.sy, true);
    }
    return;
  }

  if (gr.phase === 'retreat') {
    const near = units.filter((u) => dist(u.x, u.y, gr.sx, gr.sy) < 200).length;
    if (near >= units.length * 0.7 || g.w.time - gr.t0 > 25) {
      gr.phase = 'gather';
      gr.t0 = g.w.time;
    }
    return;
  }

  // fase de ataque
  if (p.groupRetreat && pw < defense * 0.45 && g.w.time - gr.t0 > 8) {
    gr.phase = 'retreat';
    gr.t0 = g.w.time;
    g.commandMove(f, gr.units, gr.sx, gr.sy, false);
    return;
  }
  // reforços
  if (pw < defense * 1.1) {
    const extra = freeCombat()
      .filter((u) => dist(u.x, u.y, c.x, c.y) < 900)
      .sort((a, b) => dist(a.x, a.y, c.x, c.y) - dist(b.x, b.y, c.x, c.y))
      .slice(0, 4);
    if (extra.length) {
      for (const u of extra) { u.group = gr.id; gr.units.push(u.id); }
      g.commandMove(f, extra.map((u) => u.id), c.x, c.y, true);
    }
  }
  // mantém todos avançando sobre a capital-alvo
  const lagging = units.filter((u) => u.order.kind === 'idle' && dist(u.x, u.y, c.x, c.y) > 60).map((u) => u.id);
  if (lagging.length) g.commandMove(f, lagging, c.x, c.y, true);
  // ataque emperrado há muito tempo: desiste e reagrupa
  if (g.w.time - gr.t0 > 240 && g.w.states[gr.target].gHp > g.w.states[gr.target].gMax * 0.5) {
    for (const u of units) u.group = 0;
    gr.units = [];
  }
}

function managePlanes(g: Game, f: Faction, _ai: AIState, myUnits: Unit[], threatened: number[]): void {
  const planes = myUnits.filter((u) => u.type === 'plane' && u.phase === 'ready' && u.order.kind === 'idle');
  if (!planes.length) return;
  const enemy = enemyOf(f);
  // prioridade 1: inimigos atacando nossos estados
  for (const si of threatened) {
    const c = g.capital(si);
    let target: Unit | null = null, bd = Infinity;
    for (const e of g.unitsOf(enemy)) {
      const d = dist(e.x, e.y, c.x, c.y);
      if (d < 300 && d < bd) { bd = d; target = e; }
    }
    if (target) {
      g.commandAttack(f, planes.map((u) => u.id), { t: 'u', id: target.id });
      return;
    }
  }
  // prioridade 2: apoiar o grupo de ataque principal
  const ai = g.w.ai[f]!;
  const gr = ai.groups.find((x) => x.task === 'attack' && x.phase === 'attack');
  if (gr) {
    const c = g.capital(gr.target);
    g.commandMove(f, planes.map((u) => u.id), c.x, c.y, true);
  }
}

function manageSupport(g: Game, f: Faction, ai: AIState, myUnits: Unit[], byId: Map<number, Unit>): void {
  const supports = myUnits.filter((u) => u.type === 'support');
  const groups = ai.groups.filter((x) => x.units.length >= 3);
  supports.forEach((sp, i) => {
    if (!groups.length) return;
    const gr = groups[i % groups.length];
    let cx = 0, cy = 0, n = 0;
    for (const id of gr.units) { const u = byId.get(id); if (u) { cx += u.x; cy += u.y; n++; } }
    if (!n) return;
    cx /= n; cy /= n;
    // fica um pouco atrás do centro do grupo
    const c = g.capital(gr.target);
    const a = Math.atan2(cy - c.y, cx - c.x);
    const tx = cx + Math.cos(a) * 35, ty = cy + Math.sin(a) * 35;
    if (dist(sp.x, sp.y, tx, ty) > 70) g.commandMove(f, [sp.id], tx, ty, false);
  });
}

function planBuildings(g: Game, f: Faction, _ai: AIState, p: Params, owned: number[], threatened: number[]): void {
  const fr = g.w.factions[f];
  const states = owned.map((i) => g.w.states[i]);
  const isFront = (i: number) => g.map.states[i].adj.some((n) => g.w.states[n].owner !== f);
  const imp = (i: number) => g.map.states[i].info.imp;
  const tryBuild = (si: number, type: BuildingType): boolean => {
    const cost = g.buildCost(si, type);
    if (!cost) return false;
    // mantém reserva para tropas
    if (!fr.infinite && fr.res.money - cost.money < 120) return false;
    return g.build(f, si, type) === null;
  };
  let builds = fr.difficulty === 'insano' ? 2 : 1;

  const count = (t: BuildingType) => states.reduce((s, st) => s + (st.b[t] > 0 ? 1 : 0), 0);
  const connected = states.filter((s) => s.connected && !s.cons);

  // quartéis perto da frente
  if (builds > 0 && count('barracks') < Math.ceil(owned.length / 4) + 1) {
    const cand = connected.filter((s) => !s.b.barracks && isFront(s.i)).sort((a, b) => imp(b.i) - imp(a.i))[0]
      ?? connected.filter((s) => !s.b.barracks).sort((a, b) => imp(b.i) - imp(a.i))[0];
    if (cand && tryBuild(cand.i, 'barracks')) builds--;
  }
  // fábricas nos estados mais industriais
  if (builds > 0 && count('factory') < 1 + Math.floor(owned.length / 7)) {
    const cand = connected.filter((s) => !s.b.factory).sort((a, b) => g.map.states[b.i].info.industry - g.map.states[a.i].info.industry)[0];
    if (cand && tryBuild(cand.i, 'factory')) builds--;
  }
  // fortificação da sede e de estados ameaçados
  const hq = g.w.states[fr.hq];
  if (builds > 0 && hq.owner === f && !hq.cons && hq.b.fort < p.maxFortHq && (threatened.includes(hq.i) || fr.res.money > 900)) {
    if (tryBuild(hq.i, 'fort')) builds--;
  }
  if (builds > 0) {
    const cand = threatened.map((i) => g.w.states[i]).find((s) => s.owner === f && !s.cons && s.b.fort < 1 && imp(s.i) >= 5);
    if (cand && tryBuild(cand.i, 'fort')) builds--;
  }
  // base aérea
  if (builds > 0 && count('airbase') === 0 && g.w.time > p.airbaseAfter) {
    const cand = connected.filter((s) => !s.b.airbase).sort((a, b) => (isFront(a.i) ? 1 : 0) - (isFront(b.i) ? 1 : 0) || imp(b.i) - imp(a.i))[0];
    if (cand && tryBuild(cand.i, 'airbase')) builds--;
  }
  // depósitos: estados isolados ou limite de tropas apertado
  if (builds > 0 && (fr.pop >= fr.popCap - 3 || states.some((s) => !s.connected))) {
    const cand = states.filter((s) => !s.cons && !s.b.depot).sort((a, b) => (a.connected ? 1 : 0) - (b.connected ? 1 : 0) || imp(b.i) - imp(a.i))[0];
    if (cand && tryBuild(cand.i, 'depot')) builds--;
  }
  if (builds > 0 && fr.pop >= fr.popCap - 3) {
    const cand = connected.filter((s) => !s.b.barracks).sort((a, b) => imp(b.i) - imp(a.i))[0];
    if (cand) tryBuild(cand.i, 'barracks');
  }
}

/** Usa o mercado para converter estoques parados no recurso que falta. */
function balanceResources(g: Game, f: Faction): void {
  const fr = g.w.factions[f];
  if (fr.infinite) return;
  const keys = ['money', 'fuel', 'steel', 'supplies'] as const;
  const need = keys.filter((k) => fr.res[k] < (k === 'money' ? 200 : 70));
  if (!need.length) return;
  const rich = keys.filter((k) => !need.includes(k) && fr.res[k] > (k === 'money' ? 900 : 700)).sort((a, b) => fr.res[b] - fr.res[a]);
  if (!rich.length) return;
  const from = rich[0];
  const amount = Math.min(400, Math.floor(fr.res[from] - (from === 'money' ? 600 : 450)));
  if (amount > 50) g.trade(f, from, need[0], amount);
}

function produce(g: Game, f: Faction, ai: AIState, p: Params, owned: number[], myUnits: Unit[]): void {
  const fr = g.w.factions[f];
  if (!fr.infinite && fr.res.supplies < 40 && fr.income.supplies < fr.upkeep.supplies) return;
  const counts: Partial<Record<UnitType, number>> = {};
  let total = 0;
  for (const u of myUnits) { counts[u.type] = (counts[u.type] ?? 0) + 1; total++; }
  for (const si of owned) for (const q of g.w.states[si].queue) { counts[q.type] = (counts[q.type] ?? 0) + 1; total++; }
  const comp = COMPOSITION[f];
  // estados produtores ordenados pela proximidade do foco/ameaça
  const focus = ai.focus >= 0 ? g.capital(ai.focus) : g.capital(fr.hq);
  const producers = owned
    .filter((si) => { const b = g.w.states[si].b; return b.barracks || b.factory || b.airbase; })
    .sort((a, b) => dist(g.capital(a).x, g.capital(a).y, focus.x, focus.y) - dist(g.capital(b).x, g.capital(b).y, focus.x, focus.y));
  for (const si of producers) {
    const st = g.w.states[si];
    let guard = 0;
    while (st.queue.length < p.queue && guard++ < 4) {
      const options = RECRUITABLE.filter((t) => g.recruitCheck(f, si, t) === null);
      if (!options.length) return;
      // custo relativo aos estoques: prefere unidades que usam recursos abundantes
      const stress = (t: UnitType) => {
        const c = g.costOf(f, t);
        let sum = 0;
        for (const k of ['money', 'fuel', 'steel', 'supplies'] as const) sum += c[k] / Math.max(25, fr.res[k] + fr.income[k] * 40);
        return sum;
      };
      let best: UnitType | null = null, bestDef = -Infinity;
      for (const t of options) {
        if (t === 'support' && (counts.support ?? 0) >= 3) continue;
        const share = (counts[t] ?? 0) / Math.max(1, total);
        let deficit = (comp[t] ?? 0) - share;
        if (ai.strategy === 'defensiva' && (t === 'infantry' || t === 'artillery')) deficit += 0.05;
        if (ai.strategy === 'ofensiva' && t === 'tank') deficit += 0.04;
        deficit -= 0.08 * stress(t);
        // perto do limite de tropas, cada vaga vale ouro: prefere unidades com mais poder por vaga
        if (fr.pop >= fr.popCap * 0.8) deficit += 0.2 * (UNIT_DEFS[t].power / UNIT_DEFS[t].pop - 1.1);
        if (deficit > bestDef) { bestDef = deficit; best = t; }
      }
      if (!best) break;
      if (g.recruit(f, si, best) !== null) break;
      counts[best] = (counts[best] ?? 0) + 1;
      total++;
    }
  }
}

function useLaunchAbilities(g: Game, f: Faction, ai: AIState, p: Params, gr: AIGroup, pw: number): void {
  if (g.w.time - ai.lastAbilityT < p.abilityGap) return;
  const c = g.capital(gr.target);
  if (f === 'bolso') {
    if (pw >= 5 && g.useAbility(f, 'blitz') === null) { ai.lastAbilityT = g.w.time; return; }
    if (g.garrisonPower(gr.target) > 2 && g.useAbility(f, 'coordenado', { x: c.x, y: c.y }) === null) ai.lastAbilityT = g.w.time;
  } else if (g.garrisonPower(gr.target) > 3 && g.useAbility(f, 'industria') === null) {
    ai.lastAbilityT = g.w.time;
  }
}

function useAbilities(
  g: Game, f: Faction, ai: AIState, p: Params, threats: { si: number; t: number }[], byId: Map<number, Unit>,
): void {
  if (g.w.time - ai.lastAbilityT < p.abilityGap) return;
  const fr = g.w.factions[f];
  const use = (id: Parameters<Game['useAbility']>[1], opts?: Parameters<Game['useAbility']>[2]) => {
    if (g.useAbility(f, id, opts) === null) { ai.lastAbilityT = g.w.time; return true; }
    return false;
  };
  const big = threats.find((t) => t.t > 4 && (t.si === fr.hq || g.map.states[t.si].info.imp >= 5));
  if (f === 'bolso') {
    const attacking = ai.groups.find((x) => x.task === 'attack' && x.phase === 'attack');
    if (attacking) {
      const c = g.capital(attacking.target);
      const near = attacking.units.some((id) => { const u = byId.get(id); return u && dist(u.x, u.y, c.x, c.y) < 200; });
      if (near && g.garrisonPower(attacking.target) > 1.5 && use('coordenado', { x: c.x, y: c.y })) return;
    }
    if ((big || ai.strategy === 'ofensiva') && fr.res.money > 450 && fr.res.steel > 150) {
      const si = big ? big.si : ai.focus >= 0 ? nearestOwned(g, f, g.capital(ai.focus).x, g.capital(ai.focus).y) : fr.hq;
      if (use('blindados', { s: si })) return;
    }
    if (big) use('blitz');
  } else {
    if (big && use('ferrea')) return;
    if (big || (ai.strategy === 'expansao' && fr.res.money > 350)) {
      const si = big ? big.si : ai.focus >= 0 ? nearestOwned(g, f, g.capital(ai.focus).x, g.capital(ai.focus).y) : fr.hq;
      if (use('massa', { s: si })) return;
    }
    const queued = g.statesOf(f).reduce((s, i) => s + g.w.states[i].queue.length, 0);
    if (queued >= 3 && fr.res.supplies > 150) use('industria');
  }
}
