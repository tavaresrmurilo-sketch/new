// Sala multiplayer: lobby, partida autoritativa, chat, marcadores e reconexão.
import crypto from 'node:crypto';
import { Game } from '../shared/sim/game';
import { defaultSettings, newAIState } from '../shared/sim/setup';
import { ROLES } from '../shared/sim/rules';
import { applyCommand } from '../shared/net/commands';
import { SnapshotEncoder } from '../shared/net/snapshot';
import {
  AVATARS, LIMITS, MARKERS, PROTOCOL_VERSION, assignRoles, sanitizeConfig, sanitizeText,
  type Avatar, type ChatMsg, type ClientMsg, type Marker, type MarkerKind, type MatchResult, type PlayerStats,
  type PlayerView, type RoomConfig, type RoomSummary, type RoomView, type ServerMsg,
} from '../shared/net/protocol';
import type { Faction, Role, SimEvent } from '../shared/sim/types';
import { FACTIONS } from '../shared/data/factions';
import { log } from './log';

export interface RPlayer {
  id: string;
  token: string;
  nick: string;
  avatar: Avatar;
  team: Faction | null;
  role: Role | null;
  roles: Role[];
  ready: boolean;
  bot: boolean;
  spectator: boolean;
  connected: boolean;
  left: boolean;
  disconnectedAt: number;
  ping: number;
  joinedAt: number;
  recent: Map<number, { ok: boolean; err?: string }>;
  enc: SnapshotEncoder | null;
  needFull: boolean;
  stats: { commands: number; markers: number; produced: number; spent: number };
}

export interface RoomHost {
  send(playerId: string, msg: ServerMsg): void;
  sendRaw(playerId: string, json: string): void;
  onRoomEnded(room: Room, result: MatchResult): void;
  removeFromRoom(playerId: string, reason: string): void;
}

const BOT_NAMES = ['Cabo Bot', 'Sargento Bot', 'Tenente Bot', 'Capitão Bot', 'Major Bot', 'Coronel Bot', 'Soldado Bot', 'Recruta Bot', 'Marechal Bot', 'Almirante Bot'];

export function hashPassword(pw: string, salt: string): string {
  return crypto.createHash('sha256').update(`${salt}:${pw}`).digest('hex');
}

export class Room {
  game: Game | null = null;
  state: 'lobby' | 'playing' | 'ended' = 'lobby';
  players = new Map<string, RPlayer>();
  chat: ChatMsg[] = [];
  markers: Marker[] = [];
  banned = new Set<string>();
  createdAt = Date.now();
  startedAt = 0;
  endedAt = 0;
  lastHumanAt = Date.now();
  result: MatchResult | null = null;
  replay: { tick: number; type: string; team?: Faction; roles?: Role[] | null; c?: unknown; player?: string }[] = [];
  private nextChat = 1;
  private nextMarker = 1;
  private tickCount = 0;
  private events: SimEvent[] = [];
  private viewDirty = true;
  private swaps = new Map<number, { id: number; from: string; role: Role; team: Faction }>();
  private nextSwap = 1;

  constructor(
    public code: string,
    public config: RoomConfig,
    public hostId: string,
    private host: RoomHost,
    public passHash: string | null = null,
    public salt: string = crypto.randomBytes(8).toString('hex'),
  ) {}

  get name(): string {
    return this.config.name;
  }

  humans(): RPlayer[] {
    return [...this.players.values()].filter((p) => !p.bot && !p.spectator && !p.left);
  }

  members(team: Faction): RPlayer[] {
    return [...this.players.values()].filter((p) => p.team === team && !p.spectator && !p.left);
  }

  // ------------------------------------------------------------------ visões
  summary(): RoomSummary {
    return {
      code: this.code,
      name: this.config.name,
      hasPassword: !!this.passHash,
      size: this.config.size,
      humans: this.humans().length,
      state: this.state,
      spectators: this.config.spectators,
    };
  }

  playerView(p: RPlayer): PlayerView {
    return {
      id: p.id, nick: p.nick, avatar: p.avatar, team: p.team, role: p.role, roles: p.roles, ready: p.ready || p.bot,
      connected: p.bot || p.connected, ping: p.ping, bot: p.bot, host: p.id === this.hostId, spectator: p.spectator,
      aiCover: !p.bot && this.state === 'playing' && this.isCovered(p),
    };
  }

