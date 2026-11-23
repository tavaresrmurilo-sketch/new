// Criação de uma nova partida (estado inicial do mundo).
import { DISTRIBUTIONS } from '../data/states';
import { UNIT_DEFS } from '../data/units';
import { FACTIONS, enemyOf } from '../data/factions';
import { getMap, type MapData } from './map';
import { rand } from './rng';
import type {
  AIState, BuildingType, ControlKind, Faction, FactionRT, MatchSettings, Owner, Res, StateRT, Unit, UnitType, World,
} from './types';

export const WORLD_VERSION = 3;

export const START_RES: Record<MatchSettings['startRes'], Res> = {
  baixos: { money: 400, fuel: 150, steel: 150, supplies: 220 },
  normais: { money: 750, fuel: 280, steel: 280, supplies: 380 },
  altos: { money: 1500, fuel: 550, steel: 550, supplies: 750 },
};

/** Infraestrutura pré-existente (independe de quem domina o estado no início). */
const INFRA: Record<string, Partial<Record<BuildingType, number>>> = {
  SP: { barracks: 1, factory: 1, fort: 1 },
  RJ: { barracks: 1, airbase: 1, fort: 1 },
  MG: { factory: 1 },
  DF: { airbase: 1, fort: 2 },
  AM: { airbase: 1 },
  RS: { barracks: 1 },
  BA: { barracks: 1 },
  PA: { barracks: 1 },
};

export function defaultSettings(partial: Partial<MatchSettings> = {}): MatchSettings {
  return {
    mode: 'campanha',
    player: 'lula',
    difficulty: 'normal',
    distribution: 'eleitoral',
    startRes: 'normais',
    incomeMul: 1,
    seed: (Math.random() * 2 ** 31) | 0,
    enemyAI: true,
    ...partial,
  };
}

function emptyBuildings(): Record<BuildingType, number> {
  return { barracks: 0, factory: 0, airbase: 0, depot: 0, fort: 0 };
}

export function newAIState(): AIState {
  return { nextThink: 2, groups: [], nextGroupId: 1, strategy: 'expansao', lost: [], lastAbilityT: -999, focus: -1 };
}

function newFaction(id: Faction, control: ControlKind, s: MatchSettings, hq: number): FactionRT {
  const res = { ...START_RES[s.startRes] };
  return {
    id,
    res,
    income: { money: 0, fuel: 0, steel: 0, supplies: 0 },
    upkeep: { money: 0, fuel: 0, steel: 0, supplies: 0 },
    industry: 0,
    prodMul: 1,
    pop: 0,
    popCap: 10,
    hq,
    origHq: hq,
    control,
    difficulty: s.difficulty,
    abilities: FACTIONS[id].abilities.map((a) => ({ id: a, cd: 0, active: 0 })),
    buffs: { speedT: 0, dmgT: 0, prodT: 0, defT: 0, coordT: 0, coordX: 0, coordY: 0 },
    stats: { produced: 0, lost: 0, killed: 0, captured: 0, statesLost: 0, damage: 0, spent: 0 },
    infinite: s.mode === 'sandbox' && control === 'human',
    surrendered: false,
    crisisT: 0,
    objectives: [],
  };
}

/** Distribuição aleatória equilibrada: duas regiões conexas crescendo a partir de sementes distantes. */
function randomDistribution(w: World, map: MapData): { lula: number[]; bolso: number[] } {
  const n = map.states.length;
  const dist = (a: number): number[] => {
    const d = new Array(n).fill(Infinity);
    d[a] = 0;
    const q = [a];
    while (q.length) {
      const c = q.shift()!;
      for (const nb of map.states[c].adj) if (d[nb] === Infinity) { d[nb] = d[c] + 1; q.push(nb); }
    }
    return d;
  };
  const seedA = Math.floor(rand(w) * n);
  const dA = dist(seedA);
  const maxD = Math.max(...dA.filter((x) => x < Infinity));
  const far = dA.map((d, i) => (d >= maxD - 1 ? i : -1)).filter((i) => i >= 0);
  const seedB = far[Math.floor(rand(w) * far.length)];
  const owner = new Array<Owner>(n).fill('neutral');
  const regions = { lula: [seedA], bolso: [seedB] };
  owner[seedA] = 'lula';
  owner[seedB] = 'bolso';
  for (let round = 0; round < 8; round++) {
    for (const f of ['lula', 'bolso'] as Faction[]) {
      const cand = new Set<number>();
      for (const s of regions[f]) for (const nb of map.states[s].adj) if (owner[nb] === 'neutral') cand.add(nb);
      const list = [...cand];
      if (!list.length) continue;
      const pick = list[Math.floor(rand(w) * list.length)];
      owner[pick] = f;
      regions[f].push(pick);
    }
  }
  return regions;
}

