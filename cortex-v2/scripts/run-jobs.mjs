/**
 * Dispara jobs agendados chamando a API da aplicação (que precisa estar rodando).
 * Útil para cron de servidor, GitHub Actions ou testes locais.
 *   npm run jobs:run -- daily            (Windows: npm.cmd run jobs:run -- daily)
 *   npm run jobs:run -- contracts-expiring
 * Requer APP_URL e CRON_SECRET (lidos do ambiente ou do arquivo .env).
 */
import { existsSync, readFileSync } from "node:fs";

for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}

const job = process.argv[2] ?? "daily";
const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error("Defina CRON_SECRET.");
  process.exit(1);
}
const res = await fetch(`${base}/api/cron/${encodeURIComponent(job)}`, { method: "POST", headers: { Authorization: `Bearer ${secret}` } });
const body = await res.text();
console.log(res.status, body);
process.exit(res.ok ? 0 : 1);
