// Sincroniza os projetos nativos (android/ e ios/) com a configuração atual.
// Uso: CAPACITOR_SERVER_URL=https://seu-dominio npm run mobile:sync
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const url = process.env.CAPACITOR_SERVER_URL || "http://localhost:3000";
if (!process.env.CAPACITOR_SERVER_URL) {
  console.warn("⚠ CAPACITOR_SERVER_URL não definida: o app vai apontar para http://localhost:3000 (só para desenvolvimento).");
} else if (!url.startsWith("https://")) {
  console.warn("⚠ Para publicar nas lojas use uma URL https (CAPACITOR_SERVER_URL).");
}

const r = spawnSync("npx", ["cap", "sync"], { stdio: "inherit", env: process.env, shell: process.platform === "win32" });
if (r.status !== 0) process.exit(r.status ?? 1);

// A página offline (errorPath) é local: o botão "Tentar de novo" precisa da URL do servidor.
for (const file of ["android/app/src/main/assets/public/offline.html", "ios/App/App/public/offline.html"]) {
  if (!existsSync(file)) continue;
  writeFileSync(file, readFileSync(file, "utf8").replaceAll("__MIXTOUR_SERVER_URL__", url));
}
console.log(`✓ app nativo apontando para ${url}`);
