// Regras de jogo da versão 2.0, em tabelas claras e equilibradas, usadas pelo
// motor (offline e servidor), pela IA e pela interface ("Como jogar").
import type { Formation, Res, Role, TerrainType, UnitType } from './types';

// ------------------------------------------------------------------ terreno
export const T_PLAIN = 0, T_FOREST = 1, T_HILLS = 2, T_RIVER = 3, T_WETLAND = 4, T_URBAN = 5;

export interface TerrainInfo {
  name: string;
  /** multiplicador de velocidade: [infantaria, veículos] */
  speed: [number, number];
  /** multiplicador de dano recebido por unidades terrestres */
  defense: number;
  /** multiplicador de visão */
  vision: number;
  /** custo para o A* */
  cost: number;
  desc: string;
}

export const TERRAIN: Record<TerrainType, TerrainInfo> = {
  0: { name: 'Planície', speed: [1, 1], defense: 1, vision: 1, cost: 1, desc: 'Sem modificadores.' },
  1: { name: 'Mata (Amazônia)', speed: [0.85, 0.7], defense: 0.8, vision: 0.75, cost: 1.3, desc: 'Infantaria −15% e veículos −30% de velocidade; tropas recebem −20% de dano; visão −25%.' },
  2: { name: 'Serra', speed: [0.75, 0.75], defense: 0.85, vision: 1.15, cost: 1.35, desc: 'Tropas terrestres −25% de velocidade e −15% de dano recebido; artilharia +15% de alcance; visão +15%.' },
  3: { name: 'Rio', speed: [0.6, 0.6], defense: 1.15, vision: 1, cost: 1.6, desc: 'Travessia lenta (−40%) e exposta: +15% de dano recebido.' },
  4: { name: 'Pantanal', speed: [0.7, 0.55], defense: 1, vision: 1, cost: 1.6, desc: 'Alagado: infantaria −30% e veículos −45% de velocidade.' },
  5: { name: 'Cidade', speed: [1.1, 1.1], defense: 1, vision: 1, cost: 0.95, desc: 'Vias rápidas (+10%). Defensores do dono do estado recebem −15% de dano.' },
};

export const URBAN_DEFENSE = 0.85;
export const HILL_ARTILLERY_RANGE = 1.15;

export function isVehicle(t: UnitType): boolean {
  return t !== 'infantry' && t !== 'militia';
}

// ------------------------------------------------------------------ funções militares
export const ROLES: Role[] = ['comandante', 'infantaria', 'blindados', 'aereo', 'logistica'];

export function roleForUnit(t: UnitType): Role {
  switch (t) {
    case 'infantry': case 'militia': return 'infantaria';
    case 'tank': case 'artillery': return 'blindados';
    case 'heli': case 'plane': case 'recon': return 'aereo';
    case 'support': return 'logistica';
  }
}

// ------------------------------------------------------------------ formações
export interface FormationInfo {
  name: string;
  desc: string;
  /** espaçamento entre unidades */
  spacing: number;
  /** velocidade durante o deslocamento */
  moveSpeed: number;
  /** dano recebido enquanto parada na formação */
  holdDefense: number;
  /** dano de área recebido */
  splashTaken: number;
  /** ao chegar, mantém posição (não persegue) */
  hold: boolean;
}

export const FORMATIONS: Record<Formation, FormationInfo> = {
  livre: { name: 'Livre', desc: 'Agrupamento padrão; persegue inimigos próximos.', spacing: 10, moveSpeed: 1, holdDefense: 1, splashTaken: 1, hold: false },
  linha: { name: 'Linha defensiva', desc: 'Frente larga perpendicular ao avanço. Ao chegar, mantém a linha (não persegue) e recebe −15% de dano.', spacing: 15, moveSpeed: 0.95, holdDefense: 0.85, splashTaken: 1, hold: true },
  coluna: { name: 'Coluna de avanço', desc: 'Fila indiana: +20% de velocidade em marcha, mas +15% de dano recebido enquanto se desloca.', spacing: 9, moveSpeed: 1.2, holdDefense: 1, splashTaken: 1, hold: false },
  dispersa: { name: 'Dispersa', desc: 'Espaçamento grande: dano em área recebido −50%, −10% de velocidade.', spacing: 26, moveSpeed: 0.9, holdDefense: 1, splashTaken: 0.5, hold: false },
  escolta: { name: 'Escolta', desc: 'Acompanha a unidade escoltada (clique direito numa unidade aliada) e ataca quem a ameaçar.', spacing: 14, moveSpeed: 1, holdDefense: 1, splashTaken: 1, hold: false },
  cerco: { name: 'Cerco', desc: 'Anel ao redor do alvo: +20% de dano contra inimigos dentro do cerco.', spacing: 12, moveSpeed: 1, holdDefense: 1, splashTaken: 1, hold: false },
  defesa: { name: 'Defesa de posição', desc: 'Bloco compacto e entrincheirado: após 5 s parado, −25% de dano recebido; não persegue.', spacing: 8, moveSpeed: 0.9, holdDefense: 0.75, splashTaken: 1.1, hold: true },
};

export const FORMATION_LIST: Formation[] = ['livre', 'linha', 'coluna', 'dispersa', 'escolta', 'cerco', 'defesa'];
export const CERCO_RADIUS = 70;
export const CERCO_BONUS = 1.2;

