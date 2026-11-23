// Protocolo do multiplayer online (cliente <-> servidor autoritativo).
import type { Difficulty, Distribution, Faction, MatchSettings, Role, VictoryRule } from '../sim/types';
import { ROLES } from '../sim/rules';

export const PROTOCOL_VERSION = 2;

export const LIMITS = {
  /** tamanho máximo de uma mensagem do cliente (bytes) */
  maxMessage: 16 * 1024,
  nick: 20,
  roomName: 32,
  chat: 200,
  password: 32,
  maxRooms: 100,
  maxSpectators: 10,
  maxConnectionsPerIp: 24,
  chatHistory: 60,
  markerTtl: 25,
  maxMarkersPerTeam: 12,
};

/** Configuração de sala (definida pelo anfitrião). */
export interface RoomConfig {
  name: string;
  public: boolean;
  /** jogadores por equipe (1v1 ... 5v5) */
  size: number;
  spectators: boolean;
  bots: boolean;
  botDifficulty: Difficulty;
  startRes: 'baixos' | 'normais' | 'altos';
  distribution: Distribution;
  incomeMul: number;
  /** minutos (0 = sem limite) */
  maxDuration: number;
  /** segundos */
  prepTime: number;
  fog: boolean;
  abilities: boolean;
  teams: 'livre' | 'auto';
  victory: VictoryRule;
  unitCap: number;
  structureCap: number;
  reconnect: boolean;
  /** segundos para voltar antes de a IA assumir a função */
  reconnectGrace: number;
  events: boolean;
  morale: boolean;
}

export const DEFAULT_CONFIG: RoomConfig = {
  name: 'Guerra pelo Brasil',
  public: false,
  size: 5,
  spectators: true,
  bots: true,
  botDifficulty: 'normal',
  startRes: 'normais',
  distribution: 'eleitoral',
  incomeMul: 1,
  maxDuration: 45,
  prepTime: 30,
  fog: true,
  abilities: true,
  teams: 'livre',
  victory: 'padrao',
  unitCap: 150,
  structureCap: 0,
  reconnect: true,
  reconnectGrace: 60,
  events: true,
  morale: true,
};

const pick = <T>(v: unknown, allowed: readonly T[], def: T): T => (allowed.includes(v as T) ? (v as T) : def);

