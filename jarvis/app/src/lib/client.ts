/**
 * JarvisClient: authenticated WebSocket link to the engine.
 * - automatic reconnection with exponential backoff + jitter
 * - request/response RPC with timeouts
 * - binary frames (4-byte header length + JSON header + payload) for audio
 * No polling: every update is pushed by the engine.
 */
import type { ConnState, Snapshot } from "./types";

export type ServerMessage =
  | { type: "hello"; version: string; clientId: string; snapshot: Snapshot }
  | { type: "event"; event: string; data: any; ts: number; id: number }
  | { type: "rpc.result"; id: number; ok: boolean; result?: any; error?: string }
  | { type: "client.request"; id: string; op: string; params: Record<string, any> }
  | { type: "voice.say"; utteranceId: string; seq: number; text: string; rate: number; voiceName: string; lang: string }
  | { type: "voice.say_end"; utteranceId: string; count: number }
  | { type: "voice.capture"; mode: string }
  | { type: "pong"; ts: number };

export interface BinaryFrame {
  header: Record<string, any>;
  payload: ArrayBuffer;
}

type Handler<T> = (value: T) => void;

export class RpcError extends Error {}

export class JarvisClient {
  private ws: WebSocket | null = null;
  private url = "";
  private token = "";
  private attempt = 0;
  private timer: number | null = null;
  private seq = 0;
  private closedByUser = false;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: number }>();
  private messageHandlers = new Set<Handler<ServerMessage>>();
  private binaryHandlers = new Set<Handler<BinaryFrame>>();
  private stateHandlers = new Set<Handler<ConnState>>();
  state: ConnState = "connecting";

  constructor(
    private kind: "main" | "mini" | "palette" | "web",
    private capabilities: string[],
    private requestHandler?: (op: string, params: Record<string, any>) => Promise<unknown>,
  ) {}

  onMessage(h: Handler<ServerMessage>): () => void {
    this.messageHandlers.add(h);
    return () => this.messageHandlers.delete(h);
  }

  onBinary(h: Handler<BinaryFrame>): () => void {
    this.binaryHandlers.add(h);
    return () => this.binaryHandlers.delete(h);
  }

  onState(h: Handler<ConnState>): () => void {
    this.stateHandlers.add(h);
    h(this.state);
    return () => this.stateHandlers.delete(h);
  }

  private setState(s: ConnState): void {
    this.state = s;
    this.stateHandlers.forEach((h) => h(s));
  }

  connect(url: string, token: string): void {
    this.url = url;
    this.token = token;
    this.closedByUser = false;
    this.open();
  }

  private open(): void {
    if (!this.url || !this.token) {
      this.setState("offline");
      return;
    }
    this.clearTimer();
    this.setState(this.attempt === 0 ? "connecting" : "reconnecting");
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    ws.binaryType = "arraybuffer";
    this.ws = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "auth", token: this.token, client: { kind: this.kind, capabilities: this.capabilities } }));
    };
    ws.onmessage = (ev) => {
      if (typeof ev.data === "string") {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg.type === "hello") {
          this.attempt = 0;
          this.setState("online");
        }
        this.dispatch(msg);
      } else if (ev.data instanceof ArrayBuffer) {
        const frame = decodeFrame(ev.data);
        if (frame) this.binaryHandlers.forEach((h) => h(frame));
      }
    };
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.failPending("Conexão com o engine perdida.");
      if (this.closedByUser) {
        this.setState("offline");
        return;
      }
      if (ev.code === 4401 || ev.code === 4403) {
        this.setState("offline");
        return;
      }
      this.scheduleReconnect();
    };
    ws.onerror = () => {
      /* onclose handles reconnection */
    };
  }

  private dispatch(msg: ServerMessage): void {
    if (msg.type === "rpc.result") {
      const p = this.pending.get(msg.id);
      if (p) {
        window.clearTimeout(p.timer);
        this.pending.delete(msg.id);
        msg.ok ? p.resolve(msg.result) : p.reject(new RpcError(msg.error || "Erro"));
      }
      return;
    }
    if (msg.type === "client.request") {
      void this.answer(msg.id, msg.op, msg.params);
      return;
    }
    this.messageHandlers.forEach((h) => h(msg));
  }

  private async answer(id: string, op: string, params: Record<string, any>): Promise<void> {
    if (!this.requestHandler) {
      this.sendRaw({ type: "client.response", id, error: "unsupported" });
      return;
    }
    try {
      const result = await this.requestHandler(op, params);
      this.sendRaw({ type: "client.response", id, result });
    } catch (err) {
      this.sendRaw({ type: "client.response", id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  private scheduleReconnect(): void {
    this.setState("reconnecting");
    const base = Math.min(8000, 400 * 2 ** this.attempt);
    const delay = base / 2 + Math.random() * (base / 2);
    this.attempt += 1;
    this.clearTimer();
    this.timer = window.setTimeout(() => this.open(), delay);
  }

  reconnectNow(): void {
    this.attempt = 0;
    this.ws?.close();
    this.open();
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private failPending(reason: string): void {
    for (const [id, p] of this.pending) {
      window.clearTimeout(p.timer);
      p.reject(new RpcError(reason));
      this.pending.delete(id);
    }
  }

  close(): void {
    this.closedByUser = true;
    this.clearTimer();
    this.ws?.close();
  }

  private sendRaw(msg: unknown): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  send(msg: Record<string, unknown>): boolean {
    return this.sendRaw(msg);
  }

  command(text: string, source: "text" | "voice" = "text"): boolean {
    return this.sendRaw({ type: "command", text, source });
  }

  sendBinary(header: Record<string, unknown>, payload: ArrayBuffer | Uint8Array): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    const head = new TextEncoder().encode(JSON.stringify(header));
    const body = payload instanceof Uint8Array ? payload : new Uint8Array(payload);
    const frame = new Uint8Array(4 + head.length + body.length);
    new DataView(frame.buffer).setUint32(0, head.length, false);
    frame.set(head, 4);
    frame.set(body, 4 + head.length);
    this.ws.send(frame);
    return true;
  }

  rpc<T = any>(method: string, params: Record<string, unknown> = {}, timeoutMs = 20000): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = ++this.seq;
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new RpcError("O engine não respondeu a tempo."));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      if (!this.sendRaw({ type: "rpc", id, method, params })) {
        window.clearTimeout(timer);
        this.pending.delete(id);
        reject(new RpcError("Sem conexão com o engine."));
      }
    });
  }
}

export function decodeFrame(buf: ArrayBuffer): BinaryFrame | null {
  if (buf.byteLength < 4) return null;
  const len = new DataView(buf).getUint32(0, false);
  if (len <= 0 || len > 8192 || 4 + len > buf.byteLength) return null;
  try {
    const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, len)));
    return { header, payload: buf.slice(4 + len) };
  } catch {
    return null;
  }
}
