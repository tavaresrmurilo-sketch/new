// Build usado pela Vercel (script "vercel-build"). Multiplataforma (sem sintaxe de shell).
// 1) gera o Prisma Client  2) aplica migrations pendentes (nunca apaga dados)  3) build do Next.js
// Com Neon, DIRECT_URL (conexão direta, sem "-pooler") é usada apenas para as migrations, se definida.
import { spawnSync } from "node:child_process";

function run(cmd, args, env = process.env) {
  const r = spawnSync(cmd, args, { stdio: "inherit", env, shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

run("npx", ["prisma", "generate"]);
const migrateEnv = { ...process.env, DATABASE_URL: process.env.DIRECT_URL || process.env.DATABASE_URL };
run("npx", ["prisma", "migrate", "deploy"], migrateEnv);
run("npx", ["next", "build"]);
