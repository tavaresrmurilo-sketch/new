import type { ArmorClass, BuildingType, Res, UnitType } from '../sim/types';

export interface UnitDef {
  type: UnitType;
  name: string;
  plural: string;
  desc: string;
  hp: number;
  /** px por segundo de jogo */
  speed: number;
  damage: number;
  range: number;
  minRange: number;
  cooldown: number;
  armor: ArmorClass;
  /** multiplicador de dano por classe de alvo */
  vs: Record<ArmorClass, number>;
  splash: number;
  sight: number;
  air: boolean;
  canCapture: boolean;
  cost: Res;
  buildTime: number;
  pop: number;
  requires: BuildingType | null;
  /** valor militar usado pela IA para estimar forças */
  power: number;
  ammo: number;
  /** segundos de voo (aviões) */
  fuel: number;
  heal: number;
  healRadius: number;
  /** consumo contínuo de combustível (por segundo) */
  fuelUse: number;
}

const R = (money: number, fuel: number, steel: number, supplies: number): Res => ({ money, fuel, steel, supplies });

export const UNIT_DEFS: Record<UnitType, UnitDef> = {
  infantry: {
    type: 'infantry',
    name: 'Infantaria',
    plural: 'Infantaria',
    desc: 'Barata e numerosa. Ocupa cidades e captura capitais. Fraca contra blindados.',
    hp: 110, speed: 22, damage: 9, range: 34, minRange: 0, cooldown: 1.0, armor: 'light',
    vs: { light: 1.0, armor: 0.45, air: 0.3, structure: 0.55 },
    splash: 0, sight: 95, air: false, canCapture: true,
    cost: R(55, 0, 0, 20), buildTime: 6, pop: 1, requires: 'barracks', power: 1.1,
    ammo: 0, fuel: 0, heal: 0, healRadius: 0, fuelUse: 0,
  },
  tank: {
    type: 'tank',
    name: 'Tanque',
    plural: 'Tanques',
    desc: 'Blindado pesado: resistente e letal contra tropas e outros tanques. Consome combustível.',
    hp: 300, speed: 30, damage: 26, range: 50, minRange: 0, cooldown: 1.8, armor: 'armor',
    vs: { light: 1.0, armor: 1.2, air: 0, structure: 1.1 },
    splash: 0, sight: 105, air: false, canCapture: true,
    cost: R(200, 45, 65, 10), buildTime: 13, pop: 2, requires: 'factory', power: 3.0,
    ammo: 0, fuel: 0, heal: 0, healRadius: 0, fuelUse: 0.04,
  },
  artillery: {
    type: 'artillery',
    name: 'Artilharia',
    plural: 'Artilharia',
    desc: 'Longo alcance e dano em área. Lenta para recarregar e indefesa de perto.',
    hp: 90, speed: 18, damage: 44, range: 175, minRange: 40, cooldown: 4.5, armor: 'light',
    vs: { light: 1.2, armor: 0.8, air: 0, structure: 1.6 },
    splash: 32, sight: 195, air: false, canCapture: false,
    cost: R(160, 10, 55, 20), buildTime: 12, pop: 2, requires: 'factory', power: 2.4,
    ammo: 0, fuel: 0, heal: 0, healRadius: 0, fuelUse: 0,
  },
  heli: {
    type: 'heli',
    name: 'Helicóptero',
    plural: 'Helicópteros',
    desc: 'Aéreo e veloz. Mísseis anticarro; ignora o terreno. Vulnerável a caças.',
    hp: 170, speed: 62, damage: 17, range: 62, minRange: 0, cooldown: 1.1, armor: 'air',
    vs: { light: 1.2, armor: 1.4, air: 0.6, structure: 0.6 },
    splash: 0, sight: 125, air: true, canCapture: false,
    cost: R(230, 55, 45, 10), buildTime: 15, pop: 2, requires: 'airbase', power: 2.9,
    ammo: 0, fuel: 0, heal: 0, healRadius: 0, fuelUse: 0.05,
  },
  plane: {
    type: 'plane',
    name: 'Caça-bombardeiro',
    plural: 'Aviões',
    desc: 'Ataques aéreos devastadores e superioridade aérea. Munição limitada: volta à base aérea para rearmar.',
    hp: 200, speed: 135, damage: 46, range: 56, minRange: 0, cooldown: 1.6, armor: 'air',
    vs: { light: 1.0, armor: 1.3, air: 1.5, structure: 1.4 },
    splash: 0, sight: 170, air: true, canCapture: false,
    cost: R(300, 65, 75, 10), buildTime: 18, pop: 3, requires: 'airbase', power: 3.2,
    ammo: 4, fuel: 48, heal: 0, healRadius: 0, fuelUse: 0,
  },
  support: {
    type: 'support',
    name: 'Apoio Logístico',
    plural: 'Apoio',
    desc: 'Repara blindados, cura tropas, reabastece a linha de frente e recupera guarnições.',
    hp: 140, speed: 26, damage: 0, range: 0, minRange: 0, cooldown: 1, armor: 'light',
    vs: { light: 0, armor: 0, air: 0, structure: 0 },
    splash: 0, sight: 80, air: false, canCapture: false,
    cost: R(100, 15, 15, 30), buildTime: 9, pop: 1, requires: 'barracks', power: 0.4,
    ammo: 0, fuel: 0, heal: 6, healRadius: 85, fuelUse: 0,
  },
  militia: {
    type: 'militia',
    name: 'Milícia Local',
    plural: 'Milícias',
    desc: 'Defensores locais de estados neutros. Não saem de seu estado.',
    hp: 80, speed: 18, damage: 7, range: 30, minRange: 0, cooldown: 1.1, armor: 'light',
    vs: { light: 1.0, armor: 0.25, air: 0.25, structure: 0.4 },
    splash: 0, sight: 90, air: false, canCapture: false,
    cost: R(0, 0, 0, 0), buildTime: 0, pop: 0, requires: null, power: 0.8,
    ammo: 0, fuel: 0, heal: 0, healRadius: 0, fuelUse: 0,
  },
};

export const RECRUITABLE: UnitType[] = ['infantry', 'tank', 'artillery', 'heli', 'plane', 'support'];

/** Guarnição (base militar na capital de cada estado). */
export const GARRISON = {
  damage: 11,
  perFortDmg: 5,
  range: 82,
  cooldown: 1.0,
  vs: { light: 1.0, armor: 0.8, air: 0.7, structure: 0 } as Record<ArmorClass, number>,
  regen: 4,
};