  startBlockers(): string[] {
    const b: string[] = [];
    if (this.state !== 'lobby') return ['A partida já começou.'];
    const humans = this.humans();
    if (!humans.length) b.push('Nenhum jogador humano na sala.');
    if (this.config.teams === 'livre') {
      const noTeam = humans.filter((p) => !p.team);
      if (noTeam.length) b.push(`${noTeam.map((p) => p.nick).join(', ')} ainda sem equipe.`);
    }
    for (const t of ['lula', 'bolso'] as Faction[]) {
      const n = this.members(t).length;
      if (n > this.config.size) b.push(`${FACTIONS[t].name} tem jogadores demais (${n}/${this.config.size}).`);
      if (this.config.teams === 'livre' && n === 0 && !this.config.bots) b.push(`${FACTIONS[t].name} está vazio (ative bots ou aguarde jogadores).`);
    }
    if (this.config.teams === 'auto' && humans.length > this.config.size * 2) b.push('Jogadores demais para o tamanho escolhido.');
    const notReady = humans.filter((p) => p.id !== this.hostId && !p.ready);
    if (notReady.length) b.push(`Aguardando "pronto": ${notReady.map((p) => p.nick).join(', ')}.`);
    return b;
  }

  view(): RoomView {
    const blockers = this.startBlockers();
    return {
      code: this.code,
      name: this.config.name,
      hasPassword: !!this.passHash,
      config: this.config,
      state: this.state,
      players: [...this.players.values()].filter((p) => !p.left).map((p) => this.playerView(p)),
      hostId: this.hostId,
      canStart: blockers.length === 0,
      startBlockers: blockers,
    };
  }

  markDirty(): void {
    this.viewDirty = true;
  }

  flushView(): void {
    if (!this.viewDirty) return;
    this.viewDirty = false;
    const room = this.view();
    for (const p of this.players.values()) if (!p.bot && !p.left && p.connected) this.host.send(p.id, { t: 'room', room, you: p.id });
  }

  // ------------------------------------------------------------------ entrada e saída
  addPlayer(id: string, token: string, nick: string, avatar: Avatar, spectator: boolean): RPlayer {
    const p: RPlayer = {
      id, token, nick: this.uniqueNick(nick), avatar, team: null, role: null, roles: [], ready: false, bot: false, spectator,
      connected: true, left: false, disconnectedAt: 0, ping: 0, joinedAt: Date.now(), recent: new Map(), enc: null,
      needFull: true, stats: { commands: 0, markers: 0, produced: 0, spent: 0 },
    };
    this.players.set(id, p);
    this.systemChat(`${p.nick} entrou na sala${spectator ? ' como espectador' : ''}.`);
    this.markDirty();
    return p;
  }

  private uniqueNick(nick: string): string {
    const used = new Set([...this.players.values()].filter((p) => !p.left).map((p) => p.nick.toLowerCase()));
    let n = nick, k = 2;
    while (used.has(n.toLowerCase())) n = `${nick.slice(0, LIMITS.nick - 3)} ${k++}`;
    return n;
  }

  /** Jogador saiu voluntariamente (ou foi removido). */
  leave(id: string, reason = 'saiu'): void {
    const p = this.players.get(id);
    if (!p) return;
    if (this.state === 'lobby' || p.spectator) {
      this.players.delete(id);
    } else {
      p.left = true;
      p.connected = false;
      p.disconnectedAt = 0;
    }
    this.systemChat(`${p.nick} ${reason}.`);
    if (id === this.hostId) {
      const next = this.humans().filter((x) => x.connected).sort((a, b) => a.joinedAt - b.joinedAt)[0];
      if (next) { this.hostId = next.id; this.systemChat(`${next.nick} agora é o anfitrião.`); }
    }
    this.updateCover();
    this.markDirty();
  }

