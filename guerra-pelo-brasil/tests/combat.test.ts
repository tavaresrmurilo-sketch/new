import { describe, expect, it } from 'vitest';
import { add, emptyGame, run } from './util';

describe('combate real', () => {
  it('tanque destrói infantaria e sofre dano no processo', () => {
    const g = emptyGame();
    const c = g.capital(g.map.byUf.MT);
    const tank = add(g, 'tank', 'bolso', c.x - 30, c.y + 60);
    const inf = add(g, 'infantry', 'lula', c.x + 10, c.y + 60);
    run(g, 40, () => inf.hp <= 0);
    expect(inf.hp).toBeLessThanOrEqual(0);
    expect(g.unit(inf.id)).toBeUndefined();
    expect(tank.hp).toBeLessThan(tank.maxHp);
    expect(g.w.factions.bolso.stats.killed).toBe(1);
    expect(g.w.factions.lula.stats.lost).toBe(1);
  });

  it('ordem de ataque persegue e elimina o alvo', () => {
    const g = emptyGame();
    const c = g.capital(g.map.byUf.GO);
    const att = [add(g, 'tank', 'bolso', c.x - 150, c.y + 80), add(g, 'tank', 'bolso', c.x - 160, c.y + 90)];
    const target = add(g, 'artillery', 'lula', c.x + 60, c.y + 90);
    g.commandAttack('bolso', att.map((u) => u.id), { t: 'u', id: target.id });
    run(g, 60, () => target.hp <= 0);
    expect(target.hp).toBeLessThanOrEqual(0);
  });

  it('artilharia causa dano em área a várias unidades', () => {
    const g = emptyGame();
    const c = g.capital(g.map.byUf.MT);
    add(g, 'artillery', 'bolso', c.x - 150, c.y + 70);
    const group = [0, 1, 2, 3].map((i) => add(g, 'infantry', 'lula', c.x + (i % 2) * 8, c.y + 70 + Math.floor(i / 2) * 8));
    for (const u of group) u.order = { kind: 'hold' };
    run(g, 12);
    const hit = group.filter((u) => u.hp < u.maxHp).length;
    expect(hit).toBeGreaterThanOrEqual(2);
  });

  it('aviões gastam munição e voltam à base aérea para rearmar', () => {
    const g = emptyGame();
    const rj = g.map.byUf.RJ;
    g.w.states[rj].owner = 'lula';
    const c = g.capital(rj);
    const plane = g.spawnUnit('plane', 'lula', rj);
    const mg = g.capital(g.map.byUf.MG);
    for (let i = 0; i < 4; i++) add(g, 'infantry', 'bolso', mg.x + 160 + i * 10, mg.y + 120);
    g.commandMove('lula', [plane.id], mg.x + 165, mg.y + 120, true);
    let rearmDist = -1;
    let resumed = false;
    run(g, 120, () => {
      if (plane.phase === 'rearm' && rearmDist < 0) rearmDist = Math.hypot(plane.x - c.x, plane.y - c.y);
      if (rearmDist >= 0 && plane.phase === 'sortie') resumed = true;
      return resumed;
    });
    expect(g.w.factions.lula.stats.damage).toBeGreaterThan(0);
    // pousou na base aérea do RJ para rearmar...
    expect(rearmDist).toBeGreaterThanOrEqual(0);
    expect(rearmDist).toBeLessThan(30);
    // ...e voltou à missão com munição cheia
    expect(resumed).toBe(true);
    expect(plane.ammo).toBe(4);
    // a ordem "voltar à base" encerra a missão
    g.commandRTB('lula', [plane.id]);
    run(g, 60, () => plane.phase === 'ready');
    expect(plane.phase).toBe('ready');
  });

  it('guarnições atiram em invasores e helicópteros caçam tanques', () => {
    const g = emptyGame();
    const pa = g.map.byUf.PA;
    const c = g.capital(pa);
    const inf = add(g, 'infantry', 'bolso', c.x + 40, c.y);
    inf.order = { kind: 'hold' };
    run(g, 6);
    expect(inf.hp).toBeLessThan(inf.maxHp);
    const heli = add(g, 'heli', 'lula', c.x - 300, c.y + 300);
    const tank = add(g, 'tank', 'bolso', c.x - 340, c.y + 300);
    run(g, 40, () => tank.hp <= 0);
    expect(tank.hp).toBeLessThanOrEqual(0);
    expect(heli.hp).toBeGreaterThan(0);
  });
});
