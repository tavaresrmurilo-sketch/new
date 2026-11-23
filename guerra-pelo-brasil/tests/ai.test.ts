import { describe, expect, it } from 'vitest';
import { Game } from '../src/sim/game';
import { defaultSettings } from '../src/sim/setup';
import { run } from './util';
import type { Difficulty } from '../src/sim/types';

function vsAI(d: Difficulty, seed: number): Game {
  // jogador humano parado: só a IA age
  return Game.create(defaultSettings({ mode: 'campanha', player: 'lula', difficulty: d, seed }));
}

describe('inteligência artificial', () => {
  it('produz tropas, constrói, expande e ataca', () => {
    const g = vsAI('normal', 5);
    const n0 = g.unitsOf('bolso').length;
    const s0 = g.statesOf('bolso').length;
    run(g, 300);
    const fb = g.w.factions.bolso;
    expect(fb.stats.produced).toBeGreaterThan(10);
    expect(g.statesOf('bolso').length).toBeGreaterThan(s0);
    expect(g.unitsOf('bolso').length + fb.stats.lost).toBeGreaterThan(n0);
    const built = g.w.states.filter((s) => s.owner === 'bolso').reduce((a, s) => a + s.b.barracks + s.b.factory + s.b.airbase + s.b.depot + s.b.fort, 0);
    expect(built).toBeGreaterThan(6);
  });

  it('derrota um jogador passivo (o humano que não faz nada perde)', () => {
    const g = vsAI('dificil', 11);
    run(g, 2400, () => !!g.w.winner);
    expect(g.w.winner).toBe('bolso');
  });

  it('defende a própria sede quando atacada', () => {
    const g = vsAI('normal', 3);
    run(g, 30);
    const hq = g.w.factions.bolso.hq;
    const c = g.capital(hq);
    // invasão: força lula aparece perto da sede da IA
    for (let i = 0; i < 10; i++) g.addUnitAt(i < 6 ? 'infantry' : 'tank', 'lula', c.x + 150 + (i % 5) * 10, c.y + 40 + Math.floor(i / 5) * 10);
    run(g, 6);
    const ai = g.w.ai.bolso!;
    const defend = ai.groups.find((gr) => gr.task === 'defend' && gr.target === hq);
    expect(defend).toBeTruthy();
    expect(defend!.units.length).toBeGreaterThan(0);
  });

  it('IA insana vence IA fácil', () => {
    for (const seed of [21, 22]) {
      const g = Game.create(defaultSettings({ mode: 'rapida', player: 'lula', difficulty: 'facil', seed }));
      g.w.factions.lula.control = 'ai';
      g.w.factions.lula.difficulty = 'insano';
      g.w.ai.lula = { nextThink: 1, groups: [], nextGroupId: 1, strategy: 'expansao', lost: [], lastAbilityT: -999, focus: -1 };
      run(g, 2400, () => !!g.w.winner);
      expect(g.w.winner, `seed ${seed}`).toBe('lula');
    }
  });
});
