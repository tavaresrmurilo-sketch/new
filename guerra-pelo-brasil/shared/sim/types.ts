// Tipos centrais da simulação. O estado do mundo (World) é composto apenas por
// dados simples (sem classes), o que permite salvar/carregar via JSON.

export type Faction = 'lula' | 'bolso';
export type Owner = Faction | 'neutral';
export type UnitType = 'infantry' | 'tank' | 'artillery' | 'heli' | 'plane' | 'support' | 'recon' | 'militia';
export type ArmorClass = 'light' | 'armor' | 'air' | 'structure';
export type BuildingType = 'barracks' | 'factory' | 'airbase' | 'depot' | 'fort';
export type ResKey = 'money' | 'fuel' | 'steel' | 'supplies';
export type Res = Record<ResKey, number>;
export type Difficulty = 'facil' | 'normal' | 'dificil' | 'insano';
export type GameMode = 'campanha' | 'rapida' | 'local' | 'sandbox' | 'online';
export type AbilityId = 'blitz' | 'coordenado' | 'blindados' | 'industria' | 'massa' | 'ferrea';
export type Distribution = 'eleitoral' | 'nortesul' | 'aleatoria' | 'neutra';
export type ControlKind = 'human' | 'ai' | 'none';
/** Funções militares (multiplayer por equipes). */
export type Role = 'comandante' | 'infantaria' | 'blindados' | 'aereo' | 'logistica';
/** Formações de grupo. */
export type Formation = 'livre' | 'linha' | 'coluna' | 'dispersa' | 'escolta' | 'cerco' | 'defesa';
export type VictoryRule = 'padrao' | 'total' | 'sede';
export type TerrainType = 0 | 1 | 2 | 3 | 4 | 5;

export interface Vec {
  x: number;
  y: number;
}

/** Referência a um alvo: unidade (por id) ou guarnição/base de um estado (por índice). */
export type TargetRef = { t: 'u'; id: number } | { t: 'b'; s: number };

export type Order =
  | { kind: 'idle' }
  | { kind: 'hold' }
  | { kind: 'move'; x: number; y: number; aggressive: boolean }
  | { kind: 'attack'; target: TargetRef }
  | { kind: 'rtb' };

export type PlanePhase = 'ready' | 'sortie' | 'rtb' | 'rearm';

export interface Unit {
  id: number;
  type: UnitType;
  f: Owner;
  x: number;
  y: number;
  /** posição no início do último passo (interpolação visual) */
  px: number;
  py: number;
  hp: number;
  maxHp: number;
  angle: number;
  order: Order;
  /** Caminho achatado [x0,y0,x1,y1,...] */
  path: number[] | null;
  pi: number;
  target: TargetRef | null;
  cd: number;
  scanT: number;
  repathT: number;
  anchorX: number;
  anchorY: number;
  supplied: boolean;
  st: number;
  ammo: number;
  fuel: number;
  phase: PlanePhase;
  rearmT: number;
  home: number;
  kills: number;
  lastHitT: number;
  lastFireT: number;
  group: number;
  moving: boolean;
  /** função militar que controla a unidade (multiplayer) */
  ctrl: Role;
  /** experiência acumulada (veterania) */
  xp: number;
  /** moral 0..100 */
  morale: number;
  /** formação da última ordem */
  form: Formation;
  /** unidade escoltada (formação escolta) */
  escort: number;
  /** recuando por moral baixa */
  routed: boolean;
  /** tempo parado (entrincheiramento) */
  stillT: number;
}

export interface Shell {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  t: number;
  dur: number;
  dmg: number;
  f: Owner;
  splash: number;
  /** id da unidade que disparou (0 = bombardeio de comandante) */
  src: number;
}

export interface QueueItem {
  type: UnitType;
  t: number;
  total: number;
  paid: Res;
}

export interface Construction {
  type: BuildingType;
  t: number;
  total: number;
  paid: Res;
}

export interface StateRT {
  i: number;
  uf: string;
  owner: Owner;
  gHp: number;
  gMax: number;
  gCd: number;
  gTarget: TargetRef | null;
  capF: Owner | null;
  capP: number;
  b: Record<BuildingType, number>;
  cons: Construction | null;
  queue: QueueItem[];
  rally: Vec | null;
  connected: boolean;
  lastAttackT: number;
  lastCombatT: number;
  alertT: number;
  capturedT: number;
  /** recarga da convocação de reservas */
  reserveT: number;
}

export interface Ability {
  id: AbilityId;
  cd: number;
  active: number;
}

export interface Buffs {
  speedT: number;
  dmgT: number;
  prodT: number;
  defT: number;
  coordT: number;
  coordX: number;
  coordY: number;
}

export interface FactionStats {
  produced: number;
  lost: number;
  killed: number;
  captured: number;
  statesLost: number;
  damage: number;
  spent: number;
}

