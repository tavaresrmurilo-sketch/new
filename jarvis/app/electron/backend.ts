/**
 * Supervises the Python Jarvis Engine: picks a free loopback port, generates a
 * per-launch auth token, spawns the engine, waits for /health and restarts it
 * (with backoff) if it crashes. The token only ever reaches our own renderer.
 */
import { app } from "electron";
import { ChildProcess, spawn } from "node:child_process";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";

export type EngineStatus = "starting" | "online" | "offline" | "crashed" | "missing";

export interface EngineInfo {
  status: EngineStatus;
  url: string;
  token: string;
  detail: string;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

function healthy(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port, path: "/health", timeout: 1500 }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        try {
          resolve(res.statusCode === 200 && JSON.parse(body).status === "ok");
        } catch {
          resolve(false);
        }
      });
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

interface Command {
  cmd: string;
  args: string[];
  cwd: string;
}

export class EngineProcess extends EventEmitter {
  status: EngineStatus = "starting";
  detail = "";
  port = 0;
  readonly token = crypto.randomBytes(32).toString("base64url");
  private child: ChildProcess | null = null;
  private restarts: number[] = [];
  private stopping = false;
  private logStream: fs.WriteStream | null = null;

  get info(): EngineInfo {
    return { status: this.status, url: `ws://127.0.0.1:${this.port}/ws`, token: this.token, detail: this.detail };
  }

  private set(status: EngineStatus, detail = ""): void {
    this.status = status;
    this.detail = detail;
    this.emit("status", this.info);
  }

  resolveCommand(): Command | null {
    const override = process.env.JARVIS_PYTHON;
    if (app.isPackaged) {
      const exe = path.join(process.resourcesPath, "engine", "jarvis-engine", process.platform === "win32" ? "jarvis-engine.exe" : "jarvis-engine");
      if (fs.existsSync(exe)) return { cmd: exe, args: [], cwd: path.dirname(exe) };
    }
    const engineDir = app.isPackaged
      ? path.join(process.resourcesPath, "engine-src")
      : path.resolve(app.getAppPath(), "..", "engine");
    const venvPython =
      process.platform === "win32"
        ? path.join(engineDir, ".venv", "Scripts", "python.exe")
        : path.join(engineDir, ".venv", "bin", "python");
    const python = override || (fs.existsSync(venvPython) ? venvPython : null);
    if (!python || !fs.existsSync(path.join(engineDir, "jarvis_engine"))) return null;
    return { cmd: python, args: ["-m", "jarvis_engine"], cwd: engineDir };
  }

  async start(): Promise<void> {
    this.stopping = false;
    const command = this.resolveCommand();
    if (!command) {
      this.set("missing", "Engine não encontrado. Execute setup.cmd para criar o ambiente Python.");
      return;
    }
    this.port = await freePort();
    this.set("starting", "Iniciando o Jarvis Engine…");
    const logDir = path.join(app.getPath("userData"), "logs");
    fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, "engine-process.log");
    try {
      if (fs.existsSync(logFile) && fs.statSync(logFile).size > 5_000_000) fs.truncateSync(logFile, 0);
    } catch {
      /* ignore */
    }
    this.logStream = fs.createWriteStream(logFile, { flags: "a" });
    const env = {
      ...process.env,
      JARVIS_PORT: String(this.port),
      JARVIS_TOKEN: this.token,
      JARVIS_DATA_DIR: path.join(app.getPath("userData"), "data"),
      JARVIS_DEV: app.isPackaged ? "" : "1",
      PYTHONUNBUFFERED: "1",
      PYTHONIOENCODING: "utf-8",
    };
    const child = spawn(command.cmd, command.args, { cwd: command.cwd, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    this.child = child;
    child.stdout?.on("data", (d: Buffer) => this.logStream?.write(d));
    child.stderr?.on("data", (d: Buffer) => this.logStream?.write(d.toString().replace(this.token, "[token]")));
    child.on("error", (err) => this.set("crashed", `Falha ao iniciar o engine: ${err.message}`));
    child.on("exit", (code) => {
      this.child = null;
      if (this.stopping) return;
      this.set("crashed", `O engine encerrou inesperadamente (código ${code}).`);
      this.scheduleRestart();
    });
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline && this.child === child) {
      if (await healthy(this.port)) {
        this.set("online", "Engine online");
        return;
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    if (this.child === child && this.status !== "online") this.set("offline", "O engine não respondeu a tempo. Veja logs/engine-process.log.");
  }

  private scheduleRestart(): void {
    const now = Date.now();
    this.restarts = this.restarts.filter((t) => now - t < 120_000);
    if (this.restarts.length >= 5) {
      this.set("offline", "O engine falhou repetidamente. Verifique logs/engine-process.log e rode setup.cmd.");
      return;
    }
    this.restarts.push(now);
    const delay = 1000 * 2 ** (this.restarts.length - 1);
    setTimeout(() => void this.start(), delay);
  }

  async restart(): Promise<void> {
    await this.stop();
    this.restarts = [];
    await this.start();
  }

  stop(): Promise<void> {
    this.stopping = true;
    const child = this.child;
    this.child = null;
    if (!child || child.pid === undefined) return Promise.resolve();
    return new Promise((resolve) => {
      child.once("exit", () => resolve());
      if (process.platform === "win32") {
        spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
      } else {
        child.kill("SIGTERM");
      }
      setTimeout(resolve, 4000);
    });
  }
}
