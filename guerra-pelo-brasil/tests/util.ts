import { Game } from '../shared/sim/game';
import { defaultSettings } from '../shared/sim/setup';
import type { MatchSettings, Owner, UnitType } from '../shared/sim/types';

/** Partida sem IA e sem tropas, para cenários controlados. */
export function emptyGame(extra: Partial<MatchSettings> = {}): Game {
  const g = Game.create(defaultSettings({ mode: 'rapida', seed: 42, enemyAI: false, ...extra }));
  g.w.units = [];
  return new Game(g.w);
}

export function add(g: Game, type: UnitType, f: Owner, x: number, y: number, home = -1) {
  return g.addUnitAt(type, f, x, y, home);
}

export function run(g: Game, seconds: number, until?: () => boolean): void {
  for (let i = 0; i < Math.round(seconds / 0.05); i++) {
    g.step(0.05);
    if (g.events.length > 2000) g.events.length = 0;
    if (until && until()) return;
  }
}
