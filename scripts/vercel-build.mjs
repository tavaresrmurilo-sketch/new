// Build da Vercel: Prisma Client → migrations pendentes (nunca apaga dados) → seed idempotente → Next.
import { spawnSync } from "node:child_process";

function run(cmd, args, env = process.env) {
  const r = spawnSync(cmd, args, { stdio: "inherit", env, shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

run("npx", ["prisma", "generate"]);
const migrateEnv = { ...process.env, DATABASE_URL: process.env.DIRECT_URL || process.env.DATABASE_URL };
run("npx", ["prisma", "migrate", "deploy"], migrateEnv);
run("npx", ["tsx", "prisma/seed.ts"], migrateEnv);
run("npx", ["next", "build"]);
