// Objetivos de campanha (valem para as duas facções, inclusive a IA).
import { enemyOf } from '../data/factions';
import type { Game } from './game';
import type { Faction, Res } from './types';

export interface Objective {
  id: string;
  name: string;
  desc: string;
  reward: Res;
  check: (g: Game, f: Faction) => boolean;
}

const R = (money: number, fuel: number, steel: number, supplies: number): Res => ({ money, fuel, steel, supplies });
const owns = (g: Game, f: Faction, uf: string) => g.w.states[g.map.byUf[uf]].owner === f;

export const OBJECTIVES: Objective[] = [
  {
    id: 'expansao',
    name: 'Expansão',
    desc: 'Capture 3 estados.',
    reward: R(400, 0, 0, 200),
    check: (g, f) => g.w.factions[f].stats.captured >= 3,
  },
  {
    id: 'planalto',
    name: 'Tomar o Planalto',
    desc: 'Controle o Distrito Federal (Brasília).',
    reward: R(600, 100, 100, 0),
    check: (g, f) => owns(g, f, 'DF'),
  },
  {
    id: 'sudeste',
    name: 'Eixo Sudeste',
    desc: 'Controle SP, RJ, MG e ES ao mesmo tempo.',
    reward: R(300, 300, 300, 0),
    check: (g, f) => ['SP', 'RJ', 'MG', 'ES'].every((u) => owns(g, f, u)),
  },
  {
    id: 'amazonia',
    name: 'Amazônia',
    desc: 'Controle AM, PA, AC, RO, RR e AP.',
    reward: R(300, 200, 200, 200),
    check: (g, f) => ['AM', 'PA', 'AC', 'RO', 'RR', 'AP'].every((u) => owns(g, f, u)),
  },
  {
    id: 'decapitacao',
    name: 'Decapitação',
    desc: 'Capture a sede original do inimigo.',
    reward: R(800, 0, 200, 0),
    check: (g, f) => g.w.states[g.w.factions[enemyOf(f)].origHq].owner === f,
  },
  {
    id: 'meio',
    name: 'Meio Brasil',
    desc: 'Controle 14 estados.',
    reward: R(500, 200, 200, 300),
    check: (g, f) => g.statesOf(f).length >= 14,
  },
];
