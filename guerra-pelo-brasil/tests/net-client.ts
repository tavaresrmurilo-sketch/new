// Cliente de teste independente: conexão WebSocket própria, sessão própria e
// mundo espelho reconstruído a partir dos snapshots (como o navegador faz).
import WebSocket from 'ws';
import { Game } from '../shared/sim/game';
import { applySnapshot, type Snapshot } from '../shared/net/snapshot';
import { PROTOCOL_VERSION, type ClientMsg, type MatchResult, type RoomView, type ServerMsg } from '../shared/net/protocol';
import type { Faction, MatchSettings, Role } from '../shared/sim/types';

export class TestClient {
  ws!: WebSocket;
  id = '';
  token = '';
  room: RoomView | null = null;
  team: Faction | null = null;
  roles: Role[] = [];
  game: Game | null = null;
  result: MatchResult | null = null;
  msgs: ServerMsg[] = [];
  errors: string[] = [];
  acks = new Map<number, { ok: boolean; err?: string }>();
  snaps = 0;
  private cmdId = 1;
  private waiters: { pred: (m: ServerMsg) => boolean; res: (m: ServerMsg) => void }[] = [];

  constructor(public url: string, public name: string) {}

  async connect(token?: string): Promise<void> {
    this.ws = new WebSocket(this.url);
    this.ws.on('message', (d) => this.onMsg(JSON.parse(d.toString()) as ServerMsg));
    await new Promise<void>((res, rej) => { this.ws.once('open', () => res()); this.ws.once('error', rej); });
    this.send({ t: 'hello', v: PROTOCOL_VERSION, token: token ?? (this.token || undefined) });
    await this.waitFor((m) => m.t === 'welcome');
  }

  private onMsg(m: ServerMsg): void {
    this.msgs.push(m);
    if (this.msgs.length > 400) this.msgs.splice(0, 200);
    switch (m.t) {
      case 'welcome': this.id = m.id; this.token = m.token; break;
      case 'room': this.room = m.room; break;
      case 'error': this.errors.push(m.msg); break;
      case 'ack': this.acks.set(m.id, { ok: m.ok, err: m.err }); break;
      case 'start':
        this.team = m.team;
        this.roles = m.roles;
        if (m.settings && (!this.game || m.seq === 0)) this.game = Game.create(m.settings as MatchSettings);
        break;
      case 'snap':
        if (this.game) { applySnapshot(this.game, m.s as Snapshot, this.team); this.game.events.length = 0; this.snaps++; }
        break;
      case 'end': this.result = m.result; break;
    }
    for (const w of [...this.waiters]) if (w.pred(m)) { this.waiters.splice(this.waiters.indexOf(w), 1); w.res(m); }
  }

  send(m: ClientMsg | Record<string, unknown>): void {
    this.ws.send(JSON.stringify(m));
  }

  waitFor(pred: (m: ServerMsg) => boolean, timeout = 15000): Promise<ServerMsg> {
    return new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error(`${this.name}: tempo esgotado esperando mensagem`)), timeout);
      this.waiters.push({ pred, res: (m) => { clearTimeout(t); res(m); } });
    });
  }

  /** Espera uma condição sobre o estado local (mundo espelho). */
  async until(cond: () => boolean, timeout = 20000, label = 'condição'): Promise<void> {
    const t0 = Date.now();
    while (!cond()) {
      if (Date.now() - t0 > timeout) throw new Error(`${this.name}: tempo esgotado (${label})`);
      await new Promise((r) => setTimeout(r, 40));
    }
  }

  async cmd(c: Record<string, unknown>): Promise<{ ok: boolean; err?: string }> {
    const id = this.cmdId++;
    this.send({ t: 'cmd', id, c });
    const m = await this.waitFor((x) => x.t === 'ack' && x.id === id);
    return m as { ok: boolean; err?: string } & ServerMsg;
  }

  close(): void {
    this.ws.close();
  }
}
