// Persistência local (localStorage): configurações e partidas salvas.
import type { GameMode } from '../sim/types';

export interface Settings {
  music: number;
  sfx: number;
  edgeScroll: boolean;
  showAllHp: boolean;
  particles: boolean;
  defaultSpeed: number;
  autosave: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  music: 0.45,
  sfx: 0.7,
  edgeScroll: false,
  showAllHp: true,
  particles: true,
  defaultSpeed: 1,
  autosave: true,
};

const PREFIX = 'gpb.v1.';

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(PREFIX + key, value);
    return true;
  } catch {
    return false;
  }
}

export function loadSettings(): Settings {
  const raw = safeGet('settings');
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  safeSet('settings', JSON.stringify(s));
}

export interface SaveMeta {
  mode: GameMode;
  savedAt: number;
  time: number;
  player: string;
  difficulty: string;
  states: number;
  label: string;
}

export function writeSave(mode: GameMode, json: string, meta: SaveMeta): boolean {
  const ok = safeSet('save.' + mode, json);
  if (ok) safeSet('meta.' + mode, JSON.stringify(meta));
  return ok;
}

export function readSave(mode: GameMode): string | null {
  return safeGet('save.' + mode);
}

export function readMeta(mode: GameMode): SaveMeta | null {
  const raw = safeGet('meta.' + mode);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SaveMeta;
  } catch {
    return null;
  }
}

export function deleteSave(mode: GameMode): void {
  try {
    localStorage.removeItem(PREFIX + 'save.' + mode);
    localStorage.removeItem(PREFIX + 'meta.' + mode);
  } catch {
    /* sem acesso ao armazenamento */
  }
}

export function recordResult(won: boolean): { wins: number; losses: number } {
  const raw = safeGet('record');
  const rec = raw ? (JSON.parse(raw) as { wins: number; losses: number }) : { wins: 0, losses: 0 };
  if (won) rec.wins++; else rec.losses++;
  safeSet('record', JSON.stringify(rec));
  return rec;
}

export function readRecord(): { wins: number; losses: number } {
  const raw = safeGet('record');
  try {
    return raw ? (JSON.parse(raw) as { wins: number; losses: number }) : { wins: 0, losses: 0 };
  } catch {
    return { wins: 0, losses: 0 };
  }
}