  onDisconnect(id: string): void {
    const p = this.players.get(id);
    if (!p || p.bot) return;
    p.connected = false;
    p.disconnectedAt = Date.now();
    p.enc = null;
    if (this.state === 'lobby') {
      // no lobby, quem cai sai da sala após a carência (pode reconectar antes)
      p.ready = false;
    } else if (!p.spectator) {
      this.systemChat(`${p.nick} desconectou. ${this.config.reconnect ? `A IA assume a função em ${this.config.reconnectGrace} s se não voltar.` : 'A IA assumiu a função.'}`, p.team);
    }
    this.updateCover();
    this.markDirty();
  }

  onReconnect(id: string): void {
    const p = this.players.get(id);
    if (!p) return;
    p.connected = true;
    p.disconnectedAt = 0;
    p.needFull = true;
    p.enc = null;
    this.lastHumanAt = Date.now();
    if (this.state !== 'lobby' && !p.spectator) this.systemChat(`${p.nick} voltou e reassumiu: ${p.roles.join(', ') || 'sem função'}.`, p.team);
    this.updateCover();
    this.markDirty();
    this.sendInitial(p);
  }

  /** Envia tudo o que um cliente precisa ao (re)entrar. */
  sendInitial(p: RPlayer): void {
    this.host.send(p.id, { t: 'room', room: this.view(), you: p.id });
    this.host.send(p.id, { t: 'chatlog', list: this.chat.filter((m) => this.canSee(p, m)) });
    if (this.state !== 'lobby') {
      this.host.send(p.id, { t: 'start', team: p.spectator ? null : p.team, roles: p.roles, spectator: p.spectator, seq: 0, settings: this.game?.w.settings ?? null });
      if (p.team) this.host.send(p.id, { t: 'markers', list: this.markers.filter((m) => m.team === p.team) });
      p.needFull = true;
      if (this.game) this.sendSnapshot(p, []);
    }
    if (this.result) this.host.send(p.id, { t: 'end', result: this.result });
  }

  // ------------------------------------------------------------------ lobby
  lobby(p: RPlayer, msg: Extract<ClientMsg, { t: 'lobby' }>): string | null {
    const isHost = p.id === this.hostId;
    const inLobby = this.state === 'lobby';
    switch (msg.a) {
      case 'team': {
        if (!inLobby || p.spectator) return 'Não é possível trocar de equipe agora.';
        if (this.config.teams === 'auto') return 'As equipes serão equilibradas automaticamente pelo anfitrião.';
        if (msg.team !== null && msg.team !== 'lula' && msg.team !== 'bolso') return 'Equipe inválida.';
        if (msg.team && this.members(msg.team).filter((x) => x.id !== p.id).length >= this.config.size) return 'Equipe cheia.';
        p.team = msg.team;
        if (p.role && msg.team && this.members(msg.team).some((x) => x.id !== p.id && x.role === p.role)) p.role = null;
        p.ready = false;
        break;
      }
      case 'role': {
        if (!inLobby || p.spectator) return 'Não é possível trocar de função agora.';
        if (msg.role !== null && !ROLES.includes(msg.role)) return 'Função inválida.';
        if (msg.role && p.team && this.members(p.team).some((x) => x.id !== p.id && x.role === msg.role)) return 'Função já ocupada na sua equipe.';
        p.role = msg.role;
        break;
      }
      case 'ready':
        if (!inLobby) return null;
        p.ready = !!msg.ready;
        break;
      case 'avatar':
        if (!AVATARS.includes(msg.avatar)) return 'Avatar inválido.';
        p.avatar = msg.avatar;
        break;
      case 'config': {
        if (!isHost) return 'Apenas o anfitrião altera as configurações.';
        if (!inLobby) return 'A partida já começou.';
        const next = sanitizeConfig({ ...this.config, ...(msg.config ?? {}) }, this.config);
        for (const t of ['lula', 'bolso'] as Faction[]) {
          if (this.members(t).length > next.size) return `Reduza os jogadores de ${FACTIONS[t].name} antes de diminuir o tamanho.`;
        }
        if (!next.spectators && [...this.players.values()].some((x) => x.spectator && !x.left)) return 'Há espectadores na sala.';
        this.config = next;
        for (const x of this.humans()) if (x.id !== this.hostId) x.ready = false;
        break;
      }
      case 'kick': {
        if (!isHost) return 'Apenas o anfitrião remove jogadores.';
        const t = this.players.get(msg.id);
        if (!t || t.id === p.id) return 'Jogador inválido.';
        if (t.bot) { this.players.delete(t.id); break; }
        this.banned.add(t.token);
        this.host.removeFromRoom(t.id, 'Você foi removido da sala pelo anfitrião.');
        this.leave(t.id, 'foi removido pelo anfitrião');
        break;
      }
      case 'host': {
        if (!isHost) return 'Apenas o anfitrião transfere a liderança.';
        const t = this.players.get(msg.id);
        if (!t || t.bot || t.left || t.spectator) return 'Jogador inválido.';
        this.hostId = t.id;
        this.systemChat(`${t.nick} agora é o anfitrião.`);
        break;
      }
      case 'addBot': {
        if (!isHost || !inLobby) return 'Apenas o anfitrião adiciona bots no lobby.';
        if (msg.team !== 'lula' && msg.team !== 'bolso') return 'Equipe inválida.';
        if (this.members(msg.team).length >= this.config.size) return 'Equipe cheia.';
        this.addBot(msg.team);
        break;
      }
      case 'removeBot': {
        if (!isHost || !inLobby) return 'Apenas o anfitrião remove bots.';
        const t = this.players.get(msg.id);
        if (!t || !t.bot) return 'Bot inválido.';
        this.players.delete(t.id);
        break;
      }
      case 'balance':
        if (!isHost || !inLobby) return 'Apenas o anfitrião equilibra as equipes.';
        this.balance();
        break;
      case 'start': {
        if (!isHost) return 'Apenas o anfitrião inicia a partida.';
        const b = this.startBlockers();
        if (b.length) return b[0];
        this.start();
        break;
      }
      default:
        return 'Ação inválida.';
    }
    this.markDirty();
    return null;
  }

