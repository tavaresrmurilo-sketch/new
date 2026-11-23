import type { AbilityId, Faction, Res } from '../sim/types';

export interface AbilityDef {
  id: AbilityId;
  name: string;
  desc: string;
  cooldown: number;
  duration: number;
  /** precisa de um ponto no mapa como alvo */
  targeted: boolean;
  /** usa o estado selecionado (ou a sede) como local */
  usesState: boolean;
  cost: Res;
}

export interface FactionDef {
  id: Faction;
  name: string;
  short: string;
  color: number;
  colorCss: string;
  dark: number;
  light: number;
  leader: string;
  leaderTitle: string;
  commander: string;
  commanderTitle: string;
  doctrine: string;
  passives: string[];
  abilities: AbilityId[];
  leaderBio: string;
  commanderBio: string;
  motto: string;
}

const R = (money: number, fuel: number, steel: number, supplies: number): Res => ({ money, fuel, steel, supplies });

export const ABILITIES: Record<AbilityId, AbilityDef> = {
  blitz: {
    id: 'blitz',
    name: 'Ofensiva Relâmpago',
    desc: 'Por 20 s, todas as suas unidades ficam 50% mais rápidas e causam +20% de dano.',
    cooldown: 110, duration: 20, targeted: false, usesState: false, cost: R(0, 60, 0, 0),
  },
  coordenado: {
    id: 'coordenado',
    name: 'Ataque Coordenado',
    desc: 'Escolha um ponto: barragem de artilharia pesada no alvo e +35% de dano para suas tropas próximas por 18 s. Unidades de combate num raio amplo avançam até lá.',
    cooldown: 140, duration: 18, targeted: true, usesState: false, cost: R(150, 0, 40, 0),
  },
  blindados: {
    id: 'blindados',
    name: 'Mobilização Blindada',
    desc: 'Três tanques entram em ação imediatamente no estado selecionado com Fábrica (ou na sede), pela metade do custo.',
    cooldown: 200, duration: 0, targeted: false, usesState: true, cost: R(255, 60, 90, 15),
  },
  industria: {
    id: 'industria',
    name: 'Esforço Industrial',
    desc: 'Por 30 s, a produção militar fica 80% mais rápida e 25% mais barata.',
    cooldown: 150, duration: 30, targeted: false, usesState: false, cost: R(0, 0, 0, 80),
  },
  massa: {
    id: 'massa',
    name: 'Mobilização em Massa',
    desc: 'Seis pelotões de infantaria surgem no estado selecionado (ou na sede) por uma fração do custo.',
    cooldown: 170, duration: 0, targeted: false, usesState: true, cost: R(110, 0, 0, 30),
  },
  ferrea: {
    id: 'ferrea',
    name: 'Resistência Férrea',
    desc: 'Por 25 s, tropas em território próprio sofrem 40% menos dano e as guarnições disparam 50% mais forte.',
    cooldown: 150, duration: 25, targeted: false, usesState: false, cost: R(80, 0, 0, 40),
  },
};

export const FACTIONS: Record<Faction, FactionDef> = {
  bolso: {
    id: 'bolso',
    name: 'Exército Bolsonaro',
    short: 'Bolsonaro',
    color: 0x1e6fd9,
    colorCss: '#1e6fd9',
    dark: 0x0b2f66,
    light: 0x7fb3ff,
    leader: 'Jair Bolsonaro',
    leaderTitle: 'Líder político',
    commander: 'Adolf Hitler',
    commanderTitle: 'Comandante militar supremo (caricatura)',
    doctrine: 'Ataques rápidos, blindados, ofensivas terrestres e expansão territorial.',
    passives: ['Tanques 15% mais baratos', 'Todas as unidades +8% de velocidade'],
    abilities: ['blitz', 'coordenado', 'blindados'],
    leaderBio: 'Caricatura satírica do ex-presidente. No roteiro absurdo deste jogo, comanda o lado azul de um Brasil rachado.',
    commanderBio: 'Caricatura de Adolf Hitler, ditador nazista responsável pelo Holocausto e pela Segunda Guerra Mundial. Aparece aqui apenas como alvo de sátira: um personagem ridículo, nunca um modelo.',
    motto: '“Avante, sem freio de mão!”',
  },
  lula: {
    id: 'lula',
    name: 'Exército Lula',
    short: 'Lula',
    color: 0xd32f2f,
    colorCss: '#d32f2f',
    dark: 0x6b1010,
    light: 0xff8a80,
    leader: 'Luiz Inácio Lula da Silva',
    leaderTitle: 'Líder político',
    commander: 'Josef Stalin',
    commanderTitle: 'Comandante militar supremo (caricatura)',
    doctrine: 'Grandes contingentes de infantaria, defesa territorial, indústria e contra-ataques.',
    passives: ['Infantaria 20% mais barata', 'Guarnições +20% de vida', '+4 de capacidade industrial'],
    abilities: ['industria', 'massa', 'ferrea'],
    leaderBio: 'Caricatura satírica do presidente. No roteiro absurdo deste jogo, comanda o lado vermelho de um Brasil rachado.',
    commanderBio: 'Caricatura de Josef Stalin, ditador soviético responsável pelo Grande Expurgo, pelos gulags e por fomes que mataram milhões. Aparece aqui apenas como alvo de sátira: um personagem ridículo, nunca um modelo.',
    motto: '“Companheiro, a fábrica não para!”',
  },
};

export const NEUTRAL_COLOR = 0x8a8468;
export const NEUTRAL_DARK = 0x4a4636;

export function enemyOf(f: Faction): Faction {
  return f === 'lula' ? 'bolso' : 'lula';
}

export const DIFFICULTY_LABEL = { facil: 'Fácil', normal: 'Normal', dificil: 'Difícil', insano: 'Insano' } as const;
