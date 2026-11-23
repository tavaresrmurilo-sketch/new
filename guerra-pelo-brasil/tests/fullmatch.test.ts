// Partidas completas simuladas (sem interface) para verificar vitória e derrota.
import { describe, expect, it } from 'vitest';
import { Game, EXEC_TURN_SECONDS } from '../shared/sim/game';
import { defaultSettings } from '../shared/sim/setup';
import { aiVsAi } from './helpers';
import { run } from './util';
import type { SimEvent } from '../shared/sim/types';

function collectGameOver(g: Game): SimEvent[] {
  return g.events.filter((e) => e.k === 'gameover');
}

describe('partida completa simulada', () => {
  it('IA × IA até o fim: há um vencedor, evento de fim de jogo e regras de rendição respeitadas', () => {
    const g = aiVsAi('normal', 'normal', 24);
    let over: SimEvent[] = [];
    for (let i = 0; i < 2400 / 0.05 && !g.w.winner; i++) {
      g.step(0.05);
      const o = collectGameOver(g);
      if (o.length) over = o;
      if (g.events.length > 1000) g.events.length = 0;
    }
    expect(g.w.winner).not.toBeNull();
    expect(over).toHaveLength(1);
    const winner = g.w.winner!;
    const loser = winner === 'lula' ? 'bolso' : 'lula';
    const ws = g.statesOf(winner).length, ls = g.statesOf(loser).length;
    expect(ws === 27 || ls === 0 || (ls <= 2 && ws >= 15)).toBe(true);
    expect(g.w.endReason.length).toBeGreaterThan(10);
    // após o fim, a simulação congela
    const t = g.w.time;
    run(g, 5);
    expect(g.w.time).toBe(t);
  });

  it('jogador vence quando domina os 27 territórios', () => {
    const g = Game.create(defaultSettings({ mode: 'campanha', player: 'bolso', seed: 5 }));
    for (const s of g.w.states) if (s.owner !== 'bolso') g.transferState(s, 'bolso');
    g.checkVictory();
    expect(g.w.winner).toBe('bolso');
    expect(g.w.endReason).toMatch(/26 estados/);
  });

  it('jogador perde quando o inimigo força a rendição', () => {
    const g = Game.create(defaultSettings({ mode: 'campanha', player: 'lula', seed: 6 }));
    const keep = new Set([g.w.factions.lula.hq]);
    let n = 0;
    for (const s of g.w.states) {
      if (keep.has(s.i)) continue;
      if (n++ < 20) g.transferState(s, 'bolso');
    }
    g.checkVictory();
    expect(g.w.winner).toBe('bolso');
    expect(g.w.factions.lula.surrendered).toBe(true);
  });

  it('render-se encerra a partida em derrota', () => {
    const g = Game.create(defaultSettings({ seed: 8 }));
    g.surrender('lula');
    expect(g.w.winner).toBe('bolso');
    expect(g.w.endReason).toMatch(/rendição/);
  });

  it('modo local por turnos: planejamento alternado e execução simultânea', () => {
    const g = Game.create(defaultSettings({ mode: 'local', seed: 4, enemyAI: false }));
    expect(g.w.factions.lula.control).toBe('human');
    expect(g.w.factions.bolso.control).toBe('human');
    expect(g.w.turn).toMatchObject({ phase: 'plan', active: 'lula', n: 1 });
    // durante o planejamento o tempo não passa e só o jogador ativo comanda
    run(g, 5);
    expect(g.w.time).toBe(0);
    expect(g.canCommand('lula')).toBe(true);
    expect(g.canCommand('bolso')).toBe(false);
    const inf = g.unitsOf('lula').find((u) => u.type === 'infantry')!;
    const target = g.capital(g.map.byUf.PA);
    g.commandMove('lula', [inf.id], target.x, target.y, true);
    g.endPlanning();
    expect(g.w.turn).toMatchObject({ phase: 'plan', active: 'bolso' });
    expect(g.canCommand('bolso')).toBe(true);
    g.endPlanning();
    expect(g.w.turn!.phase).toBe('exec');
    expect(g.canCommand('lula')).toBe(false);
    const x0 = inf.x;
    run(g, EXEC_TURN_SECONDS + 1);
    expect(inf.x).not.toBe(x0);
    expect(g.w.time).toBeCloseTo(EXEC_TURN_SECONDS, 0);
    expect(g.w.turn).toMatchObject({ phase: 'plan', active: 'lula', n: 2 });
  });

  it('sandbox: recursos ilimitados e IA opcional', () => {
    const g = Game.create(defaultSettings({ mode: 'sandbox', player: 'lula', seed: 2, enemyAI: false }));
    const fr = g.w.factions.lula;
    expect(fr.infinite).toBe(true);
    expect(g.w.ai.bolso).toBeNull();
    for (let i = 0; i < 6; i++) expect(g.recruit('lula', fr.hq, 'infantry')).toBeNull();
    run(g, 2);
    expect(fr.res.money).toBeGreaterThan(90000);
    const n0 = g.unitsOf('bolso').length;
    run(g, 60);
    expect(g.unitsOf('bolso').length).toBe(n0);
  });
});