export function makeUnit(w: World, type: UnitType, f: Owner, x: number, y: number, home = -1): Unit {
  const def = UNIT_DEFS[type];
  const u: Unit = {
    id: w.nextId++,
    type,
    f,
    x,
    y,
    px: x,
    py: y,
    hp: def.hp,
    maxHp: def.hp,
    angle: rand(w) * Math.PI * 2,
    order: { kind: 'idle' },
    path: null,
    pi: 0,
    target: null,
    cd: rand(w) * def.cooldown,
    scanT: rand(w) * 0.5,
    repathT: 0,
    anchorX: x,
    anchorY: y,
    supplied: true,
    st: -1,
    ammo: def.ammo,
    fuel: def.fuel,
    phase: 'ready',
    rearmT: 0,
    home,
    kills: 0,
    lastHitT: -99,
    lastFireT: -99,
    group: 0,
    moving: false,
  };
  return u;
}

/** Posição livre perto de um ponto (anel ao redor), sempre em terreno navegável. */
export function spotNear(w: World, map: MapData, x: number, y: number, radius: number): { x: number; y: number } {
  for (let tries = 0; tries < 12; tries++) {
    const a = rand(w) * Math.PI * 2;
    const r = radius * (0.35 + 0.65 * rand(w));
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (map.isWalkable(px, py)) return { x: px, y: py };
  }
  return map.nearestWalkable(x, y);
}

export function garrisonMax(s: StateRT, map: MapData): number {
  const imp = map.states[s.i].info.imp;
  // grandes centros (importância alta) são fortalezas: cresce com o quadrado da importância
  let hp = 300 + imp * imp * 6 + s.b.fort * 300;
  if (s.owner === 'lula') hp *= 1.2;
  return Math.round(hp);
}

