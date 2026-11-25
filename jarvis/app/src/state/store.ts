import { create } from "zustand";
import type { BackendInfo } from "../lib/bridge";
import type {
  ActivityEntry,
  ConnState,
  ContextInfo,
  IndexStatus,
  JarvisState,
  Metrics,
  NotificationItem,
  PermissionRequest,
  ProcessGroup,
  ProviderStatus,
  Settings,
  Snapshot,
  Task,
  TerminalProcess,
  ToolEvent,
  TranscriptEntry,
  VoiceStatus,
} from "../lib/types";

export type ModuleId = "memory" | "notes" | "reminders" | "tasks" | "terminal" | "activity" | "privacy" | "settings";

export const LEFT_MODULES: ModuleId[] = ["memory", "notes", "reminders", "tasks"];
export const RIGHT_MODULES: ModuleId[] = ["terminal", "activity", "privacy", "settings"];

const HISTORY = 90;

export interface AudioState {
  ready: boolean;
  micError: string;
  capturing: boolean;
  transcribing: boolean;
  speaking: boolean;
  micMuted: boolean;
  wakePaused: boolean;
  followUpUntil: number;
  inputLabel: string;
}

export interface Toast {
  id: string;
  kind: "info" | "warning" | "error" | "success";
  title: string;
  body?: string;
  detail?: string;
}

interface Store {
  conn: ConnState;
  backend: BackendInfo | null;
  serverState: JarvisState;
  stateDetail: string;
  audio: AudioState;
  settings: Settings | null;
  voice: VoiceStatus | null;
  provider: ProviderStatus | null;
  index: IndexStatus | null;
  metrics: Metrics | null;
  history: { cpu: number[]; ram: number[]; down: number[]; up: number[] };
  processes: ProcessGroup[];
  context: ContextInfo | null;
  tasks: Record<string, Task>;
  transcript: TranscriptEntry[];
  tools: ToolEvent[];
  permissions: PermissionRequest[];
  notifications: NotificationItem[];
  terminal: Record<string, TerminalProcess>;
  terminalOutput: Record<string, string[]>;
  activity: ActivityEntry[];
  capturingScreen: boolean;
  externalAt: number | null;
  externalProvider: string;
  focusMode: boolean;
  secrets: Record<string, boolean>;
  dataDir: string;
  platform: string;
  revisions: { memory: number; notes: number; reminders: number };
  module: ModuleId | null;
  toasts: Toast[];
  initRequested: boolean;

  setConn(c: ConnState): void;
  setBackend(b: BackendInfo): void;
  setAudio(patch: Partial<AudioState>): void;
  applySnapshot(s: Snapshot): void;
  handleEvent(name: string, data: any): void;
  openModule(m: ModuleId | null): void;
  toast(t: Omit<Toast, "id">): void;
  dismissToast(id: string): void;
  setSettings(s: Settings): void;
  setVoice(v: VoiceStatus): void;
  setProvider(p: ProviderStatus): void;
  setTerminalOutput(id: string, lines: string[]): void;
  requestInit(v: boolean): void;
}

let toastSeq = 0;
let entrySeq = 0;
const eid = () => `e${Date.now().toString(36)}${(entrySeq++).toString(36)}`;

function push<T>(arr: T[], v: T, max: number): T[] {
  const next = arr.length >= max ? arr.slice(arr.length - max + 1) : arr.slice();
  next.push(v);
  return next;
}

