import { Game } from '../src/sim/game';
import { defaultSettings, newAIState } from '../src/sim/setup';
import type { Difficulty, MatchSettings } from '../src/sim/types';

/** Cria uma partida com as duas facções controladas pela IA. */
export function aiVsAi(lula: Difficulty, bolso: Difficulty, seed: number, extra: Partial<MatchSettings> = {}): Game {
  const g = Game.create(defaultSettings({ mode: 'rapida', player: 'lula', difficulty: bolso, seed, ...extra }));
  g.w.factions.lula.control = 'ai';
  g.w.factions.lula.difficulty = lula;
  g.w.ai.lula = newAIState();
  g.w.factions.bolso.difficulty = bolso;
  g.recomputeEconomy();
  return g;
}

export function runFor(g: Game, seconds: number, stopOnWin = true): void {
  const steps = Math.round(seconds / 0.05);
  for (let i = 0; i < steps; i++) {
    g.step(0.05);
    if (g.events.length > 1000) g.events.length = 0;
    if (stopOnWin && g.w.winner) return;
  }
}

export function summary(g: Game): string {
  const w = g.w;
  const c = (f: 'lula' | 'bolso') => g.statesOf(f).length;
  const u = (f: 'lula' | 'bolso') => g.unitsOf(f).length;
  return `t=${w.time.toFixed(0)}s L:${c('lula')}st/${u('lula')}u B:${c('bolso')}st/${u('bolso')}u N:${g.statesOf('neutral').length} win=${w.winner ?? '-'}`;
}
