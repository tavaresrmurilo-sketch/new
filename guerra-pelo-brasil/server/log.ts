// Log estruturado simples (stdout), com níveis.
import { CONFIG } from './config';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

function out(level: Level, msg: string, data?: Record<string, unknown>): void {
  if (LEVELS[level] < LEVELS[CONFIG.logLevel]) return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...data });
  if (level === 'error' || level === 'warn') console.error(line); else console.log(line);
}

export const log = {
  debug: (m: string, d?: Record<string, unknown>) => out('debug', m, d),
  info: (m: string, d?: Record<string, unknown>) => out('info', m, d),
  warn: (m: string, d?: Record<string, unknown>) => out('warn', m, d),
  error: (m: string, d?: Record<string, unknown>) => out('error', m, d),
};
