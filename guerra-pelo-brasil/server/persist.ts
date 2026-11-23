// Persistência em disco: partidas em andamento (recuperação após reinício),
// histórico de partidas e registro de comandos para replay.
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from './config';
import { log } from './log';
import type { MatchResult } from '../shared/net/protocol';

const roomsDir = () => path.join(CONFIG.dataDir, 'rooms');
const replaysDir = () => path.join(CONFIG.dataDir, 'replays');
const historyFile = () => path.join(CONFIG.dataDir, 'history.json');

export function ensureDirs(): void {
  try {
    for (const d of [CONFIG.dataDir, roomsDir(), replaysDir()]) fs.mkdirSync(d, { recursive: true });
    fs.accessSync(CONFIG.dataDir, fs.constants.W_OK);
  } catch (e) {
    // o jogo continua funcionando; só perde a recuperação de salas após reinício
    log.error('DATA_DIR sem permissão de escrita: partidas não serão persistidas', { dataDir: CONFIG.dataDir, err: String(e) });
  }
}

function atomicWrite(file: string, data: string): void {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

const safeName = (code: string) => code.replace(/[^A-Z0-9-]/g, '');

export function saveRoom(code: string, data: unknown): void {
  try {
    atomicWrite(path.join(roomsDir(), `${safeName(code)}.json`), JSON.stringify(data));
  } catch (e) {
    log.error('falha ao salvar sala', { code, err: String(e) });
  }
}

export function deleteRoom(code: string): void {
  try { fs.rmSync(path.join(roomsDir(), `${safeName(code)}.json`), { force: true }); } catch { /* ignore */ }
}

export function loadRooms(): unknown[] {
  try {
    return fs.readdirSync(roomsDir()).filter((f) => f.endsWith('.json')).map((f) => {
      try { return JSON.parse(fs.readFileSync(path.join(roomsDir(), f), 'utf8')); } catch (e) { log.warn('save de sala corrompido', { f, err: String(e) }); return null; }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

export function loadHistory(): MatchResult[] {
  try { return JSON.parse(fs.readFileSync(historyFile(), 'utf8')) as MatchResult[]; } catch { return []; }
}

export function saveHistory(list: MatchResult[]): void {
  try { atomicWrite(historyFile(), JSON.stringify(list.slice(-200))); } catch (e) { log.error('falha ao salvar histórico', { err: String(e) }); }
}

export function saveReplay(code: string, endedAt: number, data: unknown): void {
  try { atomicWrite(path.join(replaysDir(), `${safeName(code)}-${endedAt}.json`), JSON.stringify(data)); } catch (e) { log.warn('falha ao salvar replay', { err: String(e) }); }
}
