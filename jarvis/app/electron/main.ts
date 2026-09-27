/**
 * Electron main process: windows (HUD, mini widget, command palette), tray,
 * global shortcuts, secure IPC and supervision of the Python engine.
 */
import {
  app,
  BrowserWindow,
  clipboard,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  IpcMainEvent,
  IpcMainInvokeEvent,
  Menu,
  nativeImage,
  Notification,
  screen,
  session,
  Tray,
} from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EngineProcess } from "./backend";
import { DesktopPrefs, loadPrefs, sanitize, savePrefs, WindowMode } from "./prefs";

const DEV_SERVER = process.env.JARVIS_DEV_SERVER || "";
const START_HIDDEN = process.argv.includes("--background");

let mainWin: BrowserWindow | null = null;
let miniWin: BrowserWindow | null = null;
let paletteWin: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let prefs: DesktopPrefs = loadPrefs();
let audioState = { micMuted: prefs.micMuted, wakePaused: prefs.wakePaused, listening: false };
const engine = new EngineProcess();

// ------------------------------------------------------------------ assets
function asset(name: string): string {
  return app.isPackaged ? path.join(process.resourcesPath, "assets", name) : path.join(app.getAppPath(), "assets", name);
}

function rendererUrl(route: string): { url?: string; file?: string; hash: string } {
  if (DEV_SERVER) return { url: `${DEV_SERVER}/#/${route}`, hash: route };
  return { file: path.join(app.getAppPath(), "dist", "index.html"), hash: `/${route}` };
}

function load(win: BrowserWindow, route: string): void {
  const target = rendererUrl(route);
  if (target.url) void win.loadURL(target.url);
  else void win.loadFile(target.file!, { hash: target.hash });
}

/** Only the app's own page (any hash route) may navigate, use IPC or get permissions. */
function isAppUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (DEV_SERVER) return u.origin === new URL(DEV_SERVER).origin;
    if (u.protocol !== "file:") return false;
    const same = (a: string, b: string) => (process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b);
    return same(path.resolve(fileURLToPath(u)), path.resolve(rendererUrl("").file!));
  } catch {
    return false;
  }
}

function trusted(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  return isAppUrl(event.senderFrame?.url ?? "");
}

function secureWebContents(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e, url) => {
    if (!isAppUrl(url)) e.preventDefault();
  });
}

const webPreferences = (): Electron.WebPreferences => ({
  preload: path.join(__dirname, "preload.cjs"),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true,
  spellcheck: false,
  backgroundThrottling: false, // the voice pipeline keeps running while hidden
});

// ----------------------------------------------------------------- windows
function createMain(): BrowserWindow {
  const b = prefs.bounds;
  const win = new BrowserWindow({
    width: b?.width ?? 1440,
    height: b?.height ?? 900,
    x: b?.x,
    y: b?.y,
    minWidth: 900,
    minHeight: 560,
    frame: false,
    show: false,
    backgroundColor: "#03070B",
    title: "J.A.R.V.I.S.",
    icon: asset("icon.png"),
    webPreferences: webPreferences(),
  });
  secureWebContents(win);
  load(win, "hud");
  win.once("ready-to-show", () => {
    if (!START_HIDDEN && prefs.mode === "full") win.show();
  });
  win.on("close", (e) => {
    if (!quitting && prefs.closeToTray) {
      e.preventDefault();
      win.hide();
    }
  });
  const saveBounds = () => {
    if (!win.isMaximized() && !win.isMinimized()) {
      prefs.bounds = win.getBounds();
      savePrefs(prefs);
    }
  };
  win.on("resized", saveBounds);
  win.on("moved", saveBounds);
  win.on("maximize", () => win.webContents.send("window:state", { maximized: true }));
  win.on("unmaximize", () => win.webContents.send("window:state", { maximized: false }));
  return win;
}

