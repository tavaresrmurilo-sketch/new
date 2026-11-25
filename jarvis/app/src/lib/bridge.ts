/**
 * Access to the Electron preload bridge (window.jarvis). When the UI runs in a
 * plain browser (development, E2E tests, a future web panel) a web fallback is
 * used: the engine URL/token come from the page URL, notifications use the Web
 * Notifications API, capture uses getDisplayMedia (user picks the screen).
 */

export interface BackendInfo {
  status: "starting" | "online" | "offline" | "crashed" | "missing";
  url: string;
  token: string;
  detail: string;
}

export type PrefsPatch = Omit<Partial<DesktopPrefs>, "shortcuts"> & { shortcuts?: Partial<DesktopPrefs["shortcuts"]> };

export interface DesktopPrefs {
  shortcuts: { palette: string; toggle: string; listen: string };
  mode: "full" | "mini" | "background" | "voice";
  startWithWindows: boolean;
  micMuted: boolean;
  wakePaused: boolean;
  closeToTray: boolean;
}

type Unsub = () => void;

export interface Bridge {
  isDesktop: boolean;
  platform: string;
  backend: { get(): Promise<BackendInfo>; restart(): Promise<BackendInfo>; onStatus(cb: (i: BackendInfo) => void): Unsub };
  app: { info(): Promise<{ version: string; platform: string; packaged: boolean }>; quit(): void };
  window: {
    minimize(): void;
    toggleMaximize(): void;
    close(): void;
    showMain(): void;
    setMode(mode: DesktopPrefs["mode"]): Promise<string>;
    onMode(cb: (m: DesktopPrefs["mode"]) => void): Unsub;
    onState(cb: (s: { maximized: boolean }) => void): Unsub;
  };
  prefs: {
    get(): Promise<{ prefs: DesktopPrefs; shortcutErrors: Record<string, string> }>;
    set(patch: PrefsPatch): Promise<{ prefs: DesktopPrefs; shortcutErrors: Record<string, string> }>;
    onChange(cb: (p: DesktopPrefs) => void): Unsub;
  };
  capture: { grab(opts?: { maxWidth?: number }): Promise<{ dataUrl: string; width: number; height: number; sourceName: string }> };
  clipboard: { read(): Promise<string>; write(text: string): Promise<boolean> };
  notify(title: string, body: string): Promise<boolean>;
  audio: { report(state: { micMuted?: boolean; wakePaused?: boolean; listening?: boolean }): void; onState(cb: (s: { micMuted: boolean; wakePaused: boolean; listening: boolean }) => void): Unsub };
  tray: { onAction(cb: (a: { type: string; value?: boolean }) => void): Unsub };
  palette: { hide(): void; resize(height: number): void; onShown(cb: () => void): Unsub };
}

declare global {
  interface Window {
    jarvis?: Bridge;
  }
}

const noop: Unsub = () => undefined;
const PREFS_KEY = "jarvis.webprefs";

function webPrefs(): DesktopPrefs {
  const base: DesktopPrefs = {
    shortcuts: { palette: "", toggle: "", listen: "" },
    mode: "full",
    startWithWindows: false,
    micMuted: false,
    wakePaused: false,
    closeToTray: false,
  };
  try {
    return { ...base, ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") };
  } catch {
    return base;
  }
}

function webBridge(): Bridge {
  const params = new URLSearchParams(window.location.search);
  const url = params.get("engine") || "ws://127.0.0.1:8765/ws";
  const token = params.get("token") || "";
  const info: BackendInfo = { status: token ? "online" : "missing", url, token, detail: token ? "" : "Abra pelo aplicativo desktop (token ausente)." };
  return {
    isDesktop: false,
    platform: "web",
    backend: { get: async () => info, restart: async () => info, onStatus: () => noop },
    app: { info: async () => ({ version: "web", platform: "web", packaged: false }), quit: () => window.close() },
    window: {
      minimize: () => undefined,
      toggleMaximize: () => {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen?.();
      },
      close: () => window.close(),
      showMain: () => undefined,
      setMode: async (m) => m,
      onMode: () => noop,
      onState: () => noop,
    },
    prefs: {
      get: async () => ({ prefs: webPrefs(), shortcutErrors: {} }),
      set: async (patch) => {
        const next = { ...webPrefs(), ...patch, shortcuts: { ...webPrefs().shortcuts, ...(patch.shortcuts ?? {}) } } as DesktopPrefs;
        try {
          localStorage.setItem(PREFS_KEY, JSON.stringify(next));
        } catch {
          /* private mode: keep in memory only */
        }
        return { prefs: next, shortcutErrors: {} };
      },
      onChange: () => noop,
    },
    capture: {
      grab: async (opts) => {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        try {
          const track = stream.getVideoTracks()[0];
          const video = document.createElement("video");
          video.srcObject = stream;
          await video.play();
          const maxW = opts?.maxWidth ?? 1600;
          const scale = Math.min(1, maxW / video.videoWidth);
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(video.videoWidth * scale);
          canvas.height = Math.round(video.videoHeight * scale);
          canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
          return { dataUrl: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height, sourceName: track.label };
        } finally {
          stream.getTracks().forEach((t) => t.stop());
        }
      },
    },
    clipboard: {
      read: () => navigator.clipboard.readText(),
      write: async (t) => {
        await navigator.clipboard.writeText(t);
        return true;
      },
    },
    notify: async (title, body) => {
      if (!("Notification" in window)) return false;
      if (Notification.permission === "default") await Notification.requestPermission();
      if (Notification.permission !== "granted") return false;
      new Notification(title, { body });
      return true;
    },
    audio: { report: () => undefined, onState: () => noop },
    tray: { onAction: () => noop },
    palette: { hide: () => undefined, resize: () => undefined, onShown: () => noop },
  };
}

let cached: Bridge | null = null;

export function bridge(): Bridge {
  if (!cached) cached = window.jarvis ?? webBridge();
  return cached;
}
