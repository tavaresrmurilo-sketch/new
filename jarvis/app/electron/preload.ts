/**
 * The only bridge between the sandboxed renderer and the shell. Exposes a
 * minimal, typed API; no Node.js primitives reach the page.
 */
import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";

type Listener = (payload: any) => void;

function subscribe(channel: string, cb: Listener): () => void {
  const wrapped = (_e: IpcRendererEvent, payload: unknown) => cb(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

const api = {
  isDesktop: true,
  platform: process.platform,
  backend: {
    get: () => ipcRenderer.invoke("backend:get"),
    restart: () => ipcRenderer.invoke("backend:restart"),
    onStatus: (cb: Listener) => subscribe("backend:status", cb),
  },
  app: {
    info: () => ipcRenderer.invoke("app:info"),
    quit: () => ipcRenderer.send("app:quit"),
  },
  window: {
    minimize: () => ipcRenderer.send("win:minimize"),
    toggleMaximize: () => ipcRenderer.send("win:toggle-maximize"),
    close: () => ipcRenderer.send("win:close"),
    showMain: () => ipcRenderer.send("win:show-main"),
    setMode: (mode: string) => ipcRenderer.invoke("win:set-mode", mode),
    onMode: (cb: Listener) => subscribe("mode:changed", cb),
    onState: (cb: Listener) => subscribe("window:state", cb),
  },
  prefs: {
    get: () => ipcRenderer.invoke("prefs:get"),
    set: (patch: unknown) => ipcRenderer.invoke("prefs:set", patch),
    onChange: (cb: Listener) => subscribe("prefs:changed", cb),
  },
  capture: {
    grab: (opts?: { maxWidth?: number }) => ipcRenderer.invoke("capture:grab", opts ?? {}),
  },
  clipboard: {
    read: () => ipcRenderer.invoke("clipboard:read"),
    write: (text: string) => ipcRenderer.invoke("clipboard:write", text),
  },
  notify: (title: string, body: string) => ipcRenderer.invoke("notify", { title, body }),
  audio: {
    report: (state: { micMuted?: boolean; wakePaused?: boolean; listening?: boolean }) => ipcRenderer.send("audio:state", state),
    onState: (cb: Listener) => subscribe("audio:state", cb),
  },
  tray: {
    onAction: (cb: Listener) => subscribe("tray:action", cb),
  },
  palette: {
    hide: () => ipcRenderer.send("palette:hide"),
    resize: (height: number) => ipcRenderer.send("palette:resize", height),
    onShown: (cb: Listener) => subscribe("palette:shown", cb),
  },
};

contextBridge.exposeInMainWorld("jarvis", api);

export type JarvisBridge = typeof api;