  private addBot(team: Faction): RPlayer {
    const used = new Set([...this.players.values()].map((p) => p.nick));
    const nick = `BOT ${BOT_NAMES.find((n) => !used.has(`BOT ${n}`)) ?? `Bot ${this.players.size}`}`;
    const id = `bot-${crypto.randomBytes(4).toString('hex')}`;
    const p: RPlayer = {
      id, token: '', nick, avatar: 'escudo', team, role: null, roles: [], ready: true, bot: true, spectator: false,
      connected: true, left: false, disconnectedAt: 0, ping: 0, joinedAt: Date.now(), recent: new Map(), enc: null, needFull: false,
      stats: { commands: 0, markers: 0, produced: 0, spent: 0 },
    };
    this.players.set(id, p);
    return p;
  }

  /** Distribui os humanos alternadamente (por ordem de entrada) para equilibrar as equipes. */
  private balance(): void {
    const humans = this.humans().sort((a, b) => a.joinedAt - b.joinedAt);
    for (const b of [...this.players.values()].filter((x) => x.bot)) this.players.delete(b.id);
    humans.forEach((p, i) => {
      const t: Faction = i % 2 === 0 ? 'lula' : 'bolso';
      if (p.team !== t) { p.team = t; p.role = null; }
    });
    for (const t of ['lula', 'bolso'] as Faction[]) {
      const seen = new Set<Role>();
      for (const p of this.members(t)) { if (p.role && seen.has(p.role)) p.role = null; if (p.role) seen.add(p.role); }
    }
  }

