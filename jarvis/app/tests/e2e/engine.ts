/** Starts a real Jarvis Engine for E2E tests in a sandboxed HOME (side effects recorded, not executed). */
import { ChildProcess, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const ENGINE_DIR = path.resolve(__dirname, "..", "..", "..", "engine");
const PYTHON = process.env.JARVIS_PYTHON ||
  (process.platform === "win32" ? path.join(ENGINE_DIR, ".venv", "Scripts", "python.exe") : path.join(ENGINE_DIR, ".venv", "bin", "python"));

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const port = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(port));
    });
  });
}

export class TestEngine {
  proc: ChildProcess | null = null;
  port = 0;
  readonly token = crypto.randomBytes(16).toString("hex");
  readonly root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-e2e-"));
  readonly home = path.join(this.root, "home");
  readonly dataDir = path.join(this.root, "data");
  readonly sandboxLog = path.join(this.root, "sandbox.jsonl");

  constructor() {
    const w = (p: string, content: string) => {
      fs.mkdirSync(path.dirname(path.join(this.home, p)), { recursive: true });
      fs.writeFileSync(path.join(this.home, p), content);
    };
    for (const d of ["Desktop", "Documents", "Downloads"]) fs.mkdirSync(path.join(this.home, d), { recursive: true });
    w("Documents/apresentacao-escola.md", "Apresentação da escola sobre fotossíntese");
    w("Documents/relatorio-q3.txt", "Relatório financeiro Q3");
    w("Downloads/contrato-beta.txt", "Contrato de aluguel BETA");
    w("Projects/projeto-beta/package.json", JSON.stringify({ name: "projeto-beta", scripts: { dev: "node server.js", test: "node test.js" } }));
    w("Projects/projeto-beta/test.js", "console.log('2 passed')");
    fs.mkdirSync(path.join(this.home, "Projects/projeto-beta/node_modules"), { recursive: true });
  }

  setPort(port: number): void {
    const server = `require('http').createServer((q,r)=>r.end('beta ok')).listen(${port},()=>console.log('ready http://localhost:${port}'))`;
    fs.writeFileSync(path.join(this.home, "Projects/projeto-beta/server.js"), server);
  }

  async start(): Promise<void> {
    if (!this.port) this.port = await freePort();
    this.proc = spawn(PYTHON, ["-m", "jarvis_engine"], {
      cwd: ENGINE_DIR,
      env: {
        ...process.env,
        HOME: this.home,
        USERPROFILE: this.home,
        JARVIS_PORT: String(this.port),
        JARVIS_TOKEN: this.token,
        JARVIS_DATA_DIR: this.dataDir,
        JARVIS_SANDBOX_LOG: this.sandboxLog,
        JARVIS_ALLOWED_ORIGINS: "http://127.0.0.1:4174,http://localhost:4174",
        OPENAI_API_KEY: "",
        ANTHROPIC_API_KEY: "",
        GEMINI_API_KEY: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.proc.stderr?.on("data", () => undefined);
    this.proc.stdout?.on("data", () => undefined);
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      try {
        const r = await fetch(`http://127.0.0.1:${this.port}/health`);
        if (r.ok) return;
      } catch {
        /* not up yet */
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error("engine did not start");
  }

  async stop(): Promise<void> {
    const p = this.proc;
    this.proc = null;
    if (!p) return;
    await new Promise<void>((resolve) => {
      p.once("exit", () => resolve());
      p.kill(process.platform === "win32" ? undefined : "SIGTERM");
      setTimeout(resolve, 5000);
    });
  }

  url(route = "hud"): string {
    return `/?engine=${encodeURIComponent(`ws://127.0.0.1:${this.port}/ws`)}&token=${this.token}#/${route}`;
  }

  recorded(): { action: string; [k: string]: unknown }[] {
    if (!fs.existsSync(this.sandboxLog)) return [];
    return fs.readFileSync(this.sandboxLog, "utf-8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  }

  /** One-shot RPC over the real WebSocket protocol. */
  rpc<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${this.port}/ws`);
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error(`rpc timeout ${method}`));
      }, 15000);
      ws.onopen = () => ws.send(JSON.stringify({ type: "auth", token: this.token, client: { kind: "web", capabilities: [] } }));
      ws.onmessage = (ev) => {
        const m = JSON.parse(String(ev.data));
        if (m.type === "hello") ws.send(JSON.stringify({ type: "rpc", id: 1, method, params }));
        if (m.type === "rpc.result" && m.id === 1) {
          clearTimeout(timer);
          ws.close();
          m.ok ? resolve(m.result as T) : reject(new Error(m.error));
        }
      };
      ws.onerror = () => reject(new Error("ws error"));
    });
  }

  cleanup(): void {
    fs.rmSync(this.root, { recursive: true, force: true });
  }
}
