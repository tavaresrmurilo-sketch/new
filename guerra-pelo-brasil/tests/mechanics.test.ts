// Sistemas estratégicos da versão 2.0.
import { describe, expect, it } from 'vitest';
import { add, emptyGame, run } from './util';
import { Game } from '../shared/sim/game';
import { defaultSettings, migrateWorld } from '../shared/sim/setup';
import { applyCommand } from '../shared/net/commands';
import { UNIT_DEFS } from '../shared/data/units';
import { FORMATIONS, MORALE, RANK_BONUS, T_FOREST, T_HILLS, T_RIVER, T_URBAN, TERRAIN, rankOf } from '../shared/sim/rules';
import type { World } from '../shared/sim/types';

/** Procura uma célula navegável com o terreno pedido. */
function findTerrain(g: Game, code: number): { x: number; y: number } {
  const m = g.map;
  for (let i = 0; i < m.terrain.length; i++) {
    if (m.terrain[i] !== code || !m.walk[i]) continue;
    const x = (i % m.cols) * 16 + 8, y = Math.floor(i / m.cols) * 16 + 8;
    // vizinhança do mesmo terreno, para a unidade não sair dele
    if (m.terrainAt(x + 16, y) === code && m.terrainAt(x - 16, y) === code) return { x, y };
  }
  throw new Error('terreno não encontrado');
}

describe('terreno real', () => {
  it('a grade tem mata amazônica, serras, rios e cidades', () => {
    const g = emptyGame();
    const count = (c: number) => g.map.terrain.filter((t) => t === c).length;
    expect(count(T_FOREST)).toBeGreaterThan(1000);
    expect(count(T_HILLS)).toBeGreaterThan(100);
    expect(count(T_RIVER)).toBeGreaterThan(200);
    expect(count(T_URBAN)).toBeGreaterThan(100);
    // Manaus está na mata amazônica; Belo Horizonte é cidade
    const manaus = g.map.project(-3.5, -62.5);
    expect(g.map.terrainAt(manaus.x, manaus.y)).toBe(T_FOREST);
    const bh = g.capital(g.map.byUf.MG);
    expect(g.map.terrainAt(bh.x, bh.y)).toBe(T_URBAN);
  });

  it('mata e rio reduzem a velocidade; mata protege', () => {
    const g = emptyGame();
    const f = findTerrain(g, T_FOREST), r = findTerrain(g, T_RIVER);
    const plainTank = add(g, 'tank', 'lula', 0, 0);
    const p = findTerrain(g, 0);
    plainTank.x = p.x; plainTank.y = p.y;
    const forestTank = add(g, 'tank', 'lula', f.x, f.y);
    const riverInf = add(g, 'infantry', 'lula', r.x, r.y);
    const vPlain = g.speedOf(plainTank, UNIT_DEFS.tank);
    expect(g.speedOf(forestTank, UNIT_DEFS.tank)).toBeCloseTo(vPlain * TERRAIN[T_FOREST].speed[1], 3);
    expect(g.speedOf(riverInf, UNIT_DEFS.infantry)).toBeLessThan(UNIT_DEFS.infantry.speed);
    const hpBefore = forestTank.hp;
    g.applyDamage({ t: 'u', id: forestTank.id }, 100, 'bolso', null);
    expect(hpBefore - forestTank.hp).toBeCloseTo(100 * TERRAIN[T_FOREST].defense, 3);
  });
});