  // ------------------------------------------------------------------ partida
  start(): void {
    if (this.config.teams === 'auto') this.balance();
    if (this.config.bots) {
      for (const t of ['lula', 'bolso'] as Faction[]) while (this.members(t).length < this.config.size) this.addBot(t);
    }
    for (const t of ['lula', 'bolso'] as Faction[]) {
      const map = assignRoles(this.members(t).sort((a, b) => Number(a.bot) - Number(b.bot) || a.joinedAt - b.joinedAt).map((p) => ({ id: p.id, role: p.role })));
      for (const p of this.members(t)) { p.roles = map.get(p.id) ?? []; if (!p.role && p.roles.length) p.role = p.roles[0]; }
    }
    const c = this.config;
    const settings = defaultSettings({
      mode: 'online', player: 'lula', difficulty: c.botDifficulty, distribution: c.distribution, startRes: c.startRes,
      incomeMul: c.incomeMul, enemyAI: false, fog: c.fog, abilities: c.abilities, maxDuration: c.maxDuration,
      prepTime: c.prepTime, victory: c.victory, unitCap: c.unitCap, structureCap: c.structureCap, events: c.events,
      morale: c.morale, seed: crypto.randomInt(1, 2 ** 31 - 1),
    });
    this.game = Game.create(settings);
    this.game.w.factions.lula.difficulty = c.botDifficulty;
    this.game.w.factions.bolso.difficulty = c.botDifficulty;
    this.state = 'playing';
    this.startedAt = Date.now();
    this.replay.push({ tick: 0, type: 'settings', c: settings });
    this.updateCover();
    this.systemChat('A guerra começou! Boa sorte, comandantes.');
    for (const p of this.players.values()) {
      if (p.bot || p.left) continue;
      p.needFull = true;
      p.enc = null;
      this.host.send(p.id, { t: 'start', team: p.spectator ? null : p.team, roles: p.roles, spectator: p.spectator, seq: 0, settings });
    }
    log.info('partida iniciada', { room: this.code, humans: this.humans().length });
    this.markDirty();
  }

  private isCovered(p: RPlayer): boolean {
    if (p.bot) return true;
    if (p.left) return true;
    if (p.connected) return false;
    if (!this.config.reconnect) return true;
    return Date.now() - p.disconnectedAt > this.config.reconnectGrace * 1000;
  }

  /** Funções sem humano ativo passam para a IA da equipe (bots e desconectados). */
  updateCover(): void {
    const g = this.game;
    if (!g || this.state !== 'playing') return;
    for (const t of ['lula', 'bolso'] as Faction[]) {
      const roles = new Set<Role>();
      for (const p of this.members(t).concat([...this.players.values()].filter((x) => x.left && x.team === t))) {
        if (this.isCovered(p)) for (const r of p.roles) roles.add(r);
      }
      // funções que ninguém tem (ex.: equipe sem nenhum membro) também ficam com a IA
      const held = new Set(this.members(t).flatMap((p) => p.roles));
      for (const r of ROLES) if (!held.has(r)) roles.add(r);
      const list = ROLES.filter((r) => roles.has(r));
      const ai = g.w.ai[t] ?? (g.w.ai[t] = newAIState());
      const before = (ai.roles ?? []).join(',');
      ai.roles = list;
      if (before !== list.join(',')) {
        this.replay.push({ tick: g.w.tick, type: 'ai', team: t, roles: list });
        this.markDirty();
      }
    }
  }

  handleCommand(p: RPlayer, msg: Extract<ClientMsg, { t: 'cmd' }>): void {
    const g = this.game;
    const id = Number.isInteger(msg.id) ? msg.id : -1;
    if (id < 0) return;
    const prev = p.recent.get(id);
    if (prev) { this.host.send(p.id, { t: 'ack', id, ...prev }); return; } // mensagem duplicada: idempotente
    let res: { ok: boolean; err?: string };
    if (!g || this.state !== 'playing') res = { ok: false, err: 'Não há partida em andamento.' };
    else if (p.spectator || !p.team) res = { ok: false, err: 'Espectadores não dão ordens.' };
    else {
      const fr = g.w.factions[p.team];
      const before = fr.res.money;
      const stBefore = fr.stats.produced;
      const err = applyCommand(g, p.team, p.roles, msg.c);
      res = err ? { ok: false, err } : { ok: true };
      if (!err) {
        p.stats.commands++;
        const kind = (msg.c as { k?: string })?.k;
        if (kind === 'recruit') p.stats.produced++;
        if (kind === 'ability') p.stats.produced += fr.stats.produced - stBefore;
        if (fr.res.money < before) p.stats.spent += before - fr.res.money;
        this.replay.push({ tick: g.w.tick, type: 'cmd', team: p.team, roles: p.roles, c: msg.c, player: p.id });
      }
    }
    p.recent.set(id, res);
    if (p.recent.size > 300) p.recent.delete(p.recent.keys().next().value!);
    this.host.send(p.id, { t: 'ack', id, ...res });
  }