export const useStore = create<Store>((set, get) => ({
  conn: "connecting",
  backend: null,
  serverState: "IDLE",
  stateDetail: "",
  audio: { ready: false, micError: "", capturing: false, transcribing: false, speaking: false, micMuted: false, wakePaused: false, followUpUntil: 0, inputLabel: "" },
  settings: null,
  voice: null,
  provider: null,
  index: null,
  metrics: null,
  history: { cpu: [], ram: [], down: [], up: [] },
  processes: [],
  context: null,
  tasks: {},
  transcript: [],
  tools: [],
  permissions: [],
  notifications: [],
  terminal: {},
  terminalOutput: {},
  activity: [],
  capturingScreen: false,
  externalAt: null,
  externalProvider: "",
  focusMode: false,
  secrets: {},
  dataDir: "",
  platform: "",
  revisions: { memory: 0, notes: 0, reminders: 0 },
  module: null,
  toasts: [],
  initRequested: false,

  setConn: (conn) => set({ conn }),
  setBackend: (backend) => set({ backend }),
  setAudio: (patch) => set((s) => ({ audio: { ...s.audio, ...patch } })),
  setSettings: (settings) => set({ settings }),
  setVoice: (voice) => set({ voice }),
  setProvider: (provider) => set({ provider }),
  setTerminalOutput: (id, lines) => set((s) => ({ terminalOutput: { ...s.terminalOutput, [id]: lines.slice(-2000) } })),
  openModule: (module) => set({ module }),
  requestInit: (initRequested) => set({ initRequested }),
  toast: (t) => {
    const id = `t${++toastSeq}`;
    set((s) => ({ toasts: push(s.toasts, { ...t, id }, 4) }));
    window.setTimeout(() => get().dismissToast(id), t.kind === "error" ? 9000 : 5000);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  applySnapshot: (snap) => {
    const tasks: Record<string, Task> = {};
    for (const t of snap.tasks) tasks[t.id] = t;
    const terminal: Record<string, TerminalProcess> = {};
    for (const p of snap.terminal) terminal[p.id] = p;
    const transcript: TranscriptEntry[] = snap.history.slice(-12).map((m) => ({
      id: `h${m.id}`,
      role: m.role === "user" ? "user" : "jarvis",
      text: m.content,
      ts: m.created_at,
      kind: (m.meta?.kind as string) || undefined,
    }));
    set((s) => ({
      settings: snap.settings,
      context: snap.context,
      tasks,
      permissions: snap.permissions,
      notifications: snap.notifications,
      metrics: snap.metrics ?? s.metrics,
      voice: snap.voice,
      index: snap.index,
      serverState: snap.state,
      focusMode: snap.focusMode,
      secrets: snap.secrets,
      dataDir: snap.dataDir,
      platform: snap.platform,
      terminal,
      transcript: s.transcript.length ? s.transcript : transcript,
      processes: snap.processes ?? s.processes,
    }));
  },

  handleEvent: (name, data) => {
    const s = get();
    switch (name) {
      case "system.metrics": {
        const m = data as Metrics;
        set({
          metrics: m,
          history: {
            cpu: push(s.history.cpu, m.cpu.percent, HISTORY),
            ram: push(s.history.ram, m.memory.percent, HISTORY),
            down: push(s.history.down, m.network.downBps ?? 0, HISTORY),
            up: push(s.history.up, m.network.upBps ?? 0, HISTORY),
          },
        });
        break;
      }
      case "system.processes":
        set({ processes: data.top });
        break;
      case "jarvis.state":
        set({ serverState: data.state, stateDetail: data.detail || "" });
        break;
      case "command.received":
        set({ transcript: push(s.transcript, { id: eid(), role: "user", text: data.text, ts: data.ts, source: data.source }, 60) });
        break;
      case "ai.delta": {
        const last = s.transcript[s.transcript.length - 1];
        if (last && last.role === "jarvis" && last.streaming) {
          const updated = { ...last, text: last.text + data.text };
          set({ transcript: [...s.transcript.slice(0, -1), updated] });
        } else {
          set({ transcript: push(s.transcript, { id: eid(), role: "jarvis", text: data.text, ts: Date.now() / 1000, streaming: true }, 60) });
        }
        break;
      }
      case "ai.response": {
        const last = s.transcript[s.transcript.length - 1];
        const entry: TranscriptEntry = { id: eid(), role: "jarvis", text: data.text, ts: data.ts, kind: data.kind, detail: data.detail, data: data.data };
        if (last && last.role === "jarvis" && last.streaming) {
          set({ transcript: [...s.transcript.slice(0, -1), { ...entry, id: last.id }] });
        } else {
          set({ transcript: push(s.transcript, entry, 60) });
        }
        break;
      }
      case "tool.started":
        set({ tools: push(s.tools, { key: `${data.tool}-${Date.now()}`, tool: data.tool, name: data.name, summary: data.summary, status: "running", ts: Date.now() }, 40) });
        break;
      case "tool.completed":
      case "tool.failed": {
        const idx = [...s.tools].reverse().findIndex((t) => t.tool === data.tool && t.status === "running");
        const status = name === "tool.completed" ? "ok" : "failed";
        if (idx >= 0) {
          const real = s.tools.length - 1 - idx;
          const updated = s.tools.slice();
          updated[real] = { ...updated[real], status, message: data.message, durationMs: data.durationMs, verified: data.verified };
          set({ tools: updated });
        } else {
          set({ tools: push(s.tools, { key: `${data.tool}-${Date.now()}`, tool: data.tool, name: data.name, summary: data.summary, status, message: data.message, ts: Date.now(), durationMs: data.durationMs }, 40) });
        }
        break;
      }
      case "task.created":
      case "task.updated":
        set({ tasks: { ...s.tasks, [data.id]: data } });
        break;
      case "permission.request":
        set({ permissions: [...s.permissions.filter((p) => p.id !== data.id), data] });
        break;
      case "permission.resolved":
        set({ permissions: s.permissions.filter((p) => p.id !== data.id) });
        break;
      case "notification":
        set({ notifications: [data, ...s.notifications].slice(0, 100) });
        break;
      case "settings.updated":
        set({ settings: data.settings });
        break;
      case "voice.processing":
        set({ audio: { ...s.audio, transcribing: true } });
        break;
      case "voice.transcript":
      case "voice.ignored":
      case "voice.error":
        set({ audio: { ...s.audio, transcribing: false } });
        if (name === "voice.error") s.toast({ kind: "error", title: "Voz", body: data.message });
        break;
      case "voice.listening":
        set({ audio: { ...s.audio, followUpUntil: data.active ? data.until * 1000 : 0 } });
        break;
      case "files.index":
        set({ index: data });
        break;
      case "terminal.started":
      case "terminal.exited":
        set({ terminal: { ...s.terminal, [data.id]: data } });
        break;
      case "terminal.output": {
        const prev = s.terminalOutput[data.id] ?? [];
        set({ terminalOutput: { ...s.terminalOutput, [data.id]: [...prev, ...data.lines].slice(-2000) } });
        break;
      }
      case "terminal.port": {
        const p = s.terminal[data.id];
        if (p) set({ terminal: { ...s.terminal, [data.id]: { ...p, ports: [...new Set([...p.ports, data.port])] } } });
        break;
      }
      case "activity.log":
        set({ activity: [data, ...s.activity].slice(0, 300) });
        break;
      case "memory.updated":
        set({ revisions: { ...s.revisions, memory: s.revisions.memory + 1 } });
        break;
      case "notes.updated":
        set({ revisions: { ...s.revisions, notes: s.revisions.notes + 1 } });
        break;
      case "reminders.updated":
        set({ revisions: { ...s.revisions, reminders: s.revisions.reminders + 1 } });
        break;
      case "privacy.capture":
        set({ capturingScreen: Boolean(data.active) });
        break;
      case "privacy.external":
        set({ externalAt: Date.now(), externalProvider: data.provider });
        break;
      case "focus.changed":
        set({ focusMode: Boolean(data.enabled) });
        break;
      case "ai.provider":
        set({ provider: data });
        break;
      case "context.updated":
        set({ context: data });
        break;
      case "ui.action":
        if (typeof data.action === "string" && data.action.startsWith("open:")) {
          const m = data.action.slice(5) as ModuleId;
          set({ module: m });
        }
        break;
      default:
        break;
    }
  },
}));

export function displayState(s: Pick<Store, "audio" | "serverState">): JarvisState {
  if (s.audio.speaking) return "SPEAKING";
  if (s.audio.capturing) return "LISTENING";
  if (s.serverState === "EXECUTING" || s.serverState === "THINKING" || s.serverState === "ERROR") return s.serverState;
  if (s.audio.transcribing) return "THINKING";
  if (s.audio.followUpUntil > Date.now()) return "LISTENING";
  return "IDLE";
}

export const STATE_LABEL: Record<JarvisState, string> = {
  IDLE: "Em espera",
  LISTENING: "Ouvindo",
  THINKING: "Processando",
  SPEAKING: "Falando",
  EXECUTING: "Executando",
  ERROR: "Atenção",
};
