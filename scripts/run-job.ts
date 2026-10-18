/**
 * Executa uma rotina agendada pela linha de comando (útil fora da Vercel ou para testes):
 *   npm run jobs:run -- daily | reminders | maintenance
 * Lê o .env da raiz do projeto quando existir. A execução fica registrada em /admin/rotinas.
 */
import Module from "node:module";
import path from "node:path";

const root = path.resolve(__dirname, "..");
try {
  process.loadEnvFile(path.join(root, ".env"));
} catch {
  // Sem .env: usa apenas as variáveis do ambiente.
}

// Os módulos do servidor importam "server-only" (que só existe no bundle do Next):
// fora dele, substituímos por um módulo vazio.
const localRequire = Module.createRequire(__filename);
const serverOnly = localRequire.resolve("server-only");
localRequire.cache[serverOnly] = { id: serverOnly, filename: serverOnly, loaded: true, exports: {} } as NodeJS.Module;

async function main() {
  const { isJobName, JOB_NAMES, runJob } = await import("../src/server/jobs");
  const { prisma } = await import("../src/server/db");
  const job = process.argv[2];
  if (!isJobName(job)) {
    console.error(`Uso: npm run jobs:run -- <${JOB_NAMES.join("|")}>`);
    process.exitCode = 1;
    return;
  }
  try {
    const run = await runJob(job, { trigger: "cli" });
    console.log(JSON.stringify({ job: run.job, status: run.status, durationMs: run.durationMs, result: run.result, errors: run.errors }, null, 2));
    if (run.status !== "success") process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