/** Remove caracteres de controle e marcação; corta no tamanho máximo. */
export function sanitizeText(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function sanitizeNick(v: unknown): string {
  const s = sanitizeText(v, LIMITS.nick);
  return s.length >= 2 ? s : '';
}

/** Valida e completa uma configuração vinda do cliente. */
export function sanitizeConfig(raw: unknown, base: RoomConfig = DEFAULT_CONFIG): RoomConfig {
  const c = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const b = base;
  const num = (v: unknown, allowed: number[], def: number) => (typeof v === 'number' && allowed.includes(v) ? v : def);
  return {
    name: sanitizeText(c.name ?? b.name, LIMITS.roomName) || 'Sala sem nome',
    public: typeof c.public === 'boolean' ? c.public : b.public,
    size: num(c.size, [1, 2, 3, 4, 5], b.size),
    spectators: typeof c.spectators === 'boolean' ? c.spectators : b.spectators,
    bots: typeof c.bots === 'boolean' ? c.bots : b.bots,
    botDifficulty: pick(c.botDifficulty, ['facil', 'normal', 'dificil', 'insano'] as const, b.botDifficulty),
    startRes: pick(c.startRes, ['baixos', 'normais', 'altos'] as const, b.startRes),
    distribution: pick(c.distribution, ['eleitoral', 'nortesul', 'aleatoria', 'neutra'] as const, b.distribution),
    incomeMul: num(c.incomeMul, [0.75, 1, 1.5], b.incomeMul),
    maxDuration: num(c.maxDuration, [0, 15, 20, 30, 45, 60, 90], b.maxDuration),
    prepTime: num(c.prepTime, [0, 15, 30, 60, 120], b.prepTime),
    fog: typeof c.fog === 'boolean' ? c.fog : b.fog,
    abilities: typeof c.abilities === 'boolean' ? c.abilities : b.abilities,
    teams: pick(c.teams, ['livre', 'auto'] as const, b.teams),
    victory: pick(c.victory, ['padrao', 'total', 'sede'] as const, b.victory),
    unitCap: num(c.unitCap, [60, 100, 150], b.unitCap),
    structureCap: num(c.structureCap, [0, 15, 25, 40], b.structureCap),
    reconnect: typeof c.reconnect === 'boolean' ? c.reconnect : b.reconnect,
    reconnectGrace: num(c.reconnectGrace, [30, 60, 120, 300], b.reconnectGrace),
    events: typeof c.events === 'boolean' ? c.events : b.events,
    morale: typeof c.morale === 'boolean' ? c.morale : b.morale,
  };
}

export const ROLE_INFO: Record<Role, { name: string; short: string; desc: string }> = {
  comandante: { name: 'Comandante Supremo', short: 'Comandante', desc: 'Estratégia geral, objetivos da equipe, marcadores, habilidades do comandante e rendição.' },
  infantaria: { name: 'General de Infantaria', short: 'Infantaria', desc: 'Controla a infantaria: ataques terrestres, defesa e ocupação de capitais.' },
  blindados: { name: 'General de Blindados', short: 'Blindados', desc: 'Controla tanques e artilharia: ofensivas mecanizadas e apoio de fogo.' },
  aereo: { name: 'Comandante Aéreo', short: 'Aéreo', desc: 'Controla aviões, helicópteros e batedores: reconhecimento, defesa aérea e apoio.' },
  logistica: { name: 'Ministro de Logística e Indústria', short: 'Logística', desc: 'Constrói, produz qualquer unidade, opera o mercado, convoca reservas e controla o apoio logístico.' },
};

export const AVATARS = ['capacete', 'estrela', 'tanque', 'aviao', 'ancora', 'raio', 'escudo', 'bussola'] as const;
export type Avatar = (typeof AVATARS)[number];

export type MarkerKind = 'atacar' | 'defender' | 'reforcos' | 'construir' | 'perigo' | 'avancar' | 'recuar' | 'recursos';

export const MARKERS: Record<MarkerKind, { label: string; color: string }> = {
  atacar: { label: 'Atacar aqui', color: '#ff5a4f' },
  defender: { label: 'Defender posição', color: '#5aa2ff' },
  reforcos: { label: 'Precisamos de reforços', color: '#ffb347' },
  construir: { label: 'Construir base', color: '#c9e265' },
  perigo: { label: 'Perigo detectado', color: '#ff2d2d' },
  avancar: { label: 'Avançar', color: '#7dffb0' },
  recuar: { label: 'Recuar', color: '#d1c4ff' },
  recursos: { label: 'Solicitação de recursos', color: '#ffd54a' },
};

export interface Marker {
  id: number;
  team: Faction;
  kind: MarkerKind;
  x: number;
  y: number;
  by: string;
  t: number;
}

export interface ChatMsg {
  id: number;
  scope: 'all' | 'team';
  team: Faction | null;
  from: string;
  fromId: string;
  text: string;
  t: number;
  system?: boolean;
}

export interface PlayerView {
  id: string;
  nick: string;
  avatar: Avatar;
  team: Faction | null;
  role: Role | null;
  roles: Role[];
  ready: boolean;
  connected: boolean;
  ping: number;
  bot: boolean;
  host: boolean;
  spectator: boolean;
  /** IA assumiu temporariamente (desconectado) */
  aiCover: boolean;
}

export interface RoomView {
  code: string;
  name: string;
  hasPassword: boolean;
  config: RoomConfig;
  state: 'lobby' | 'playing' | 'ended';
  players: PlayerView[];
  hostId: string;
  canStart: boolean;
  startBlockers: string[];
}

export interface RoomSummary {
  code: string;
  name: string;
  hasPassword: boolean;
  size: number;
  humans: number;
  state: 'lobby' | 'playing' | 'ended';
  spectators: boolean;
}

export interface PlayerStats {
  id: string;
  nick: string;
  team: Faction;
  role: Role | null;
  roles: Role[];
  bot: boolean;
  produced: number;
  killed: number;
  lost: number;
  captured: number;
  spent: number;
  commands: number;
  markers: number;
  /** contribuição estratégica (pontuação composta) */
  score: number;
}

export interface MatchResult {
  code: string;
  name: string;
  winner: Faction | null;
  draw: boolean;
  reason: string;
  duration: number;
  endedAt: number;
  teams: Record<Faction, { states: number; produced: number; killed: number; lost: number; captured: number; spent: number; damage: number }>;
  players: PlayerStats[];
}

/** Distribui as 5 funções entre os jogadores de uma equipe (agrupando quando há menos de 5). */
export function assignRoles(players: { id: string; role: Role | null }[]): Map<string, Role[]> {
  const out = new Map<string, Role[]>();
  if (!players.length) return out;
  for (const p of players) out.set(p.id, []);
  const taken = new Set<Role>();
  // primeiro, respeita a escolha de cada um (sem repetir função)
  for (const p of players) {
    if (p.role && !taken.has(p.role)) { out.get(p.id)!.push(p.role); taken.add(p.role); }
  }
  // quem não tem função recebe uma livre
  for (const p of players) {
    if (out.get(p.id)!.length) continue;
    const free = ROLES.find((r) => !taken.has(r));
    if (free) { out.get(p.id)!.push(free); taken.add(free); }
  }
  // funções sobrando vão para quem tem menos funções (pares naturais: logística com comandante)
  const affinity: Record<Role, Role> = { logistica: 'comandante', comandante: 'logistica', aereo: 'blindados', blindados: 'infantaria', infantaria: 'blindados' };
  for (const r of ROLES) {
    if (taken.has(r)) continue;
    const pal = players.find((p) => out.get(p.id)!.includes(affinity[r]));
    const target = pal && out.get(pal.id)!.length <= Math.min(...players.map((p) => out.get(p.id)!.length)) + 1
      ? pal
      : [...players].sort((a, b) => out.get(a.id)!.length - out.get(b.id)!.length)[0];
    out.get(target.id)!.push(r);
    taken.add(r);
  }
  return out;
}

// ------------------------------------------------------------------ mensagens
export type ClientMsg =
  | { t: 'hello'; v: number; token?: string; nick?: string }
  | { t: 'ping'; ts: number }
  | { t: 'list' }
  | { t: 'history' }
  | { t: 'create'; nick: string; avatar?: Avatar; password?: string; config: Partial<RoomConfig> }
  | { t: 'join'; code: string; nick: string; avatar?: Avatar; password?: string; spectator?: boolean }
  | { t: 'leave' }
  | { t: 'lobby'; a: 'team'; team: Faction | null }
  | { t: 'lobby'; a: 'role'; role: Role | null }
  | { t: 'lobby'; a: 'ready'; ready: boolean }
  | { t: 'lobby'; a: 'avatar'; avatar: Avatar }
  | { t: 'lobby'; a: 'config'; config: Partial<RoomConfig> }
  | { t: 'lobby'; a: 'kick'; id: string }
  | { t: 'lobby'; a: 'host'; id: string }
  | { t: 'lobby'; a: 'addBot'; team: Faction }
  | { t: 'lobby'; a: 'removeBot'; id: string }
  | { t: 'lobby'; a: 'balance' }
  | { t: 'lobby'; a: 'start' }
  | { t: 'chat'; scope: 'all' | 'team'; text: string }
  | { t: 'marker'; kind: MarkerKind; x: number; y: number }
  | { t: 'cmd'; id: number; c: unknown }
  | { t: 'full' }
  | { t: 'roleswap'; a: 'request'; role: Role }
  | { t: 'roleswap'; a: 'approve'; id: number };

export type ServerMsg =
  | { t: 'welcome'; id: string; token: string; v: number; resumed: string | null }
  | { t: 'pong'; ts: number }
  | { t: 'error'; code: string; msg: string }
  | { t: 'rooms'; list: RoomSummary[] }
  | { t: 'history'; list: MatchResult[] }
  | { t: 'room'; room: RoomView; you: string }
  | { t: 'left'; reason: string }
  | { t: 'chat'; msg: ChatMsg }
  | { t: 'chatlog'; list: ChatMsg[] }
  | { t: 'markers'; list: Marker[] }
  | { t: 'start'; team: Faction | null; roles: Role[]; spectator: boolean; seq: number; settings: MatchSettings | null }
  | { t: 'score'; list: PlayerStats[]; time: number }
  | { t: 'snap'; s: unknown }
  | { t: 'ack'; id: number; ok: boolean; err?: string }
  | { t: 'end'; result: MatchResult }
  | { t: 'roleswap'; id: number; from: string; nick: string; role: Role; status: 'pending' | 'approved' };