function createMini(): BrowserWindow {
  const area = screen.getPrimaryDisplay().workArea;
  const win = new BrowserWindow({
    width: 300,
    height: 340,
    x: area.x + area.width - 320,
    y: area.y + area.height - 360,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: "#00000000",
    webPreferences: webPreferences(),
  });
  secureWebContents(win);
  load(win, "mini");
  return win;
}

function createPalette(): BrowserWindow {
  const area = screen.getPrimaryDisplay().workArea;
  const width = 680;
  const win = new BrowserWindow({
    width,
    height: 420,
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + area.height * 0.18),
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: "#00000000",
    webPreferences: webPreferences(),
  });
  secureWebContents(win);
  load(win, "palette");
  win.on("blur", () => win.hide());
  return win;
}

function showMain(): void {
  if (!mainWin) mainWin = createMain();
  if (prefs.mode !== "full") setMode("full");
  mainWin.show();
  if (mainWin.isMinimized()) mainWin.restore();
  mainWin.focus();
}

function togglePalette(): void {
  if (!paletteWin) paletteWin = createPalette();
  if (paletteWin.isVisible()) {
    paletteWin.hide();
    return;
  }
  const cursor = screen.getCursorScreenPoint();
  const area = screen.getDisplayNearestPoint(cursor).workArea;
  const [w] = paletteWin.getSize();
  paletteWin.setPosition(Math.round(area.x + (area.width - w) / 2), Math.round(area.y + area.height * 0.18));
  paletteWin.show();
  paletteWin.focus();
  paletteWin.webContents.send("palette:shown");
}

function setMode(mode: WindowMode): void {
  prefs.mode = mode;
  savePrefs(prefs);
  if (!mainWin) mainWin = createMain();
  if (mode === "full") {
    miniWin?.hide();
    mainWin.show();
  } else if (mode === "mini") {
    mainWin.hide();
    if (!miniWin) miniWin = createMini();
    miniWin.once("ready-to-show", () => miniWin?.showInactive());
    miniWin.showInactive();
  } else {
    mainWin.hide();
    miniWin?.hide();
  }
  broadcast("mode:changed", mode);
  if (mode === "voice") mainWin.webContents.send("tray:action", { type: "voice-mode" });
  rebuildTray();
}

function broadcast(channel: string, payload: unknown): void {
  for (const w of [mainWin, miniWin, paletteWin]) {
    if (w && !w.isDestroyed()) w.webContents.send(channel, payload);
  }
}

// -------------------------------------------------------------------- tray
function trayImage(): Electron.NativeImage {
  const img = nativeImage.createFromPath(asset(process.platform === "win32" ? "tray.ico" : "tray.png"));
  return img.isEmpty() ? nativeImage.createFromPath(asset("icon.png")).resize({ width: 16, height: 16 }) : img;
}

function rebuildTray(): void {
  if (!tray) {
    tray = new Tray(trayImage());
    tray.setToolTip("J.A.R.V.I.S.");
    tray.on("click", () => showMain());
  }
  const modeItem = (label: string, mode: WindowMode): Electron.MenuItemConstructorOptions => ({
    label,
    type: "radio",
    checked: prefs.mode === mode,
    click: () => setMode(mode),
  });
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Abrir Jarvis", click: () => showMain() },
      { type: "separator" },
      {
        label: "Silenciar microfone",
        type: "checkbox",
        checked: audioState.micMuted,
        click: (item) => sendTray({ type: "mute-mic", value: item.checked }),
      },
      {
        label: "Pausar palavra de ativação",
        type: "checkbox",
        checked: audioState.wakePaused,
        click: (item) => sendTray({ type: "pause-wake", value: item.checked }),
      },
      {
        label: "Modo",
        submenu: [
          modeItem("HUD completo", "full"),
          modeItem("Mini widget", "mini"),
          modeItem("Segundo plano", "background"),
          modeItem("Somente voz", "voice"),
        ],
      },
      {
        label: "Configurações",
        click: () => {
          showMain();
          sendTray({ type: "open-settings" });
        },
      },
      { type: "separator" },
      { label: "Sair", click: () => quit() },
    ]),
  );
}