  // ------------------------------------------------------------------ comunicação
  private canSee(p: RPlayer, m: ChatMsg): boolean {
    return m.scope === 'all' || (!!p.team && m.team === p.team && !p.spectator);
  }

  systemChat(text: string, team: Faction | null = null): void {
    this.pushChat({ id: this.nextChat++, scope: team ? 'team' : 'all', team, from: 'Sistema', fromId: '', text, t: Date.now(), system: true });
  }

  private pushChat(m: ChatMsg): void {
    this.chat.push(m);
    if (this.chat.length > LIMITS.chatHistory) this.chat.splice(0, this.chat.length - LIMITS.chatHistory);
    for (const p of this.players.values()) if (!p.bot && !p.left && p.connected && this.canSee(p, m)) this.host.send(p.id, { t: 'chat', msg: m });
  }

  private lastChat = new Map<string, { text: string; t: number }>();

  handleChat(p: RPlayer, scope: unknown, text: unknown): string | null {
    const t = sanitizeText(text, LIMITS.chat);
    if (!t) return 'Mensagem vazia.';
    // anti-spam: mesma mensagem repetida em sequência é bloqueada
    const prev = this.lastChat.get(p.id);
    if (prev && prev.text === t && Date.now() - prev.t < 8000) return 'Mensagem repetida: aguarde antes de enviar de novo.';
    this.lastChat.set(p.id, { text: t, t: Date.now() });
    const sc = scope === 'team' && p.team && !p.spectator ? 'team' : 'all';
    if (sc === 'all' && p.spectator && this.state === 'playing') {
      // espectadores não podem vazar informações para os jogadores durante a partida
      this.pushChat({ id: this.nextChat++, scope: 'all', team: null, from: `${p.nick} (espectador)`, fromId: p.id, text: t, t: Date.now() });
      return null;
    }
    this.pushChat({ id: this.nextChat++, scope: sc, team: sc === 'team' ? p.team : null, from: p.nick, fromId: p.id, text: t, t: Date.now() });
    return null;
  }

  handleMarker(p: RPlayer, kind: unknown, x: unknown, y: unknown): string | null {
    if (this.state !== 'playing' || !p.team || p.spectator || !this.game) return 'Marcadores só durante a partida.';
    if (!(typeof kind === 'string' && kind in MARKERS)) return 'Marcador inválido.';
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return 'Posição inválida.';
    const map = this.game.map;
    if (x < 0 || y < 0 || x > map.width || y > map.height) return 'Posição inválida.';
    const team = p.team;
    const m: Marker = { id: this.nextMarker++, team, kind: kind as MarkerKind, x: Math.round(x), y: Math.round(y), by: p.nick, t: this.game.w.time };
    this.markers.push(m);
    const mine = this.markers.filter((k) => k.team === team);
    if (mine.length > LIMITS.maxMarkersPerTeam) this.markers = this.markers.filter((k) => k !== mine[0]);
    p.stats.markers++;
    this.broadcastMarkers(team);
    return null;
  }

  private broadcastMarkers(team: Faction): void {
    const list = this.markers.filter((m) => m.team === team);
    for (const p of this.members(team)) if (!p.bot && p.connected) this.host.send(p.id, { t: 'markers', list });
  }

  /** Pedido de troca de função durante a partida (exige aprovação de um colega, se houver). */
  handleRoleSwap(p: RPlayer, msg: Extract<ClientMsg, { t: 'roleswap' }>): string | null {
    if (this.state !== 'playing' || !p.team || p.spectator) return 'Troca de função só durante a partida.';
    if (msg.a === 'request') {
      if (!ROLES.includes(msg.role)) return 'Função inválida.';
      if (p.roles.includes(msg.role)) return 'Você já tem esta função.';
      const holder = this.members(p.team).find((x) => x.roles.includes(msg.role));
      const humansOther = this.members(p.team).filter((x) => !x.bot && x.id !== p.id && x.connected);
      if (!holder || this.isCovered(holder) || !humansOther.length) {
        this.transferRole(p, msg.role);
        return null;
      }
      const id = this.nextSwap++;
      this.swaps.set(id, { id, from: p.id, role: msg.role, team: p.team });
      for (const x of humansOther) this.host.send(x.id, { t: 'roleswap', id, from: p.id, nick: p.nick, role: msg.role, status: 'pending' });
      this.systemChat(`${p.nick} pediu a função ${msg.role}. Um colega precisa aprovar.`, p.team);
      return null;
    }
    const req = this.swaps.get(msg.id);
    if (!req || req.team !== p.team || req.from === p.id) return 'Pedido inválido.';
    this.swaps.delete(msg.id);
    const from = this.players.get(req.from);
    if (from) this.transferRole(from, req.role);
    return null;
  }