export function createWorld(settings: MatchSettings): World {
  const map = getMap();
  const w: World = {
    version: WORLD_VERSION,
    time: 0,
    rng: settings.seed | 0,
    units: [],
    nextId: 1,
    shells: [],
    states: [],
    factions: {} as World['factions'],
    settings,
    winner: null,
    endReason: '',
    ai: { lula: null, bolso: null },
    turn: settings.mode === 'local' ? { phase: 'plan', active: 'lula', t: 0, n: 1 } : null,
    log: [],
    tick: 0,
    timers: { eco: 0, supply: 0, victory: 0, objectives: 0 },
  };

  // distribuição territorial
  let lulaStates: number[], bolsoStates: number[], hqL: number, hqB: number;
  if (settings.distribution === 'aleatoria') {
    const r = randomDistribution(w, map);
    lulaStates = r.lula;
    bolsoStates = r.bolso;
    const byImp = (list: number[]) => [...list].sort((a, b) => map.states[b].info.imp - map.states[a].info.imp)[0];
    hqL = byImp(lulaStates);
    hqB = byImp(bolsoStates);
  } else {
    const d = DISTRIBUTIONS[settings.distribution];
    lulaStates = d.lula.map((u) => map.byUf[u]);
    bolsoStates = d.bolso.map((u) => map.byUf[u]);
    hqL = map.byUf[d.hq.lula];
    hqB = map.byUf[d.hq.bolso];
  }

  for (const sg of map.states) {
    const owner: Owner = lulaStates.includes(sg.i) ? 'lula' : bolsoStates.includes(sg.i) ? 'bolso' : 'neutral';
    const b = emptyBuildings();
    Object.assign(b, INFRA[sg.uf] ?? {});
    if (owner === 'neutral' && sg.info.imp >= 8) b.fort = Math.max(b.fort, 1);
    const s: StateRT = {
      i: sg.i,
      uf: sg.uf,
      owner,
      gHp: 0,
      gMax: 0,
      gCd: 0,
      gTarget: null,
      capF: null,
      capP: 0,
      b,
      cons: null,
      queue: [],
      rally: null,
      connected: true,
      lastAttackT: -99,
      lastCombatT: -99,
      alertT: -99,
      capturedT: -99,
    };
    w.states.push(s);
  }

  const control = (f: Faction): ControlKind => {
    if (settings.mode === 'local') return 'human';
    if (f === settings.player) return 'human';
    return settings.enemyAI ? 'ai' : 'none';
  };
  w.factions.lula = newFaction('lula', control('lula'), settings, hqL);
  w.factions.bolso = newFaction('bolso', control('bolso'), settings, hqB);
  for (const f of ['lula', 'bolso'] as Faction[]) {
    if (w.factions[f].control === 'ai') w.ai[f] = newAIState();
  }

  // infraestrutura das sedes + quartéis na frente
  for (const f of ['lula', 'bolso'] as Faction[]) {
    const hq = w.states[w.factions[f].hq];
    hq.b.barracks = 1;
    hq.b.factory = 1;
    hq.b.depot = 1;
    hq.b.fort = Math.max(hq.b.fort, 1);
    const owned = w.states.filter((s) => s.owner === f && s.i !== hq.i);
    const front = owned
      .filter((s) => map.states[s.i].adj.some((n) => w.states[n].owner !== f))
      .sort((a, b) => map.states[b.i].info.imp - map.states[a.i].info.imp)
      .slice(0, 2);
    for (const s of front) s.b.barracks = 1;
  }

  for (const s of w.states) {
    s.gMax = garrisonMax(s, map);
    s.gHp = s.gMax;
  }

  // tropas iniciais
  const startArmy: Record<Faction, [UnitType, number][]> = {
    lula: [['infantry', 10], ['tank', 2], ['artillery', 2], ['support', 1]],
    bolso: [['infantry', 6], ['tank', 4], ['artillery', 2], ['support', 1]],
  };
  for (const f of ['lula', 'bolso'] as Faction[]) {
    const hq = w.factions[f].hq;
    const owned = w.states.filter((s) => s.owner === f);
    const front = owned.filter((s) => s.i !== hq && map.states[s.i].adj.some((n) => w.states[n].owner === enemyOf(f)));
    const front2 = front.length ? front : owned.filter((s) => s.i !== hq && map.states[s.i].adj.some((n) => w.states[n].owner !== f));
    let k = 0;
    for (const [type, count] of startArmy[f]) {
      for (let c = 0; c < count; c++) {
        // metade na sede, metade espalhada pela fronteira
        const target = k % 2 === 0 || !front2.length ? hq : front2[Math.floor(k / 2) % front2.length].i;
        const cap = map.states[target].capital;
        const p = spotNear(w, map, cap.x, cap.y, 45);
        w.units.push(makeUnit(w, type, f, p.x, p.y));
        k++;
      }
    }
  }

  // milícias dos estados neutros
  for (const s of w.states) {
    if (s.owner !== 'neutral') continue;
    const imp = map.states[s.i].info.imp;
    const n = 2 + Math.floor((imp * imp) / 20);
    const cap = map.states[s.i].capital;
    for (let c = 0; c < n; c++) {
      const p = spotNear(w, map, cap.x, cap.y, 40);
      w.units.push(makeUnit(w, 'militia', 'neutral', p.x, p.y, s.i));
    }
  }

  w.log.push({ t: 0, text: 'A guerra pelo Brasil começou. Conquiste os 26 estados e o Distrito Federal!', kind: 'info' });
  return w;
}