function sendTray(action: Record<string, unknown>): void {
  if (!mainWin) mainWin = createMain();
  mainWin.webContents.send("tray:action", action);
}

// --------------------------------------------------------------- shortcuts
function registerShortcuts(): Record<string, string> {
  globalShortcut.unregisterAll();
  const errors: Record<string, string> = {};
  const bind = (name: keyof DesktopPrefs["shortcuts"], fn: () => void) => {
    const accel = prefs.shortcuts[name];
    if (!accel) return;
    try {
      if (!globalShortcut.register(accel, fn)) errors[name] = `O atalho ${accel} já está em uso por outro aplicativo.`;
    } catch {
      errors[name] = `Atalho inválido: ${accel}`;
    }
  };
  bind("palette", togglePalette);
  bind("toggle", () => (mainWin?.isVisible() && mainWin.isFocused() ? mainWin.hide() : showMain()));
  bind("listen", () => sendTray({ type: "listen" }));
  return errors;
}

function applyLoginItem(): void {
  if (process.platform !== "win32" && process.platform !== "darwin") return;
  app.setLoginItemSettings({ openAtLogin: prefs.startWithWindows, args: ["--background"] });
}

// --------------------------------------------------------------------- IPC
function registerIpc(): void {
  const handle = (channel: string, fn: (e: IpcMainInvokeEvent, ...args: any[]) => unknown) =>
    ipcMain.handle(channel, (e, ...args) => {
      if (!trusted(e)) throw new Error("untrusted sender");
      return fn(e, ...args);
    });
  const on = (channel: string, fn: (e: IpcMainEvent, ...args: any[]) => void) =>
    ipcMain.on(channel, (e, ...args) => {
      if (trusted(e)) fn(e, ...args);
    });

  handle("backend:get", () => engine.info);
  handle("backend:restart", async () => {
    await engine.restart();
    return engine.info;
  });
  handle("app:info", () => ({ version: app.getVersion(), platform: process.platform, packaged: app.isPackaged }));
  on("win:minimize", (e) => BrowserWindow.fromWebContents(e.sender)?.minimize());
  on("win:toggle-maximize", (e) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    if (w) (w.isMaximized() ? w.unmaximize() : w.maximize());
  });
  on("win:close", (e) => BrowserWindow.fromWebContents(e.sender)?.close());
  on("win:show-main", () => showMain());
  handle("win:set-mode", (_e, mode: unknown) => {
    if (typeof mode === "string" && ["full", "mini", "background", "voice"].includes(mode)) setMode(mode as WindowMode);
    return prefs.mode;
  });
  handle("prefs:get", () => ({ prefs, shortcutErrors: registerShortcutsSafe() }));
  handle("prefs:set", (_e, patch: unknown) => {
    const before = prefs;
    prefs = sanitize({ ...prefs, ...(patch as object), shortcuts: { ...prefs.shortcuts, ...((patch as any)?.shortcuts ?? {}) } }, prefs);
    const errors = registerShortcuts();
    for (const key of Object.keys(errors) as Array<keyof DesktopPrefs["shortcuts"]>) prefs.shortcuts[key] = before.shortcuts[key];
    if (Object.keys(errors).length) registerShortcuts();
    savePrefs(prefs);
    applyLoginItem();
    broadcast("prefs:changed", prefs);
    return { prefs, shortcutErrors: errors };
  });
  handle("capture:grab", async (_e, opts: unknown) => captureScreen(opts));
  handle("clipboard:read", () => clipboard.readText());
  handle("clipboard:write", (_e, text: unknown) => {
    if (typeof text !== "string" || text.length > 100_000) throw new Error("invalid text");
    clipboard.writeText(text);
    return true;
  });
  handle("notify", (_e, payload: unknown) => {
    const p = (payload ?? {}) as { title?: unknown; body?: unknown };
    if (!Notification.isSupported()) return false;
    const n = new Notification({ title: String(p.title ?? "Jarvis").slice(0, 120), body: String(p.body ?? "").slice(0, 500), icon: asset("icon.png"), silent: false });
    n.on("click", () => showMain());
    n.show();
    return true;
  });
  on("audio:state", (_e, state: unknown) => {
    const s = (state ?? {}) as Partial<typeof audioState>;
    audioState = {
      micMuted: typeof s.micMuted === "boolean" ? s.micMuted : audioState.micMuted,
      wakePaused: typeof s.wakePaused === "boolean" ? s.wakePaused : audioState.wakePaused,
      listening: typeof s.listening === "boolean" ? s.listening : audioState.listening,
    };
    prefs.micMuted = audioState.micMuted;
    prefs.wakePaused = audioState.wakePaused;
    savePrefs(prefs);
    rebuildTray();
    broadcast("audio:state", audioState);
  });
  on("palette:hide", () => paletteWin?.hide());
  on("palette:resize", (_e, height: unknown) => {
    if (paletteWin && typeof height === "number" && height >= 80 && height <= 640) {
      const [w] = paletteWin.getSize();
      paletteWin.setSize(w, Math.round(height));
    }
  });
  on("app:quit", () => quit());
}

