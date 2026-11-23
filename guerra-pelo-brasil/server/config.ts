// Configuração do servidor via variáveis de ambiente (nenhum segredo é necessário).
import path from 'node:path';

const list = (v: string | undefined, def: string) => (v ?? def).split(',').map((s) => s.trim()).filter(Boolean);

export const CONFIG = {
  version: '2.0.0',
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? '0.0.0.0',
  /** origens autorizadas para HTTP/WebSocket ("*" = todas; "null" = arquivo local) */
  allowedOrigins: list(process.env.ALLOWED_ORIGINS, '*'),
  dataDir: path.resolve(process.env.DATA_DIR ?? 'data-server'),
  staticDir: path.resolve(process.env.STATIC_DIR ?? 'dist'),
  logLevel: (process.env.LOG_LEVEL ?? 'info') as 'debug' | 'info' | 'warn' | 'error',
  tickMs: 50,
  snapshotEvery: 2,
  persistEveryMs: 30_000,
  /** salas sem humanos conectados são encerradas após este tempo */
  idleRoomMs: Number(process.env.IDLE_ROOM_MS ?? 10 * 60_000),
  maxRooms: Number(process.env.MAX_ROOMS ?? 100),
  /** acelera a simulação (apenas para testes automatizados; padrão 1) */
  simSpeed: Math.max(1, Math.min(10, Number(process.env.SIM_SPEED ?? 1))),
};
