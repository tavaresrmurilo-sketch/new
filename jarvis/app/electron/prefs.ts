/**
 * Desktop-only preferences (shortcuts, window mode, start with Windows...).
 * Stored as JSON in userData because the shell needs them before the engine is up.
 */
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

export type WindowMode = "full" | "mini" | "background" | "voice";

export interface DesktopPrefs {
  shortcuts: { palette: string; toggle: string; listen: string };
  mode: WindowMode;
  startWithWindows: boolean;
  micMuted: boolean;
  wakePaused: boolean;
  closeToTray: boolean;
  bounds?: { x: number; y: number; width: number; height: number };
}

export const DEFAULT_PREFS: DesktopPrefs = {
  shortcuts: { palette: "CommandOrControl+Space", toggle: "CommandOrControl+Shift+J", listen: "CommandOrControl+Shift+Space" },
  mode: "full",
  startWithWindows: false,
  micMuted: false,
  wakePaused: false,
  closeToTray: true,
};

const MODES: WindowMode[] = ["full", "mini", "background", "voice"];
const ACCEL = /^[A-Za-z0-9+ ]{1,60}$/;

function file(): string {
  return path.join(app.getPath("userData"), "desktop.json");
}

export function sanitize(input: unknown, base: DesktopPrefs = DEFAULT_PREFS): DesktopPrefs {
  const raw = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const out: DesktopPrefs = { ...base, shortcuts: { ...base.shortcuts } };
  const sc = raw.shortcuts as Record<string, unknown> | undefined;
  if (sc && typeof sc === "object") {
    for (const key of ["palette", "toggle", "listen"] as const) {
      const v = sc[key];
      if (typeof v === "string" && (v === "" || ACCEL.test(v))) out.shortcuts[key] = v;
    }
  }
  if (typeof raw.mode === "string" && MODES.includes(raw.mode as WindowMode)) out.mode = raw.mode as WindowMode;
  for (const key of ["startWithWindows", "micMuted", "wakePaused", "closeToTray"] as const) {
    if (typeof raw[key] === "boolean") out[key] = raw[key] as boolean;
  }
  const b = raw.bounds as Record<string, unknown> | undefined;
  if (b && ["x", "y", "width", "height"].every((k) => typeof b[k] === "number" && Number.isFinite(b[k] as number))) {
    out.bounds = { x: b.x as number, y: b.y as number, width: Math.max(900, b.width as number), height: Math.max(560, b.height as number) };
  }
  return out;
}

export function loadPrefs(): DesktopPrefs {
  try {
    return sanitize(JSON.parse(fs.readFileSync(file(), "utf-8")));
  } catch {
    return { ...DEFAULT_PREFS, shortcuts: { ...DEFAULT_PREFS.shortcuts } };
  }
}

export function savePrefs(prefs: DesktopPrefs): void {
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), JSON.stringify(prefs, null, 2), "utf-8");
  } catch (err) {
    console.error("[jarvis] failed to save prefs", err);
  }
}
