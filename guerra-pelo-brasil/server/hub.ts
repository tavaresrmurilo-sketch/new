// Hub de conexões: sessões, roteamento de mensagens, salas, ciclo de ticks e persistência.
import crypto from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { CONFIG } from './config';
import { log } from './log';
import { buckets } from './ratelimit';
import { Room, hashPassword, type RoomHost, type RPlayer } from './room';
import * as persist from './persist';
import {
  AVATARS, DEFAULT_CONFIG, LIMITS, PROTOCOL_VERSION, sanitizeConfig, sanitizeNick, sanitizeText,
  type Avatar, type ClientMsg, type MatchResult, type RoomSummary, type ServerMsg,
} from '../shared/net/protocol';

interface Session {
  id: string;
  token: string;
  room: string | null;
  conn: Conn | null;
  lastSeen: number;
}

class Conn {
  session: Session | null = null;
  alive = true;
  dropped = 0;
  readonly b = buckets();
  constructor(public ws: WebSocket, public ip: string) {}
  send(json: string): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(json);
  }
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_RE = /^BR-[A-Z0-9]{5}$/;

export class Hub implements RoomHost {
  readonly rooms = new Map<string, Room>();
  private sessions = new Map<string, Session>();
  private byToken = new Map<string, Session>();
  private ipCount = new Map<string, number>();
  history: MatchResult[] = [];
  private timer: NodeJS.Timeout | null = null;
  private persistTimer: NodeJS.Timeout | null = null;
  private heartbeat: NodeJS.Timeout | null = null;
  readonly wss: WebSocketServer;
  startedAt = Date.now();
  tickStats = { last: 0, max: 0 };

  constructor() {
    this.wss = new WebSocketServer({ noServer: true, maxPayload: LIMITS.maxMessage, perMessageDeflate: { threshold: 1024 } });
    this.wss.on('connection', (ws, req: IncomingMessage) => this.onConnection(ws, req));
  }

  // ------------------------------------------------------------------ ciclo de vida
  start(): void {
    persist.ensureDirs();
    this.history = persist.loadHistory();
    for (const data of persist.loadRooms()) {
      try {
        const room = Room.restore(data as Record<string, unknown>, this);
        if (!room) continue;
        this.rooms.set(room.code, room);
        for (const p of room.players.values()) {
          if (p.bot || !p.token) continue;
          const s: Session = { id: p.id, token: p.token, room: room.code, conn: null, lastSeen: Date.now() };
          this.sessions.set(s.id, s);
          this.byToken.set(s.token, s);
        }
        log.info('partida recuperada do disco', { room: room.code });
      } catch (e) {
        log.error('falha ao recuperar sala', { err: String(e) });
      }
    }
    let last = Date.now();
    this.timer = setInterval(() => {
      const t0 = Date.now();
      const dt = Math.min(0.25, (t0 - last) / 1000);
      last = t0;
      // passos fixos de 50 ms; se o servidor atrasar, recupera até 5 passos
      const steps = Math.max(1, Math.min(5, Math.round(dt / (CONFIG.tickMs / 1000)))) * CONFIG.simSpeed;
      for (const room of this.rooms.values()) {
        for (let i = 0; i < steps; i++) room.tick(CONFIG.tickMs / 1000);
        room.flushView();
      }
      const el = Date.now() - t0;
      this.tickStats.last = el;
      this.tickStats.max = Math.max(this.tickStats.max * 0.995, el);
      if (el > CONFIG.tickMs) log.warn('tick lento', { ms: el, rooms: this.rooms.size });
    }, CONFIG.tickMs);
    this.persistTimer = setInterval(() => this.persistAll(), CONFIG.persistEveryMs);
    this.heartbeat = setInterval(() => this.sweep(), 15_000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.persistTimer) clearInterval(this.persistTimer);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.persistAll();
    for (const c of this.wss.clients) c.close(1001, 'servidor reiniciando');
  }

  persistAll(): void {
    for (const r of this.rooms.values()) if (r.state === 'playing') persist.saveRoom(r.code, r.serialize());
  }

