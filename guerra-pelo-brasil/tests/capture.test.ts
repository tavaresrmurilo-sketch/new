import { describe, expect, it } from 'vitest';
import { add, emptyGame, run } from './util';

describe('captura de territórios por combate e ocupação', () => {
  it('tropas destroem a guarnição, eliminam a milícia e ocupam a capital', () => {
    const g = emptyGame();
    const pa = g.map.byUf.PA;
    const c = g.capital(pa);
    const militia = [0, 1, 2].map((i) => add(g, 'militia', 'neutral', c.x + i * 6, c.y + 10, pa));
    const g2 = g;
    const army = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => add(g2, i < 6 ? 'infantry' : 'tank', 'lula', c.x - 260 + (i % 4) * 10, c.y + 120 + Math.floor(i / 4) * 10));
    g2.commandMove('lula', army.map((u) => u.id), c.x, c.y, true);
    expect(g2.w.states[pa].owner).toBe('neutral');
    run(g2, 180, () => g2.w.states[pa].owner === 'lula');
    expect(g2.w.states[pa].owner).toBe('lula');
    expect(militia.every((m) => m.hp <= 0)).toBe(true);
    expect(g2.w.factions.lula.stats.captured).toBe(1);
    expect(g2.w.states[pa].gHp).toBeGreaterThan(0);
  });

  it('não há ocupação enquanto a guarnição resiste ou há defensores', () => {
    const g = emptyGame();
    const pa = g.map.byUf.PA;
    const c = g.capital(pa);
    const inf = add(g, 'infantry', 'lula', c.x + 10, c.y);
    inf.order = { kind: 'hold' };
    g.w.states[pa].gHp = g.w.states[pa].gMax;
    run(g, 3);
    expect(g.w.states[pa].capP).toBe(0);
    g.w.states[pa].gHp = 0;
    const def = add(g, 'infantry', 'neutral', c.x - 10, c.y);
    def.hp = 1e9; def.maxHp = 1e9;
    run(g, 3);
    expect(g.w.states[pa].capP).toBe(0);
  });

  it('perder a sede transfere o governo e causa crise', () => {
    const g = emptyGame();
    const hq = g.w.factions.bolso.hq;
    g.transferState(g.w.states[hq], 'lula');
    expect(g.w.states[hq].owner).toBe('lula');
    expect(g.w.factions.bolso.hq).not.toBe(hq);
    expect(g.w.states[g.w.factions.bolso.hq].owner).toBe('bolso');
    expect(g.w.factions.bolso.crisisT).toBeGreaterThan(0);
  });
});
