import type { BuildingType, Res } from '../sim/types';

export interface BuildingDef {
  type: BuildingType;
  name: string;
  desc: string;
  /** custo por nível (fortificação tem 3 níveis) */
  cost: Res[];
  time: number[];
  maxLevel: number;
  usesSlot: boolean;
}

const R = (money: number, fuel: number, steel: number, supplies: number): Res => ({ money, fuel, steel, supplies });

export const BUILDING_DEFS: Record<BuildingType, BuildingDef> = {
  barracks: {
    type: 'barracks',
    name: 'Quartel',
    desc: 'Recruta Infantaria e Apoio Logístico. +2 de limite de tropas.',
    cost: [R(200, 0, 40, 20)], time: [20], maxLevel: 1, usesSlot: true,
  },
  factory: {
    type: 'factory',
    name: 'Fábrica Militar',
    desc: 'Produz Tanques e Artilharia. +3 de capacidade industrial.',
    cost: [R(400, 20, 120, 0)], time: [35], maxLevel: 1, usesSlot: true,
  },
  airbase: {
    type: 'airbase',
    name: 'Base Aérea',
    desc: 'Produz Helicópteros e Aviões; aviões rearmam e reabastecem aqui.',
    cost: [R(450, 40, 100, 0)], time: [35], maxLevel: 1, usesSlot: true,
  },
  depot: {
    type: 'depot',
    name: 'Depósito Logístico',
    desc: '+50% de suprimentos do estado, cura tropas no estado e mantém a linha de suprimento mesmo isolado. +2 de limite de tropas.',
    cost: [R(250, 0, 60, 0)], time: [25], maxLevel: 1, usesSlot: true,
  },
  fort: {
    type: 'fort',
    name: 'Fortificação',
    desc: 'Aumenta vida e poder de fogo da guarnição; tropas próximas da capital sofrem menos dano. 3 níveis.',
    cost: [R(200, 0, 80, 0), R(300, 0, 120, 0), R(450, 0, 180, 0)], time: [20, 25, 30], maxLevel: 3, usesSlot: false,
  },
};

export const BUILDING_ORDER: BuildingType[] = ['barracks', 'factory', 'airbase', 'depot', 'fort'];

export function slotsFor(imp: number): number {
  return 2 + Math.floor(imp / 4);
}