  private transferRole(to: RPlayer, role: Role): void {
    const team = to.team!;
    for (const x of this.members(team)) if (x.roles.includes(role)) x.roles = x.roles.filter((r) => r !== role);
    to.roles = [...to.roles, role];
    // quem ficou sem função recebe a função liberada de volta para não ficar ocioso
    for (const x of this.members(team)) if (!x.roles.length && x.id !== to.id) {
      const spare = to.roles.find((r) => r !== role);
      if (spare) { to.roles = to.roles.filter((r) => r !== spare); x.roles = [spare]; }
    }
    this.systemChat(`${to.nick} assumiu a função ${role}.`, team);
    for (const x of this.members(team)) if (!x.bot && x.connected) this.host.send(x.id, { t: 'start', team, roles: x.roles, spectator: false, seq: 1, settings: this.game?.w.settings ?? null });
    this.updateCover();
    this.markDirty();
  }

  // ------------------------------------------------------------------ ciclo
  tick(dt: number): void {
    if (this.state !== 'playing' || !this.game) return;
    const g = this.game;
    try {
      g.step(dt);
    } catch (e) {
      log.error('erro na simulação', { room: this.code, err: String(e), stack: (e as Error).stack });
      this.finish();
      return;
    }
    if (g.events.length) { this.events.push(...g.events); g.events.length = 0; }
    if (this.events.length > 3000) this.events.splice(0, this.events.length - 3000);
    this.tickCount++;
    if (this.tickCount % 20 === 0) {
      this.updateCover();
      const now = g.w.time;
      const before = this.markers.length;
      this.markers = this.markers.filter((m) => now - m.t < LIMITS.markerTtl);
      if (before !== this.markers.length) { this.broadcastMarkers('lula'); this.broadcastMarkers('bolso'); }
      if (this.humans().some((p) => p.connected)) this.lastHumanAt = Date.now();
    }
    if (this.tickCount % 60 === 0) {
      const msg = JSON.stringify({ t: 'score', list: this.scoreboard(), time: g.w.time });
      for (const p of this.players.values()) if (!p.bot && !p.left && p.connected) this.host.sendRaw(p.id, msg);
    }
    if (this.tickCount % 2 === 0) this.broadcastSnapshots();
    if (g.w.winner || g.w.draw) this.finish();
  }

  private sendSnapshot(p: RPlayer, events: SimEvent[]): void {
    if (!this.game || !p.connected) return;
    if (!p.enc) { p.enc = new SnapshotEncoder(p.spectator || !p.team ? 'spectator' : p.team); p.needFull = true; }
    const snap = p.enc.encode(this.game, events, p.needFull);
    p.needFull = false;
    this.host.sendRaw(p.id, JSON.stringify({ t: 'snap', s: snap }));
  }

  private broadcastSnapshots(): void {
    const events = this.events;
    this.events = [];
    for (const p of this.players.values()) if (!p.bot && !p.left && p.connected) this.sendSnapshot(p, events);
  }

  scoreboard(): PlayerStats[] {
    const g = this.game;
    return [...this.players.values()].filter((p) => !p.spectator && p.team).map((p) => {
      const rs = p.roles.map((r) => g?.w.roleStats?.[`${p.team}:${r}`] ?? { killed: 0, lost: 0, captured: 0 });
      const killed = rs.reduce((a, r) => a + r.killed, 0);
      const lost = rs.reduce((a, r) => a + r.lost, 0);
      const captured = rs.reduce((a, r) => a + r.captured, 0);
      const score = Math.round(killed * 10 + captured * 50 + p.stats.produced * 3 + p.stats.spent / 50 + p.stats.commands * 0.5 + p.stats.markers - lost * 2);
      return {
        id: p.id, nick: p.nick, team: p.team!, role: p.role, roles: p.roles, bot: p.bot, produced: p.stats.produced, killed, lost,
        captured, spent: Math.round(p.stats.spent), commands: p.stats.commands, markers: p.stats.markers, score: Math.max(0, score),
      };
    });
  }