  /** Heartbeat, carência de reconexão no lobby e limpeza de salas ociosas. */
  private sweep(): void {
    for (const ws of this.wss.clients) {
      const c = (ws as WebSocket & { conn?: Conn }).conn;
      if (!c) continue;
      if (!c.alive) { ws.terminate(); continue; }
      c.alive = false;
      ws.ping();
    }
    const now = Date.now();
    for (const room of [...this.rooms.values()]) {
      if (room.state === 'lobby') {
        for (const p of [...room.players.values()]) {
          if (!p.bot && !p.connected && now - p.disconnectedAt > 60_000) { room.leave(p.id, 'saiu (conexão perdida)'); this.detach(p.id); }
        }
        if (!room.humans().length) this.closeRoom(room, 'sala vazia');
      } else if (room.state === 'playing') {
        if (!room.humans().some((p) => p.connected) && now - room.lastHumanAt > CONFIG.idleRoomMs) room.abandon();
      } else if (room.state === 'ended' && now - room.endedAt > 10 * 60_000) {
        this.closeRoom(room, 'encerrada');
      }
    }
    // sessões sem sala e sem conexão expiram
    for (const s of [...this.sessions.values()]) {
      if (!s.conn && !s.room && now - s.lastSeen > 30 * 60_000) { this.sessions.delete(s.id); this.byToken.delete(s.token); }
    }
  }

  private closeRoom(room: Room, reason: string): void {
    for (const p of room.players.values()) if (!p.bot) this.detach(p.id);
    this.rooms.delete(room.code);
    persist.deleteRoom(room.code);
    log.info('sala fechada', { room: room.code, reason });
  }

  private detach(playerId: string): void {
    const s = this.sessions.get(playerId);
    if (s) s.room = null;
  }

  // ------------------------------------------------------------------ RoomHost
  send(playerId: string, msg: ServerMsg): void {
    this.sendRaw(playerId, JSON.stringify(msg));
  }

  sendRaw(playerId: string, json: string): void {
    this.sessions.get(playerId)?.conn?.send(json);
  }

  onRoomEnded(room: Room, result: MatchResult): void {
    this.history.push(result);
    persist.saveHistory(this.history);
    persist.deleteRoom(room.code);
    persist.saveReplay(room.code, result.endedAt, { result, events: room.replay });
  }

  removeFromRoom(playerId: string, reason: string): void {
    this.send(playerId, { t: 'left', reason });
    this.detach(playerId);
  }

  // ------------------------------------------------------------------ consultas HTTP
  publicRooms(): RoomSummary[] {
    return [...this.rooms.values()].filter((r) => r.config.public && r.state !== 'ended').map((r) => r.summary());
  }

  stats() {
    let players = 0, playing = 0;
    for (const r of this.rooms.values()) { players += r.humans().filter((p) => p.connected).length; if (r.state === 'playing') playing++; }
    return { rooms: this.rooms.size, playing, players, connections: this.wss.clients.size, tickMs: this.tickStats.last, tickMaxMs: Math.round(this.tickStats.max) };
  }

  // ------------------------------------------------------------------ conexões
  originAllowed(origin: string | undefined): boolean {
    const list = CONFIG.allowedOrigins;
    if (list.includes('*')) return true;
    return list.includes(origin ?? 'null');
  }

  canAccept(ip: string): boolean {
    return (this.ipCount.get(ip) ?? 0) < LIMITS.maxConnectionsPerIp;
  }