/** Posições de chegada para cada unidade conforme a formação. */
export function formationSlots(f: Formation, n: number, x: number, y: number, dirX: number, dirY: number): { x: number; y: number }[] {
  const info = FORMATIONS[f];
  const out: { x: number; y: number }[] = [];
  const len = Math.hypot(dirX, dirY) || 1;
  const fx = dirX / len, fy = dirY / len; // frente
  const px = -fy, py = fx; // perpendicular
  for (let i = 0; i < n; i++) {
    let ox = 0, oy = 0;
    switch (f) {
      case 'linha': {
        const row = Math.floor(i / 12), col = i % 12;
        const cols = Math.min(12, n - row * 12);
        const off = (col - (cols - 1) / 2) * info.spacing;
        ox = px * off - fx * row * 14;
        oy = py * off - fy * row * 14;
        break;
      }
      case 'coluna': {
        const lane = i % 2 ? 1 : -1;
        ox = -fx * Math.floor(i / 2) * info.spacing + px * lane * 5;
        oy = -fy * Math.floor(i / 2) * info.spacing + py * lane * 5;
        break;
      }
      case 'cerco': {
        const a = (i / Math.max(1, n)) * Math.PI * 2;
        ox = Math.cos(a) * CERCO_RADIUS;
        oy = Math.sin(a) * CERCO_RADIUS;
        break;
      }
      default: {
        const r = info.spacing * Math.sqrt(i), th = i * 2.39996;
        ox = Math.cos(th) * r;
        oy = Math.sin(th) * r;
      }
    }
    out.push({ x: x + ox, y: y + oy });
  }
  return out;
}

// ------------------------------------------------------------------ veterania
export const RANKS = [
  { name: 'Recruta', xp: 0 },
  { name: 'Veterano', xp: 3 },
  { name: 'Elite', xp: 8 },
  { name: 'Heroico', xp: 15 },
];
/** bônus por patente (dano e vida máxima), limitado à patente 3 = +21% */
export const RANK_BONUS = 0.07;

export function rankOf(xp: number): number {
  let r = 0;
  for (let i = 0; i < RANKS.length; i++) if (xp >= RANKS[i].xp) r = i;
  return r;
}

// ------------------------------------------------------------------ moral
export const MORALE = {
  start: 80,
  /** abaixo disto: −15% de dano */
  shaken: 40,
  /** abaixo disto: −30% de dano e recuo */
  broken: 20,
  recoverTo: 50,
  allyDeath: 8,
  kill: 5,
  hitScale: 25,
  unsupplied: 1,
  regen: 2,
  regenHome: 3,
};

export function moraleDamageMul(m: number): number {
  if (m < MORALE.broken) return 0.7;
  if (m < MORALE.shaken) return 0.85;
  return 1;
}

// ------------------------------------------------------------------ eventos fictícios
export interface GameEventDef {
  id: string;
  name: string;
  desc: string;
  /** região afetada ('' = país todo) */
  region: '' | 'Norte' | 'Nordeste' | 'Centro-Oeste' | 'Sudeste' | 'Sul';
  duration: number;
  /** multiplicadores aplicados aos estados/unidades da região */
  income?: Partial<Res>;
  speed?: number;
  vision?: number;
  fuelUpkeep?: number;
  production?: number;
}

export const GAME_EVENTS: GameEventDef[] = [
  { id: 'chuvas', name: 'Chuvas torrenciais', desc: 'Estradas alagadas no Norte: tropas terrestres −25% de velocidade.', region: 'Norte', duration: 60, speed: 0.75 },
  { id: 'greve', name: 'Greve dos caminhoneiros', desc: 'Suprimentos −40% para os dois lados.', region: '', duration: 50, income: { supplies: 0.6 } },
  { id: 'safra', name: 'Safra recorde', desc: 'Estados do Centro-Oeste rendem +60% de suprimentos.', region: 'Centro-Oeste', duration: 60, income: { supplies: 1.6 } },
  { id: 'petroleo', name: 'Alta do petróleo', desc: 'Manutenção de combustível +50% para os dois lados.', region: '', duration: 50, fuelUpkeep: 1.5 },
  { id: 'seca', name: 'Seca no sertão', desc: 'Estados do Nordeste rendem −40% de suprimentos.', region: 'Nordeste', duration: 60, income: { supplies: 0.6 } },
  { id: 'neblina', name: 'Neblina densa', desc: 'Visão −40% no Sul.', region: 'Sul', duration: 45, vision: 0.6 },
  { id: 'boom', name: 'Boom industrial', desc: 'Estados do Sudeste rendem +40% de dinheiro.', region: 'Sudeste', duration: 60, income: { money: 1.4 } },
  { id: 'feriado', name: 'Feriado prolongado', desc: 'Produção militar −20% para os dois lados.', region: '', duration: 40, production: 0.8 },
];

// ------------------------------------------------------------------ objetivos regionais
export interface RegionBonus {
  region: 'Norte' | 'Nordeste' | 'Centro-Oeste' | 'Sudeste' | 'Sul';
  name: string;
  desc: string;
}

export const REGION_BONUSES: RegionBonus[] = [
  { region: 'Norte', name: 'Domínio da Amazônia', desc: '+20% de aço.' },
  { region: 'Nordeste', name: 'Celeiro do Nordeste', desc: '+20% de suprimentos.' },
  { region: 'Centro-Oeste', name: 'Corredor central', desc: '+10% de velocidade para tropas terrestres.' },
  { region: 'Sudeste', name: 'Coração econômico', desc: '+15% de dinheiro.' },
  { region: 'Sul', name: 'Polo metalúrgico', desc: '+15% de capacidade industrial.' },
];

// ------------------------------------------------------------------ reservas e reconhecimento
export const RESERVES = { cost: { money: 90, fuel: 0, steel: 0, supplies: 30 } as Res, count: 3, cooldown: 150 };
export const RECON = { radius: 280, duration: 30, cooldown: 35 };
