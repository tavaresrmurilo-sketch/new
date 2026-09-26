#!/usr/bin/env node
// JR CORTEX — PRE-DEMO CHECK
// Uso: npm run pre-demo            (verifica .env, banco, migrations, contas e, se estiver rodando, o servidor)
//      npm run pre-demo -- --url=https://seu-app.vercel.app   (verifica também a aplicação publicada)
// Nunca imprime valores de variáveis, senhas, tokens ou a URL do banco.
import fs from "node:fs";
import path from "node:path";

const results = [];
const ok = (name, detail) => results.push({ status: "ok", name, detail });
const warn = (name, detail) => results.push({ status: "warn", name, detail });
const fail = (name, detail) => results.push({ status: "fail", name, detail });

// ── .env (sem dependências; não sobrescreve variáveis já definidas) ──
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return false;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
  return true;
}
const envLoaded = loadEnvFile(path.resolve(".env"));

const argUrl = process.argv.find((a) => a.startsWith("--url="))?.slice(6);
const appUrl = (argUrl || process.env.PRE_DEMO_URL || "http://localhost:3000").replace(/\/+$/, "");

// ── 1. Environment ──
{
  const missing = [];
  const problems = [];
  if (!process.env.DATABASE_URL) missing.push("DATABASE_URL");
  if (!process.env.AUTH_SECRET) missing.push("AUTH_SECRET");
  else if (process.env.AUTH_SECRET.length < 32) problems.push("AUTH_SECRET com menos de 32 caracteres");
  if (!process.env.ENCRYPTION_KEY) missing.push("ENCRYPTION_KEY");
  if (missing.length || problems.length) fail("Environment", [missing.length ? `ausentes: ${missing.join(", ")}` : "", ...problems].filter(Boolean).join("; "));
  else ok("Environment", envLoaded ? "variáveis obrigatórias presentes (.env)" : "variáveis obrigatórias presentes");

  const provider = process.env.AI_PROVIDER || "rules";
  const keyVar = { claude: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY", gemini: "GOOGLE_AI_API_KEY", local: "LOCAL_LLM_URL" }[provider];
  if (provider === "rules") ok("AI configuration", "motor interno do Cortex (sem provedor externo)");
  else if (keyVar && !process.env[keyVar]) warn("AI configuration", `AI_PROVIDER=${provider} mas ${keyVar} não está definida — o chat usará o motor interno`);
  else ok("AI configuration", `provedor ${provider} configurado (com fallback para o motor interno)`);
  if (!process.env.CRON_SECRET) warn("Cron", "CRON_SECRET não definida — sincronizações automáticas desativadas");
}

// ── 2-4. Database, Prisma, dados essenciais ──
let prisma = null;
if (process.env.DATABASE_URL) {
  try {
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
    const t0 = Date.now();
    await Promise.race([prisma.$queryRaw`SELECT 1`, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout de 10s")), 10_000))]);
    ok("Database", `conectado (${Date.now() - t0} ms)`);
  } catch (err) {
    const code = err?.code || err?.errorCode || "";
    const reason = /P1000|authentication/i.test(`${code} ${err?.message}`) ? "credenciais do banco recusadas"
      : /P1001|reach|ECONNREFUSED|ENOTFOUND/i.test(`${code} ${err?.message}`) ? "servidor do banco inacessível (host/porta/firewall ou banco pausado)"
      : /timeout/i.test(String(err?.message)) ? "tempo de conexão esgotado"
      : /did you run "prisma generate"|has not been initialized/i.test(String(err?.message)) ? "Prisma Client não gerado — rode: npx prisma generate"
      : `falha ao conectar${code ? ` (${code})` : ""}`;
    fail("Database", reason);
    prisma = null;
  }
}

if (prisma) {
  try {
    const dir = path.resolve("prisma/migrations");
    const local = fs.readdirSync(dir).filter((d) => fs.statSync(path.join(dir, d)).isDirectory());
    const applied = await prisma.$queryRawUnsafe(`SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"`);
    const done = new Set(applied.filter((m) => m.finished_at && !m.rolled_back_at).map((m) => m.migration_name));
    const failed = applied.filter((m) => !m.finished_at && !m.rolled_back_at).map((m) => m.migration_name);
    const pending = local.filter((m) => !done.has(m));
    if (failed.length) fail("Prisma", `migration com falha: ${failed.join(", ")}`);
    else if (pending.length) fail("Prisma", `${pending.length} migration(s) pendente(s) — rode: npx prisma migrate deploy`);
    else ok("Prisma", `${done.size} migrations aplicadas, schema em dia`);
  } catch {
    fail("Prisma", "tabela de migrations não encontrada — rode: npx prisma migrate deploy");
  }

  try {
    const [admins, activeUsers, tenants, demo, sessions] = await Promise.all([
      prisma.user.count({ where: { userRole: "ADMIN", active: true } }),
      prisma.user.count({ where: { active: true, tenantId: { not: null } } }),
      prisma.tenant.count({ where: { status: { in: ["ACTIVE", "TRIAL"] } } }),
      prisma.tenant.findFirst({ where: { isDemo: true }, select: { name: true, _count: { select: { sales: true } } } }),
      prisma.session.count({ where: { expiresAt: { gt: new Date() } } }),
    ]);
    if (!process.env.AUTH_SECRET) fail("Authentication configuration", "AUTH_SECRET ausente");
    else if (!admins) warn("Authentication configuration", "nenhum administrador (ADMIN) ativo — rode: npm run admin:create");
    else ok("Authentication configuration", `${admins} admin(s), ${activeUsers} usuário(s) de empresas ativos, ${sessions} sessão(ões) válidas`);
    if (!tenants) warn("Data", "nenhuma empresa ativa cadastrada");
    else ok("Data", `${tenants} empresa(s) ativa(s)${demo ? ` · ambiente demo "${demo.name}" com ${demo._count.sales} vendas` : ""}`);
  } catch (err) {
    fail("Authentication configuration", `não foi possível ler usuários/empresas${err?.code ? ` (${err.code})` : ""}`);
  }
  await prisma.$disconnect().catch(() => undefined);
}

// ── 5. Critical services (aplicação em execução) ──
try {
  const t0 = Date.now();
  const res = await fetch(`${appUrl}/api/health`, { signal: AbortSignal.timeout(8_000), cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (res.ok && body.status === "ok") ok("Critical services", `aplicação respondendo em ${appUrl} (${Date.now() - t0} ms, banco: ${body.database})`);
  else fail("Critical services", `aplicação respondeu HTTP ${res.status} (banco: ${body.database ?? "?"})`);
  const login = await fetch(`${appUrl}/login`, { signal: AbortSignal.timeout(8_000), redirect: "manual" });
  if (login.status !== 200) fail("Login page", `HTTP ${login.status}`);
  else ok("Login page", "tela de login disponível");
} catch {
  warn("Critical services", `aplicação não está rodando em ${appUrl} (inicie com npm run dev ou npm start, ou use --url=)`);
}

// ── Relatório ──
const icon = { ok: "✓", warn: "!", fail: "✗" };
console.log("\nJR CORTEX — PRE-DEMO CHECK\n");
for (const r of results) {
  console.log(`${icon[r.status]} ${r.name}`);
  if (r.status !== "ok" || process.argv.includes("--verbose")) console.log(`   ${r.status === "fail" ? "Motivo" : "Detalhe"}: ${r.detail}`);
}
const failed = results.filter((r) => r.status === "fail");
const warned = results.filter((r) => r.status === "warn");
console.log(failed.length ? `\nSYSTEM NOT READY (${failed.length} falha(s))` : warned.length ? `\nSYSTEM READY (${warned.length} aviso(s))` : "\nSYSTEM READY");
process.exit(failed.length ? 1 : 0);
