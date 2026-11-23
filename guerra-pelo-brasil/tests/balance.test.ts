// Testes de equilíbrio por simulação de partidas completas (IA × IA, sementes fixas).
// As facções precisam ter chances equivalentes e a dificuldade precisa importar.
import { describe, expect, it } from 'vitest';
import { aiVsAi, runFor } from './helpers';
import type { Difficulty, Faction, MatchSettings } from '../shared/sim/types';

function series(dl: Difficulty, db: Difficulty, seeds: number[], extra: Partial<MatchSettings> = {}) {
  const wins: Record<Faction, number> = { lula: 0, bolso: 0 };
  for (const seed of seeds) {
    const g = aiVsAi(dl, db, seed, { maxDuration: 45, ...extra });
    runFor(g, 2800);
    if (g.w.winner) wins[g.w.winner]++;
  }
  return wins;
}

const range = (a: number, n: number) => Array.from({ length: n }, (_, i) => a + i);

describe('equilíbrio das facções', () => {
  it('Normal × Normal sem névoa: nenhuma facção domina', { timeout: 300000 }, () => {
    const w = series('normal', 'normal', range(40, 12));
    expect(w.lula).toBeGreaterThanOrEqual(3);
    expect(w.bolso).toBeGreaterThanOrEqual(3);
  });

  it('Normal × Normal com névoa: nenhuma facção domina', { timeout: 300000 }, () => {
    const w = series('normal', 'normal', range(40, 12), { fog: true });
    expect(w.lula).toBeGreaterThanOrEqual(3);
    expect(w.bolso).toBeGreaterThanOrEqual(3);
  });

  it('a dificuldade importa para os dois lados (Insano vence Fácil)', { timeout: 300000 }, () => {
    const a = series('insano', 'facil', range(60, 4));
    const b = series('facil', 'insano', range(60, 4));
    expect(a.lula).toBeGreaterThanOrEqual(3);
    expect(b.bolso).toBeGreaterThanOrEqual(3);
  });
});
