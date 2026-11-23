// Cliente WebSocket do multiplayer: status real, reconexão automática com
// recuo exponencial, ping, e comandos com id + confirmação (reenviados após queda).
import { PROTOCOL_VERSION, type ClientMsg, type ServerMsg } from '@shared/net/protocol';

export type NetStatus = 'offline' | 'conectando' | 'conectado' | 'reconectando' | 'erro';

const TOKEN_KEY = 'gpb.v1.net.token';
const ROOM_KEY = 'gpb.v1.net.room';

function store(key: string, v: string | null): void {
  try { if (v === null) localStorage.removeItem(key); else localStorage.setItem(key, v); } catch { /* armazenamento indisponível */ }
}
function load(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

/** Resolve o endereço WebSocket do servidor. */
export function resolveServerUrl(configured: string): string {
  let base = configured.trim();
  if (!base) {
    const env = (import.meta.env.VITE_SERVER_URL as string | undefined) ?? '';
    if (env) base = env;
    else if (location.protocol === 'http:' || location.protocol === 'https:') base = location.origin;
    else base = 'http://localhost:8787';
  }
  if (!/^[a-z]+:\/\//i.test(base)) base = `https://${base}`;
  const u = new URL(base);
  u.protocol = u.protocol === 'https:' || u.protocol === 'wss:' ? 'wss:' : 'ws:';
  if (!u.pathname.endsWith('/ws')) u.pathname = u.pathname.replace(/\/$/, '') + '/ws';
  return u.toString();
}

export class NetClient {
  status: NetStatus = 'offline';
  statusMsg = '';
  id = '';
  ping = 0;
  private ws: WebSocket | null = null;
  private url = '';
  private want = false;
  private retry = 0;
  private retryTimer: number | null = null;
  private pingTimer: number | null = null;
  // ids crescentes entre recarregamentos da página (o servidor descarta duplicados por id)
  private cmdId = Date.now();
  private pending = new Map<number, { c: unknown; sent: number; cb?: (ok: boolean, err?: string) => void }>();
  private handlers = new Set<(m: ServerMsg) => void>();
  private statusHandlers = new Set<(s: NetStatus) => void>();

  get token(): string | null { return load(TOKEN_KEY); }
  get lastRoom(): string | null { return load(ROOM_KEY); }
  set lastRoom(v: string | null) { store(ROOM_KEY, v); }

  on(h: (m: ServerMsg) => void): () => void {
    this.handlers.add(h);
    return () => this.handlers.delete(h);
  }

  onStatus(h: (s: NetStatus) => void): () => void {
    this.statusHandlers.add(h);
    return () => this.statusHandlers.delete(h);
  }

  private setStatus(s: NetStatus, msg = ''): void {
    this.status = s;
    this.statusMsg = msg;
    for (const h of this.statusHandlers) h(s);
  }

  connect(url: string): void {
    if (this.ws && this.url === url && (this.status === 'conectado' || this.status === 'conectando')) return;
    this.url = url;
    this.want = true;
    this.retry = 0;
    this.open();
  }

  disconnect(): void {
    this.want = false;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.ws?.close(1000);
    this.ws = null;
    this.setStatus('offline');
  }

  private open(): void {
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
    this.setStatus(this.retry ? 'reconectando' : 'conectando');
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch (e) {
      this.setStatus('erro', `Endereço inválido: ${String(e)}`);
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, token: this.token ?? undefined } satisfies ClientMsg));
    };
    ws.onmessage = (ev) => {
      let m: ServerMsg;
      try { m = JSON.parse(String(ev.data)) as ServerMsg; } catch { return; }
      if (m.t === 'welcome') {
        this.id = m.id;
        store(TOKEN_KEY, m.token);
        this.retry = 0;
        this.setStatus('conectado');
        this.startPing();
        // comandos não confirmados antes da queda são reenviados (o servidor ignora duplicados)
        for (const [id, p] of this.pending) ws.send(JSON.stringify({ t: 'cmd', id, c: p.c }));
      } else if (m.t === 'pong') {
        this.ping = Math.max(0, Math.round(performance.now() - m.ts));
      } else if (m.t === 'ack') {
        const p = this.pending.get(m.id);
        this.pending.delete(m.id);
        p?.cb?.(m.ok, m.err);
      } else if (m.t === 'error' && m.code === 'version') {
        this.want = false;
        this.setStatus('erro', m.msg);
      }
      for (const h of this.handlers) h(m);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
      if (!this.want) { this.setStatus('offline'); return; }
      this.retry++;
      const delay = Math.min(10000, 500 * 2 ** Math.min(5, this.retry));
      this.setStatus(this.retry > 6 ? 'erro' : 'reconectando', this.retry > 6 ? 'Servidor indisponível. Tentando novamente…' : '');
      this.retryTimer = window.setTimeout(() => this.open(), delay);
    };
    ws.onerror = () => { /* o onclose trata */ };
  }

  private startPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    const tick = () => this.send({ t: 'ping', ts: performance.now(), rtt: this.ping } as ClientMsg);
    tick();
    this.pingTimer = window.setInterval(tick, 2000);
  }

  send(m: ClientMsg): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(m));
    return true;
  }

  /** Envia um comando de jogo com id único; a confirmação chega por callback. */
  cmd(c: unknown, cb?: (ok: boolean, err?: string) => void): void {
    const id = this.cmdId++;
    this.pending.set(id, { c, sent: Date.now(), cb });
    if (this.pending.size > 200) this.pending.delete(this.pending.keys().next().value!);
    this.send({ t: 'cmd', id, c });
  }
}