  private onConnection(ws: WebSocket, req: IncomingMessage): void {
    const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '?').split(',')[0].trim();
    this.ipCount.set(ip, (this.ipCount.get(ip) ?? 0) + 1);
    const conn = new Conn(ws, ip);
    (ws as WebSocket & { conn?: Conn }).conn = conn;
    ws.on('pong', () => { conn.alive = true; });
    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      const raw = data.toString();
      if (raw.length > LIMITS.maxMessage) return;
      if (!conn.b.msg.take()) { this.rejectRate(conn); return; }
      let msg: unknown;
      try { msg = JSON.parse(raw); } catch { this.err(conn, 'json', 'Mensagem malformada.'); return; }
      try { this.route(conn, msg as ClientMsg); } catch (e) { log.error('erro ao tratar mensagem', { err: String(e), stack: (e as Error).stack }); this.err(conn, 'server', 'Erro interno.'); }
    });
    ws.on('close', () => {
      this.ipCount.set(ip, Math.max(0, (this.ipCount.get(ip) ?? 1) - 1));
      const s = conn.session;
      if (!s || s.conn !== conn) return;
      s.conn = null;
      s.lastSeen = Date.now();
      const room = s.room ? this.rooms.get(s.room) : null;
      room?.onDisconnect(s.id);
    });
    ws.on('error', (e) => log.warn('erro de socket', { err: String(e) }));
  }

  private rejectRate(conn: Conn): void {
    conn.dropped++;
    if (conn.dropped % 20 === 1) this.err(conn, 'rate', 'Muitas mensagens: aguarde um instante.');
    if (conn.dropped > 400) { log.warn('conexão encerrada por abuso', { ip: conn.ip }); conn.ws.close(1008, 'rate limit'); }
  }

  private err(conn: Conn, code: string, msg: string): void {
    conn.send(JSON.stringify({ t: 'error', code, msg } satisfies ServerMsg));
  }

  private player(conn: Conn): { room: Room; p: RPlayer } | null {
    const s = conn.session;
    if (!s?.room) return null;
    const room = this.rooms.get(s.room);
    const p = room?.players.get(s.id);
    return room && p ? { room, p } : null;
  }

  private newCode(): string {
    for (;;) {
      let c = 'BR-';
      for (let i = 0; i < 5; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
      if (!this.rooms.has(c)) return c;
    }
  }

  private route(conn: Conn, msg: ClientMsg): void {
    if (!msg || typeof msg !== 'object' || typeof (msg as { t?: unknown }).t !== 'string') { this.err(conn, 'bad', 'Mensagem inválida.'); return; }
    if (msg.t !== 'hello' && !conn.session) { this.err(conn, 'hello', 'Identifique-se primeiro.'); return; }
    switch (msg.t) {
      case 'hello': return this.onHello(conn, msg);
      case 'ping': {
        conn.send(JSON.stringify({ t: 'pong', ts: typeof msg.ts === 'number' ? msg.ts : 0 }));
        const rtt = (msg as { rtt?: unknown }).rtt;
        const ctx = this.player(conn);
        if (ctx && typeof rtt === 'number' && rtt >= 0 && rtt < 10000) { ctx.p.ping = Math.round(rtt); }
        return;
      }
      case 'list': conn.send(JSON.stringify({ t: 'rooms', list: this.publicRooms() } satisfies ServerMsg)); return;
      case 'history': conn.send(JSON.stringify({ t: 'history', list: this.history.slice(-30).reverse() } satisfies ServerMsg)); return;
      case 'create': return this.onCreate(conn, msg);
      case 'join': return this.onJoin(conn, msg);
      case 'leave': {
        const ctx = this.player(conn);
        if (ctx) { ctx.room.leave(ctx.p.id); this.detach(ctx.p.id); conn.send(JSON.stringify({ t: 'left', reason: 'Você saiu da sala.' } satisfies ServerMsg)); }
        return;
      }
      default: break;
    }
    const ctx = this.player(conn);
    if (!ctx) { this.err(conn, 'noroom', 'Você não está em uma sala.'); return; }
    const { room, p } = ctx;
    switch (msg.t) {
      case 'lobby': {
        if (!conn.b.lobby.take()) return this.rejectRate(conn);
        const e = room.lobby(p, msg);
        if (e) this.err(conn, 'lobby', e);
        return;
      }
      case 'chat': {
        if (!conn.b.chat.take()) { this.err(conn, 'rate', 'Aguarde para enviar outra mensagem.'); return; }
        const e = room.handleChat(p, msg.scope, msg.text);
        if (e) this.err(conn, 'chat', e);
        return;
      }
      case 'marker': {
        if (!conn.b.marker.take()) { this.err(conn, 'rate', 'Aguarde para enviar outro marcador.'); return; }
        const e = room.handleMarker(p, msg.kind, msg.x, msg.y);
        if (e) this.err(conn, 'marker', e);
        return;
      }
      case 'cmd':
        if (!conn.b.cmd.take()) { conn.send(JSON.stringify({ t: 'ack', id: msg.id, ok: false, err: 'Ordens rápidas demais.' })); return; }
        room.handleCommand(p, msg);
        return;
      case 'full':
        p.needFull = true;
        return;
      case 'roleswap': {
        const e = room.handleRoleSwap(p, msg);
        if (e) this.err(conn, 'roleswap', e);
        return;
      }
      default:
        this.err(conn, 'bad', 'Tipo de mensagem desconhecido.');
    }
  }

  private onHello(conn: Conn, msg: Extract<ClientMsg, { t: 'hello' }>): void {
    if (msg.v !== PROTOCOL_VERSION) { this.err(conn, 'version', 'Versão do jogo incompatível com o servidor. Atualize a página.'); return; }
    let s = typeof msg.token === 'string' ? this.byToken.get(msg.token) : undefined;
    let resumed: string | null = null;
    if (s) {
      // nova conexão substitui a antiga (outra aba ou queda de rede)
      if (s.conn && s.conn !== conn) { s.conn.session = null; s.conn.ws.close(4000, 'sessão aberta em outro lugar'); }
      s.conn = conn;
      s.lastSeen = Date.now();
      conn.session = s;
      const room = s.room ? this.rooms.get(s.room) : null;
      if (room && room.players.has(s.id)) resumed = room.code;
      else s.room = null;
    } else {
      s = { id: crypto.randomBytes(6).toString('hex'), token: crypto.randomBytes(24).toString('base64url'), room: null, conn, lastSeen: Date.now() };
      this.sessions.set(s.id, s);
      this.byToken.set(s.token, s);
      conn.session = s;
    }
    conn.send(JSON.stringify({ t: 'welcome', id: s.id, token: s.token, v: PROTOCOL_VERSION, resumed } satisfies ServerMsg));
    if (resumed) this.rooms.get(resumed)!.onReconnect(s.id);
  }

  private onCreate(conn: Conn, msg: Extract<ClientMsg, { t: 'create' }>): void {
    if (!conn.b.room.take()) return this.rejectRate(conn);
    const s = conn.session!;
    const nick = sanitizeNick(msg.nick);
    if (!nick) { this.err(conn, 'nick', 'Apelido inválido (2 a 20 caracteres).'); return; }
    if (this.rooms.size >= Math.min(CONFIG.maxRooms, LIMITS.maxRooms)) { this.err(conn, 'full', 'Servidor lotado: tente mais tarde.'); return; }
    this.leaveCurrent(s);
    const config = sanitizeConfig(msg.config ?? {}, DEFAULT_CONFIG);
    const pw = sanitizeText(msg.password ?? '', LIMITS.password);
    const code = this.newCode();
    const salt = crypto.randomBytes(8).toString('hex');
    const room = new Room(code, config, s.id, this, pw ? hashPassword(pw, salt) : null, salt);
    this.rooms.set(code, room);
    const avatar: Avatar = AVATARS.includes(msg.avatar as Avatar) ? (msg.avatar as Avatar) : 'capacete';
    room.addPlayer(s.id, s.token, nick, avatar, false);
    s.room = code;
    log.info('sala criada', { room: code, size: config.size, public: config.public });
    room.sendInitial(room.players.get(s.id)!);
  }

  private onJoin(conn: Conn, msg: Extract<ClientMsg, { t: 'join' }>): void {
    if (!conn.b.room.take()) return this.rejectRate(conn);
    const s = conn.session!;
    const code = String(msg.code ?? '').trim().toUpperCase();
    if (!CODE_RE.test(code)) { this.err(conn, 'code', 'Código inválido. Exemplo: BR-7KQ42.'); return; }
    const room = this.rooms.get(code);
    if (!room || room.state === 'ended') { this.err(conn, 'notfound', 'Sala não encontrada ou encerrada.'); return; }
    if (room.players.has(s.id) && !room.players.get(s.id)!.left) { s.room = code; room.onReconnect(s.id); return; }
    if (room.banned.has(s.token)) { this.err(conn, 'banned', 'Você foi removido desta sala.'); return; }
    if (room.passHash) {
      const pw = sanitizeText(msg.password ?? '', LIMITS.password);
      const a = Buffer.from(hashPassword(pw, room.salt), 'hex'), b = Buffer.from(room.passHash, 'hex');
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) { this.err(conn, 'password', 'Senha incorreta.'); return; }
    }
    const nick = sanitizeNick(msg.nick);
    if (!nick) { this.err(conn, 'nick', 'Apelido inválido (2 a 20 caracteres).'); return; }
    let spectator = !!msg.spectator;
    if (room.state === 'playing') {
      if (!room.config.spectators) { this.err(conn, 'started', 'A partida já começou e esta sala não aceita espectadores.'); return; }
      spectator = true;
    }
    if (spectator) {
      if (!room.config.spectators) { this.err(conn, 'nospec', 'Esta sala não aceita espectadores.'); return; }
      if ([...room.players.values()].filter((p) => p.spectator && !p.left).length >= LIMITS.maxSpectators) { this.err(conn, 'full', 'Limite de espectadores atingido.'); return; }
    } else if (room.humans().length >= room.config.size * 2) {
      this.err(conn, 'full', 'Sala cheia.');
      return;
    }
    this.leaveCurrent(s);
    const avatar: Avatar = AVATARS.includes(msg.avatar as Avatar) ? (msg.avatar as Avatar) : 'capacete';
    const p = room.addPlayer(s.id, s.token, nick, avatar, spectator);
    s.room = code;
    room.sendInitial(p);
  }

  private leaveCurrent(s: Session): void {
    if (!s.room) return;
    const old = this.rooms.get(s.room);
    old?.leave(s.id);
    s.room = null;
  }
}
