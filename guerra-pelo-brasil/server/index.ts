// Servidor multiplayer autoritativo de GUERRA PELO BRASIL.
// HTTP: /health, /api/rooms, /api/history e os arquivos do jogo (dist/).
// WebSocket: /ws
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { CONFIG } from './config';
import { Hub } from './hub';
import { log } from './log';

const hub = new Hub();

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

function cors(req: http.IncomingMessage, res: http.ServerResponse): void {
  const origin = req.headers.origin;
  if (CONFIG.allowedOrigins.includes('*')) res.setHeader('Access-Control-Allow-Origin', '*');
  else if (origin && hub.originAllowed(origin)) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
}

function json(res: http.ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const url = new URL(req.url ?? '/', 'http://x');
  if (req.method === 'OPTIONS') { cors(req, res); res.writeHead(204); res.end(); return; }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  if (url.pathname === '/health' || url.pathname === '/api/health') {
    cors(req, res);
    json(res, 200, { status: 'ok', version: CONFIG.version, uptime: Math.round(process.uptime()), ...hub.stats() });
    return;
  }
  if (url.pathname === '/api/rooms') { cors(req, res); json(res, 200, { rooms: hub.publicRooms() }); return; }
  if (url.pathname === '/api/history') { cors(req, res); json(res, 200, { history: hub.history.slice(-30).reverse() }); return; }
  // arquivos estáticos do jogo (build do cliente)
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || !path.extname(rel)) rel = '/index.html';
  const file = path.normalize(path.join(CONFIG.staticDir, rel));
  if (!file.startsWith(CONFIG.staticDir + path.sep) && file !== CONFIG.staticDir) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) {
      if (rel === '/index.html') { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Servidor do Guerra pelo Brasil no ar. Gere o cliente com "npm run build" para servir o jogo por aqui.'); return; }
      res.writeHead(404); res.end('Não encontrado'); return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': rel === '/index.html' ? 'no-cache' : 'public, max-age=3600' });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '?').split(',')[0].trim();
  if (url.pathname !== '/ws' || !hub.originAllowed(req.headers.origin) || !hub.canAccept(ip)) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }
  hub.wss.handleUpgrade(req, socket, head, (ws) => hub.wss.emit('connection', ws, req));
});

hub.start();
server.listen(CONFIG.port, CONFIG.host, () => {
  log.info('servidor no ar', { port: CONFIG.port, host: CONFIG.host, staticDir: CONFIG.staticDir, dataDir: CONFIG.dataDir, origins: CONFIG.allowedOrigins.join(',') });
});

const shutdown = (sig: string) => {
  log.info('encerrando', { sig });
  hub.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (e) => log.error('exceção não tratada', { err: String(e), stack: e.stack }));
process.on('unhandledRejection', (e) => log.error('promessa rejeitada', { err: String(e) }));
