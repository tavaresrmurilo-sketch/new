import { describe, expect, it } from 'vitest';
import { Game } from '../src/sim/game';
import { defaultSettings } from '../src/sim/setup';
import { run } from './util';

describe('salvamento', () => {
  it('salvar e carregar preserva a partida e continua de forma idêntica', () => {
    const a = Game.create(defaultSettings({ mode: 'campanha', seed: 77, difficulty: 'normal' }));
    run(a, 120);
    const json = a.toJSON();
    const b = Game.fromJSON(json);
    expect(b.toJSON()).toBe(json);
    run(a, 90);
    run(b, 90);
    expect(b.w.time).toBeCloseTo(a.w.time, 5);
    expect(b.w.units.length).toBe(a.w.units.length);
    expect(b.w.states.map((s) => s.owner)).toEqual(a.w.states.map((s) => s.owner));
    expect(b.toJSON()).toBe(a.toJSON());
  });

  it('rejeita saves inválidos ou de outra versão', () => {
    expect(() => Game.fromJSON('{"version":1}')).toThrow();
    expect(() => Game.fromJSON('lixo')).toThrow();
  });

  it('o save é compacto', () => {
    const a = Game.create(defaultSettings({ seed: 3 }));
    run(a, 300);
    expect(a.toJSON().length).toBeLessThan(400_000);
  });
});
