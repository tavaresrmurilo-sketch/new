import { describe, expect, it } from 'vitest';
import { emptyGame, run } from './util';
import { Game } from '../shared/sim/game';
import { defaultSettings } from '../shared/sim/setup';
import { UNIT_DEFS } from '../shared/data/units';

describe('economia, produção e construções', () => {
  it('estados geram recursos continuamente', () => {
    const g = emptyGame();
    const before = { ...g.w.factions.lula.res };
    run(g, 10);
    const after = g.w.factions.lula.res;
    expect(after.money).toBeGreaterThan(before.money);
    expect(after.steel).toBeGreaterThan(before.steel);
    expect(g.w.factions.lula.income.money).toBeGreaterThan(0);
  });

  it('recrutar custa recursos, respeita requisitos e produz a unidade', () => {
    const g = emptyGame();
    const hq = g.w.factions.lula.hq;
    const money0 = g.w.factions.lula.res.money;
    expect(g.recruit('lula', hq, 'infantry')).toBeNull();
    expect(g.w.factions.lula.res.money).toBe(money0 - g.costOf('lula', 'infantry').money);
    // sem base aérea na sede: helicóptero é recusado
    expect(g.recruit('lula', hq, 'heli')).toMatch(/Base Aérea/);
    // estado inimigo é recusado
    expect(g.recruit('lula', g.w.factions.bolso.hq, 'infantry')).toMatch(/não pertence/);
    run(g, UNIT_DEFS.infantry.buildTime + 2);
    expect(g.unitsOf('lula').some((u) => u.type === 'infantry')).toBe(true);
    expect(g.w.factions.lula.stats.produced).toBe(1);
  });

  it('não permite tropas infinitas: recursos e limite de tropas', () => {
    const g = emptyGame();
    const fr = g.w.factions.lula;
    fr.res = { money: 0, fuel: 0, steel: 0, supplies: 0 };
    expect(g.recruit('lula', fr.hq, 'infantry')).toMatch(/insuficientes/);
    fr.res = { money: 1e6, fuel: 1e6, steel: 1e6, supplies: 1e6 };
    let err: string | null = null;
    for (let i = 0; i < 300 && !err; i++) {
      for (const s of g.statesOf('lula')) {
        if (!g.w.states[s].b.barracks) continue;
        err = g.recruit('lula', s, 'infantry');
        if (err && !/Fila/.test(err)) break;
        err = null;
      }
      run(g, 1);
    }
    expect(err).toMatch(/Limite de tropas/);
    expect(fr.pop).toBeLessThanOrEqual(fr.popCap);
  });

  it('cancelar a fila reembolsa o custo', () => {
    const g = emptyGame();
    const fr = g.w.factions.lula;
    const m = fr.res.money;
    g.recruit('lula', fr.hq, 'tank');
    g.cancelRecruit('lula', fr.hq, 0);
    expect(fr.res.money).toBe(m);
  });

  it('construções ficam prontas e liberam produção', () => {
    const g = emptyGame();
    const ba = g.map.byUf.BA;
    const fr = g.w.factions.lula;
    fr.res = { money: 5000, fuel: 5000, steel: 5000, supplies: 5000 };
    expect(g.build('lula', ba, 'airbase')).toBeNull();
    expect(g.build('lula', ba, 'factory')).toMatch(/obra/);
    run(g, 60, () => g.w.states[ba].b.airbase > 0);
    expect(g.w.states[ba].b.airbase).toBe(1);
    expect(g.recruit('lula', ba, 'heli')).toBeNull();
  });

  it('fortificação aumenta a guarnição', () => {
    const g = emptyGame();
    const pe = g.map.byUf.PE;
    g.w.factions.lula.res.money = 5000;
    g.w.factions.lula.res.steel = 5000;
    const max0 = g.w.states[pe].gMax;
    g.build('lula', pe, 'fort');
    run(g, 40, () => !g.w.states[pe].cons);
    expect(g.w.states[pe].gMax).toBeGreaterThan(max0);
  });

  it('estado isolado da sede rende metade', () => {
    const g = emptyGame();
    const rr = g.map.byUf.RR;
    g.w.states[rr].owner = 'lula';
    g.recomputeEconomy();
    expect(g.w.states[rr].connected).toBe(false);
    const inc1 = g.w.factions.lula.income.money;
    g.w.states[rr].b.depot = 1;
    g.recomputeEconomy();
    expect(g.w.states[rr].connected).toBe(true);
    expect(g.w.factions.lula.income.money).toBeGreaterThan(inc1);
  });

  it('mercado troca recursos com perda', () => {
    const g = emptyGame();
    const fr = g.w.factions.lula;
    fr.res.supplies = 500; fr.res.money = 0;
    expect(g.trade('lula', 'supplies', 'money', 200)).toBeNull();
    expect(fr.res.money).toBe(100);
    expect(g.trade('lula', 'supplies', 'money', 9999)).toMatch(/insuficientes/);
  });

  it('habilidades dos comandantes têm custo, efeito e recarga', () => {
    const g = Game.create(defaultSettings({ seed: 9, enemyAI: false }));
    const fl = g.w.factions.lula;
    fl.res = { money: 5000, fuel: 5000, steel: 5000, supplies: 5000 };
    const n0 = g.unitsOf('lula').length;
    expect(g.useAbility('lula', 'massa')).toBeNull();
    expect(g.unitsOf('lula').length).toBe(n0 + 6);
    expect(g.useAbility('lula', 'massa')).toMatch(/recarga/);
    expect(g.useAbility('lula', 'industria')).toBeNull();
    expect(g.costOf('lula', 'tank').money).toBeLessThan(200);
    const fb = g.w.factions.bolso;
    fb.res = { money: 5000, fuel: 5000, steel: 5000, supplies: 5000 };
    expect(g.useAbility('bolso', 'blitz')).toBeNull();
    const t = g.unitsOf('bolso').find((u) => u.type === 'tank')!;
    expect(g.speedOf(t, UNIT_DEFS.tank)).toBeGreaterThan(UNIT_DEFS.tank.speed * 1.5);
    expect(g.useAbility('bolso', 'coordenado')).toMatch(/ponto/);
    const c = g.capital(g.map.byUf.MG);
    expect(g.useAbility('bolso', 'coordenado', { x: c.x, y: c.y })).toBeNull();
    expect(g.w.shells.length).toBeGreaterThan(5);
  });
});
