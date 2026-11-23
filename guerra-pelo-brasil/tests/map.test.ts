import { describe, expect, it } from 'vitest';
import { getMap } from '../src/sim/map';
import { Navigator } from '../src/sim/nav';
import { STATE_INFO } from '../src/data/states';

const map = getMap();

describe('mapa real do Brasil', () => {
  it('tem os 26 estados e o Distrito Federal', () => {
    expect(map.states).toHaveLength(27);
    const ufs = map.states.map((s) => s.uf).sort();
    expect(ufs).toEqual(STATE_INFO.map((s) => s.uf).sort());
    expect(ufs).toContain('DF');
  });

  it('cada capital fica em terreno navegável dentro do próprio estado', () => {
    for (const s of map.states) {
      expect(map.isWalkable(s.capital.x, s.capital.y), s.uf).toBe(true);
      expect(map.stateAt(s.capital.x, s.capital.y), s.uf).toBe(s.i);
    }
  });

  it('capitais projetadas ficam perto das coordenadas reais', () => {
    for (const s of map.states) {
      const real = map.project(s.info.lat, s.info.lon);
      expect(Math.hypot(real.x - s.capital.x, real.y - s.capital.y), s.uf).toBeLessThan(70);
    }
  });

  it('adjacências são simétricas e geograficamente corretas', () => {
    const uf = (u: string) => map.byUf[u];
    for (const s of map.states) for (const n of s.adj) expect(map.states[n].adj).toContain(s.i);
    expect(map.states[uf('RS')].adj).toEqual([uf('SC')]);
    expect(map.states[uf('AP')].adj).toEqual([uf('PA')]);
    expect(map.isAdjacent(uf('DF'), uf('GO'))).toBe(true);
    expect(map.isAdjacent(uf('DF'), uf('MG'))).toBe(true);
    expect(map.isAdjacent(uf('SP'), uf('BA'))).toBe(false);
    expect(map.borders.length).toBe(51);
  });

  it('o ponto de rótulo de cada estado está dentro do polígono real', () => {
    for (const s of map.states) expect(map.stateAtPrecise(s.label.x, s.label.y), s.uf).toBe(s.i);
  });

  it('encontra rotas terrestres por terra entre extremos do país', () => {
    const nav = new Navigator(map);
    const a = map.states[map.byUf.RS].capital, b = map.states[map.byUf.RR].capital;
    const path = nav.find(a.x, a.y, b.x, b.y);
    expect(path).not.toBeNull();
    let px = a.x, py = a.y;
    for (let i = 0; i < path!.length; i += 2) {
      expect(map.isWalkable(path![i], path![i + 1])).toBe(true);
      expect(nav.los(px, py, path![i], path![i + 1])).toBe(true);
      px = path![i]; py = path![i + 1];
    }
    expect(Math.hypot(px - b.x, py - b.y)).toBeLessThan(20);
  });
});