export interface FactionRT {
  id: Faction;
  res: Res;
  income: Res;
  upkeep: Res;
  industry: number;
  prodMul: number;
  pop: number;
  popCap: number;
  hq: number;
  origHq: number;
  control: ControlKind;
  difficulty: Difficulty;
  abilities: Ability[];
  buffs: Buffs;
  stats: FactionStats;
  infinite: boolean;
  surrendered: boolean;
  crisisT: number;
  objectives: string[];
}

export interface LogEntry {
  t: number;
  text: string;
  kind: 'info' | 'combat' | 'capture' | 'alert' | 'build' | 'ability' | 'objective';
  f?: Owner;
  s?: number;
}

export interface MatchSettings {
  mode: GameMode;
  player: Faction;
  difficulty: Difficulty;
  distribution: Distribution;
  startRes: 'baixos' | 'normais' | 'altos';
  incomeMul: number;
  seed: number;
  /** IA do oponente ligada (sandbox pode desligar) */
  enemyAI: boolean;
  /** névoa de guerra */
  fog?: boolean;
  /** habilidades especiais dos comandantes */
  abilities?: boolean;
  /** duração máxima em minutos (0 = sem limite) */
  maxDuration?: number;
  /** segundos de preparação inicial (sem combate nem captura) */
  prepTime?: number;
  victory?: VictoryRule;
  /** limite de efetivo por equipe */
  unitCap?: number;
  /** limite de estruturas por equipe (0 = sem limite) */
  structureCap?: number;
  /** eventos fictícios aleatórios */
  events?: boolean;
  /** moral das tropas */
  morale?: boolean;
}

export interface AIGroup {
  id: number;
  task: 'attack' | 'defend';
  target: number;
  units: number[];
  phase: 'gather' | 'attack' | 'retreat';
  sx: number;
  sy: number;
  t0: number;
  lastPower: number;
}

export interface AIState {
  nextThink: number;
  groups: AIGroup[];
  nextGroupId: number;
  strategy: 'expansao' | 'ofensiva' | 'defensiva' | 'contra-ataque';
  lost: { s: number; t: number }[];
  lastAbilityT: number;
  focus: number;
  /** funções controladas por esta IA (multiplayer); ausente = todas */
  roles?: Role[] | null;
}

export interface TurnState {
  phase: 'plan' | 'exec';
  active: Faction;
  t: number;
  n: number;
}

export interface World {
  version: number;
  time: number;
  rng: number;
  units: Unit[];
  nextId: number;
  shells: Shell[];
  states: StateRT[];
  factions: Record<Faction, FactionRT>;
  settings: MatchSettings;
  winner: Faction | null;
  endReason: string;
  ai: Record<Faction, AIState | null>;
  turn: TurnState | null;
  log: LogEntry[];
  tick: number;
  /** próximos instantes das rotinas periódicas (salvos para manter o determinismo) */
  timers: { eco: number; supply: number; victory: number; objectives: number; event: number };
  /** objetivo de equipe definido pelo comandante (índice do estado ou -1) */
  teamObjective: Record<Faction, number>;
  /** áreas reveladas temporariamente por reconhecimento */
  reveals: Reveal[];
  /** eventos fictícios ativos */
  gevents: ActiveEvent[];
  /** empate por tempo */
  draw?: boolean;
}

export interface Reveal {
  f: Faction;
  x: number;
  y: number;
  r: number;
  until: number;
}

export interface ActiveEvent {
  id: string;
  until: number;
  /** estado-alvo (eventos regionais) ou -1 */
  s: number;
  /** região afetada ('' = país todo) */
  region: string;
}

/** Eventos transitórios produzidos pela simulação (efeitos visuais, sons, alertas). */
export type SimEvent =
  | { k: 'shot'; x1: number; y1: number; x2: number; y2: number; ut: UnitType | 'base'; f: Owner }
  | { k: 'shell'; x1: number; y1: number; x2: number; y2: number; dur: number; f: Owner }
  | { k: 'boom'; x: number; y: number; size: number }
  | { k: 'death'; x: number; y: number; ut: UnitType; f: Owner }
  | { k: 'capture'; s: number; f: Owner; from: Owner }
  | { k: 'alert'; s: number; victim: Owner; by: Owner }
  | { k: 'spawn'; id: number; f: Owner; s: number }
  | { k: 'built'; s: number; b: BuildingType; f: Owner }
  | { k: 'ability'; f: Faction; id: AbilityId; x: number; y: number }
  | { k: 'objective'; f: Faction; id: string }
  | { k: 'gameover'; winner: Faction; reason: string; draw?: boolean }
  | { k: 'garrisonDown'; s: number }
  | { k: 'turn'; phase: 'plan' | 'exec'; active: Faction; n: number }
  | { k: 'hqLost'; f: Faction; s: number; newHq: number }
  | { k: 'promote'; id: number; rank: number; f: Owner }
  | { k: 'gevent'; id: string; start: boolean }
  | { k: 'reveal'; f: Faction; x: number; y: number; r: number };
