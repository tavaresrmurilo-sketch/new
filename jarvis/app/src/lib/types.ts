/** Wire types mirrored from the Python engine. */

export type JarvisState = "IDLE" | "LISTENING" | "THINKING" | "SPEAKING" | "EXECUTING" | "ERROR";
export type ConnState = "connecting" | "online" | "reconnecting" | "offline";

export interface Metrics {
  ts: number;
  cpu: { percent: number; perCore: number[]; count: number; freqMhz: number | null };
  memory: { percent: number; usedGb: number; totalGb: number; availableGb: number };
  swap: { percent: number; usedGb: number; totalGb: number };
  disk: { mount: string; percent: number | null; usedGb: number | null; totalGb: number | null; freeGb: number | null; readBps: number | null; writeBps: number | null };
  network: { upBps: number | null; downBps: number | null; totalSent: number; totalRecv: number; connected: boolean | null; interfaces: number | null };
  battery: { percent: number; plugged: boolean; secsLeft: number | null } | null;
  gpu: { name: string; percent: number | null; memoryUsedMb: number | null; memoryTotalMb: number | null; temperatureC: number | null; source: string } | null;
  temperatures: { cpuC: number | null; gpuC: number | null };
  uptimeS: number;
  processCount: number;
  activeWindow: { title: string; process: string; pid: number } | null;
}

export interface ProcessGroup {
  name: string;
  count: number;
  cpu: number;
  memoryMb: number;
  pids: number[];
}

export interface TaskStep {
  idx: number;
  title: string;
  toolId: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled" | "skipped";
  detail: string;
  startedAt: number | null;
  finishedAt: number | null;
}

export interface Task {
  id: string;
  title: string;
  source: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  progress: number;
  result: string;
  error: string;
  createdAt: number;
  updatedAt: number;
  steps: TaskStep[];
}

export interface PermissionRequest {
  id: string;
  toolId: string;
  level: number;
  levelLabel: string;
  summary: string;
  args: Record<string, unknown>;
  createdAt: number;
  taskId: string | null;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  kind: "info" | "warning" | "reminder" | string;
  ts: number;
  source: string;
  read: boolean;
}

export interface Settings {
  general: { user_name: string; assistant_name: string; language: "pt-BR" | "en-US"; onboarding_complete: boolean };
  voice: {
    enabled: boolean;
    input_device_id: string;
    output_device_id: string;
    wake_word_enabled: boolean;
    wake_word: string;
    wake_engine: "whisper" | "openwakeword";
    stt_engine: "faster-whisper" | "openai";
    stt_model: "tiny" | "base" | "small" | "medium" | "large-v3" | "large-v3-turbo";
    tts_engine: "piper" | "system" | "off";
    tts_voice: string;
    system_voice_name: string;
    tts_rate: number;
    follow_up_seconds: number;
    vad_threshold: number;
    noise_floor: number;
    barge_in: boolean;
    speak_responses: boolean;
  };
  ai: {
    provider: "ollama" | "openai" | "anthropic" | "gemini" | "none";
    model: string;
    vision_model: string;
    temperature: number;
    context_window: number;
    ollama_host: string;
    max_agent_steps: number;
  };
  privacy: {
    screen_capture_enabled: boolean;
    memory_enabled: boolean;
    history_enabled: boolean;
    history_retention_days: number;
    external_provider_consent: boolean;
  };
  system: {
    file_index_enabled: boolean;
    file_index_roots: string[];
    index_content: boolean;
    proactive_enabled: boolean;
    alerts: { ram_percent: number; cpu_percent: number; disk_free_gb: number; battery_percent: number };
    focus_close_apps: string[];
    computer_control_enabled: boolean;
  };
  appearance: { motion: "system" | "full" | "reduced"; hud_intensity: number; compact_mode: boolean; sounds_enabled: boolean };
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export interface VoiceStatus {
  enabled: boolean;
  stt: { available: boolean; detail: string; model?: string; downloaded?: boolean; downloading?: boolean; sizeMb?: number };
  tts: { available: boolean; detail: string; voice?: string; downloading?: boolean; local?: string[] };
  wake: { engine: string; enabled: boolean; word: string; available: boolean; detail: string };
  followUpUntil: number;
  sttModels: Record<string, number>;
  voices: { id: string; label: string; sizeMb: number }[];
  localVoices: string[];
  latency: Record<string, number>;
}

export interface ProviderStatus {
  provider: string;
  label: string;
  model: string;
  ok: boolean;
  detail: string;
  models: { name: string; size?: number; family?: string; parameters?: string }[];
  external: boolean;
  consent: boolean;
}

export interface IndexStatus {
  state: string;
  files: number;
  projects: number;
  roots: string[];
  lastRun: number | null;
  durationS: number | null;
  scannedDirs: number;
  scannedFiles: number;
  error: string;
}

export interface TerminalProcess {
  id: string;
  label: string;
  command: string;
  cwd: string;
  startedAt: number;
  status: "running" | "exited" | "killed" | "failed";
  exitCode: number | null;
  durationS: number;
  ports: number[];
  pid: number | null;
  longRunning: boolean;
  output?: string[];
}

export interface TranscriptEntry {
  id: string;
  role: "user" | "jarvis" | "system";
  text: string;
  ts: number;
  kind?: string;
  detail?: string;
  source?: string;
  streaming?: boolean;
  data?: Record<string, unknown>;
}

export interface ActivityEntry {
  id: number;
  ts: number;
  category: string;
  level: string;
  message: string;
  data: Record<string, unknown>;
}

export interface ToolEvent {
  key: string;
  tool: string;
  name: string;
  summary: string;
  status: "running" | "ok" | "failed";
  message?: string;
  durationMs?: number;
  ts: number;
  verified?: boolean | null;
}

export interface Snapshot {
  settings: Settings;
  context: ContextInfo;
  tasks: Task[];
  permissions: PermissionRequest[];
  notifications: NotificationItem[];
  metrics: Metrics | null;
  voice: VoiceStatus;
  index: IndexStatus;
  apps: number;
  state: JarvisState;
  focusMode: boolean;
  platform: string;
  dataDir: string;
  secrets: Record<string, boolean>;
  terminal: TerminalProcess[];
  history: { id: number; role: string; content: string; created_at: number; meta: Record<string, unknown> }[];
  processes?: ProcessGroup[];
}

export interface ContextInfo {
  entities: Record<string, { label: string; ts: number }>;
  currentTask: { id: string; title: string } | null;
  currentAction: string | null;
  nextSteps: string[];
  recentActions: { tool: string; summary: string; ok: boolean; ts: number }[];
  session: { startedAt: number; commands: number };
}

export interface Memory {
  id: number;
  category: string;
  content: string;
  source: string;
  tags: string;
  created_at: number;
  updated_at: number;
}

export interface Note {
  id: number;
  title: string;
  content: string;
  tags: string;
  created_at: number;
  updated_at: number;
  snippet?: string;
}

export interface Reminder {
  id: number;
  text: string;
  dueAt: number;
  recurrence: Record<string, unknown> | null;
  status: string;
  createdAt: number;
  lastFiredAt: number | null;
  when: string;
}

export interface ToolInfo {
  id: string;
  name: string;
  description: string;
  category: string;
  level: number;
  available: boolean;
  policy: "auto" | "ask" | "deny";
  override: string | null;
  calls: number;
  failures: number;
  lastUsedAt: number | null;
}

export interface InitCheck {
  module: string;
  status: "online" | "degraded" | "offline";
  detail: string;
}