function registerShortcutsSafe(): Record<string, string> {
  try {
    return registerShortcuts();
  } catch {
    return {};
  }
}

async function captureScreen(opts: unknown): Promise<{ dataUrl: string; width: number; height: number; sourceName: string }> {
  const maxWidth = Math.min(3840, Math.max(640, Number((opts as { maxWidth?: number })?.maxWidth) || 1600));
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const hideSelf = mainWin?.isVisible() && mainWin.isFocused();
  if (hideSelf) {
    mainWin!.hide();
    await new Promise((r) => setTimeout(r, 280));
  }
  try {
    const scale = display.scaleFactor || 1;
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: Math.round(display.size.width * scale), height: Math.round(display.size.height * scale) },
    });
    const src = sources.find((s) => s.display_id === String(display.id)) ?? sources[0];
    if (!src) throw new Error("Nenhuma tela disponível para captura.");
    let img = src.thumbnail;
    if (img.getSize().width > maxWidth) img = img.resize({ width: maxWidth, quality: "good" });
    const size = img.getSize();
    return { dataUrl: img.toDataURL(), width: size.width, height: size.height, sourceName: src.name };
  } finally {
    if (hideSelf) mainWin?.showInactive();
  }
}

// --------------------------------------------------------------- lifecycle
async function quit(): Promise<void> {
  quitting = true;
  globalShortcut.unregisterAll();
  await engine.stop();
  app.quit();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => showMain());
  app.whenReady().then(async () => {
    app.setAppUserModelId("com.jarvis.desktop");
    const ses = session.defaultSession;
    ses.setPermissionRequestHandler((wc, permission, cb, details) => {
      const media = permission === "media" && (details as { mediaTypes?: string[] }).mediaTypes?.every((t) => t === "audio");
      const allowed = Boolean(media) || permission === "notifications" || permission === "clipboard-sanitized-write";
      cb(allowed && isAppUrl(wc.getURL()));
    });
    ses.setPermissionCheckHandler((wc, permission) =>
      ["media", "notifications", "clipboard-sanitized-write"].includes(permission) && isAppUrl(wc?.getURL() ?? ""));
    Menu.setApplicationMenu(null);
    engine.on("status", (info) => broadcast("backend:status", info));
    registerIpc();
    mainWin = createMain();
    rebuildTray();
    registerShortcutsSafe();
    applyLoginItem();
    if (prefs.mode === "mini" && !START_HIDDEN) setMode("mini");
    void engine.start();
  });
  app.on("before-quit", () => {
    quitting = true;
  });
  app.on("will-quit", () => {
    globalShortcut.unregisterAll();
    void engine.stop();
  });
  app.on("window-all-closed", () => {
    /* keep running in the tray */
  });
}