  private finish(): void {
    if (this.state === 'ended') return;
    const g = this.game!;
    this.broadcastSnapshots();
    this.state = 'ended';
    this.endedAt = Date.now();
    const team = (f: Faction) => {
      const s = g.w.factions[f].stats;
      return { states: g.statesOf(f).length, produced: s.produced, killed: s.killed, lost: s.lost, captured: s.captured, spent: Math.round(s.spent), damage: Math.round(s.damage) };
    };
    this.result = {
      code: this.code, name: this.config.name, winner: g.w.draw ? null : g.w.winner, draw: !!g.w.draw,
      reason: g.w.endReason || 'Partida encerrada.', duration: Math.round(g.w.time), endedAt: this.endedAt,
      teams: { lula: team('lula'), bolso: team('bolso') }, players: this.scoreboard(),
    };
    for (const p of this.players.values()) if (!p.bot && !p.left && p.connected) this.host.send(p.id, { t: 'end', result: this.result });
    this.host.onRoomEnded(this, this.result);
    log.info('partida encerrada', { room: this.code, winner: this.result.winner, reason: this.result.reason });
    this.markDirty();
  }

  /** Encerra a partida por abandono (sem humanos). */
  abandon(): void {
    if (this.state === 'playing' && this.game) {
      this.game.w.endReason = 'Partida abandonada (sem jogadores conectados).';
      this.game.w.draw = true;
      this.finish();
    }
  }

  // ------------------------------------------------------------------ persistência
  serialize(): unknown {
    return {
      v: PROTOCOL_VERSION, code: this.code, config: this.config, hostId: this.hostId, passHash: this.passHash, salt: this.salt,
      startedAt: this.startedAt, chat: this.chat.slice(-30), banned: [...this.banned],
      players: [...this.players.values()].map((p) => ({
        id: p.id, token: p.token, nick: p.nick, avatar: p.avatar, team: p.team, role: p.role, roles: p.roles, bot: p.bot,
        spectator: p.spectator, left: p.left, joinedAt: p.joinedAt, stats: p.stats,
      })),
      world: this.game?.toJSON(),
      replay: this.replay,
    };
  }

  static restore(data: Record<string, unknown>, host: RoomHost): Room | null {
    if (data.v !== PROTOCOL_VERSION || typeof data.world !== 'string') return null;
    const room = new Room(String(data.code), sanitizeConfig(data.config), String(data.hostId), host, (data.passHash as string) ?? null, String(data.salt));
    room.game = Game.fromJSON(data.world as string);
    room.state = 'playing';
    room.startedAt = Number(data.startedAt) || Date.now();
    room.chat = (data.chat as ChatMsg[]) ?? [];
    room.banned = new Set((data.banned as string[]) ?? []);
    room.replay = (data.replay as Room['replay']) ?? [];
    for (const raw of (data.players as Record<string, unknown>[]) ?? []) {
      const p: RPlayer = {
        id: String(raw.id), token: String(raw.token ?? ''), nick: String(raw.nick), avatar: (raw.avatar as Avatar) ?? 'capacete',
        team: (raw.team as Faction) ?? null, role: (raw.role as Role) ?? null, roles: (raw.roles as Role[]) ?? [], ready: true,
        bot: !!raw.bot, spectator: !!raw.spectator, connected: !!raw.bot, left: !!raw.left, disconnectedAt: Date.now(), ping: 0,
        joinedAt: Number(raw.joinedAt) || Date.now(), recent: new Map(), enc: null, needFull: true,
        stats: (raw.stats as RPlayer['stats']) ?? { commands: 0, markers: 0, produced: 0, spent: 0 },
      };
      room.players.set(p.id, p);
    }
    room.systemChat('O servidor foi reiniciado. A partida foi recuperada — reconecte para continuar.');
    room.updateCover();
    return room;
  }
}
