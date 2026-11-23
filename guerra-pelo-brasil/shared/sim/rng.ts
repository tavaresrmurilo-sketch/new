// Gerador pseudoaleatório determinístico (mulberry32). O estado fica no World,
// assim partidas salvas continuam reproduzíveis.
import type { World } from './types';

export function rand(w: World): number {
  let t = (w.rng = (w.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randRange(w: World, a: number, b: number): number {
  return a + (b - a) * rand(w);
}