describe('formações', () => {
  it('linha defensiva organiza a frente e, parada, reduz o dano', () => {
    const g = emptyGame();
    const c = g.capital(g.map.byUf.GO);
    const units = Array.from({ length: 6 }, (_, i) => add(g, 'infantry', 'lula', c.x + i * 3, c.y + 80));
    g.commandMove('lula', units.map((u) => u.id), c.x + 100, c.y + 80, false, 'linha');
    run(g, 15);
    expect(units.every((u) => u.form === 'linha')).toBe(true);
    expect(units.every((u) => u.order.kind === 'hold')).toBe(true);
    // espalhados numa linha perpendicular ao avanço (eixo y)
    const ys = units.map((u) => u.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(40);
    const v = units[0];
    const before = v.hp;
    g.applyDamage({ t: 'u', id: v.id }, 50, 'bolso', null);
    const terr = TERRAIN[g.map.terrainAt(v.x, v.y)].defense;
    expect(before - v.hp).toBeCloseTo(50 * terr * FORMATIONS.linha.holdDefense, 1);
  });

  it('formação dispersa reduz o dano de artilharia', () => {
    const g = emptyGame();
    const c = g.capital(g.map.byUf.MT);
    const a = add(g, 'infantry', 'lula', c.x + 200, c.y + 80);
    const b = add(g, 'infantry', 'lula', c.x + 200, c.y + 140);
    a.form = 'dispersa';
    a.order = { kind: 'hold' }; b.order = { kind: 'hold' };
    g.w.shells.push({ x0: a.x, y0: a.y - 100, x1: a.x, y1: a.y, t: 0, dur: 0.05, dmg: 40, f: 'bolso', splash: 30, src: 0 });
    g.w.shells.push({ x0: b.x, y0: b.y - 100, x1: b.x, y1: b.y, t: 0, dur: 0.05, dmg: 40, f: 'bolso', splash: 30, src: 0 });
    run(g, 0.2);
    expect(a.maxHp - a.hp).toBeLessThan((b.maxHp - b.hp) * 0.7);
  });

  it('escolta acompanha a unidade protegida', () => {
    const g = emptyGame();
    const c = g.capital(g.map.byUf.GO);
    const vip = add(g, 'artillery', 'lula', c.x, c.y + 60);
    const guards = [add(g, 'tank', 'lula', c.x - 120, c.y + 60), add(g, 'tank', 'lula', c.x - 130, c.y + 70)];
    expect(applyCommand(g, 'lula', null, { k: 'move', ids: guards.map((u) => u.id), x: vip.x, y: vip.y, aggressive: true, form: 'escolta', escort: vip.id })).toBeNull();
    g.commandMove('lula', [vip.id], c.x + 250, c.y + 60, false);
    run(g, 25);
    for (const gd of guards) expect(Math.hypot(gd.x - vip.x, gd.y - vip.y)).toBeLessThan(70);
  });
});

describe('veterania e moral', () => {
  it('abates promovem a unidade (com limite) e aumentam a vida máxima', () => {
    const g = emptyGame();
    const c = g.capital(g.map.byUf.MT);
    const tank = add(g, 'tank', 'bolso', c.x + 200, c.y + 80);
    for (let i = 0; i < 12; i++) {
      const v = add(g, 'infantry', 'lula', tank.x + 20, tank.y);
      v.hp = 1;
      g.applyDamage({ t: 'u', id: v.id }, 10, 'bolso', tank);
    }
    expect(rankOf(tank.xp)).toBeGreaterThanOrEqual(2);
    expect(tank.maxHp).toBe(Math.round(UNIT_DEFS.tank.hp * (1 + rankOf(tank.xp) * RANK_BONUS)));
    tank.xp = 999;
    expect(rankOf(tank.xp)).toBe(3);
  });

  it('tropa desmoralizada recua para a capital própria', () => {
    const g = emptyGame();
    const c = g.capital(g.map.byUf.TO);
    const u = add(g, 'infantry', 'lula', c.x, c.y + 150);
    u.morale = MORALE.broken - 5;
    u.lastHitT = g.w.time;
    g.w.timers.supply = 0;
    run(g, 0.6);
    expect(u.routed).toBe(true);
    expect(u.order.kind).toBe('move');
  });
});

describe('névoa, reconhecimento, reservas e eventos', () => {
  it('a névoa esconde unidades distantes e o sensor do batedor as revela', () => {
    const g = emptyGame({ fog: true });
    const c = g.capital(g.map.byUf.MT);
    const scout = add(g, 'recon', 'lula', c.x + 400, c.y + 200);
    const hidden = add(g, 'tank', 'bolso', scout.x + 600, scout.y);
    run(g, 0.1);
    expect(g.isVisible('lula', hidden.x, hidden.y)).toBe(false);
    expect(g.visibleUnitsOf('bolso', 'lula').some((u) => u.id === hidden.id)).toBe(false);
    // a IA também não conta o que não vê
    expect(g.powerNear(hidden.x, hidden.y, 100, 'bolso', 'lula')).toBe(0);
    scout.x = hidden.x - 250;
    expect(g.reconSensor('lula', [scout.id])).toBeNull();
    run(g, 0.1);
    expect(g.isVisible('lula', hidden.x, hidden.y)).toBe(true);
    expect(g.reconSensor('lula', [scout.id])).toMatch(/recarga/);
  });

  it('reservas só em estado ameaçado, com custo e recarga', () => {
    const g = emptyGame();
    const pe = g.map.byUf.PE;
    expect(g.callReserves('lula', pe)).toMatch(/ameaça/);
    g.w.states[pe].lastAttackT = g.w.time;
    const n0 = g.unitsOf('lula').length;
    expect(g.callReserves('lula', pe)).toBeNull();
    expect(g.unitsOf('lula').length).toBe(n0 + 3);
    expect(g.callReserves('lula', pe)).toMatch(/recarga/);
  });

  it('eventos fictícios acontecem e expiram', () => {
    const g = Game.create(defaultSettings({ seed: 3, enemyAI: false, events: true }));
    g.w.units = [];
    const gg = new Game(g.w);
    gg.w.timers.event = 1;
    run(gg, 2);
    expect(gg.w.gevents.length).toBe(1);
    expect(gg.w.log.some((l) => l.text.startsWith('Evento:'))).toBe(true);
  });

  it('transferência de unidades entre funções', () => {
    const g = emptyGame();
    const u = add(g, 'tank', 'lula', 1500, 1500);
    expect(u.ctrl).toBe('blindados');
    expect(applyCommand(g, 'lula', ['infantaria'], { k: 'transfer', ids: [u.id], to: 'infantaria' })).toMatch(/sob o seu comando/);
    expect(applyCommand(g, 'lula', ['blindados'], { k: 'transfer', ids: [u.id], to: 'infantaria' })).toBeNull();
    expect(u.ctrl).toBe('infantaria');
    expect(applyCommand(g, 'lula', ['infantaria'], { k: 'stop', ids: [u.id] })).toBeNull();
  });
});

describe('compatibilidade de saves', () => {
  it('migra saves da versão 1.0 (v3) preservando a partida', () => {
    const g = Game.create(defaultSettings({ seed: 12 }));
    run(g, 20);
    const old = JSON.parse(g.toJSON()) as World & Record<string, unknown>;
    // simula o formato da 1.0
    old.version = 3;
    delete (old as Partial<World>).teamObjective;
    delete (old as Partial<World>).reveals;
    delete (old as Partial<World>).gevents;
    for (const u of old.units) for (const k of ['ctrl', 'xp', 'morale', 'form', 'escort', 'routed', 'stillT']) delete (u as unknown as Record<string, unknown>)[k];
    for (const s of old.states) delete (s as unknown as Record<string, unknown>).reserveT;
    const migrated = Game.fromJSON(JSON.stringify(old));
    expect(migrated.w.version).toBe(4);
    expect(migrated.w.units.length).toBe(g.w.units.length);
    expect(migrated.w.units.every((u) => !!u.ctrl && u.morale > 0)).toBe(true);
    run(migrated, 10);
    expect(migrated.w.time).toBeGreaterThan(29);
    void migrateWorld;
  });
});
