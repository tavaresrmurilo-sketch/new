/**
 * Build usado pela Vercel (script "vercel-build"):
 *   1. confere as variáveis obrigatórias e explica o que falta;
 *   2. gera o Prisma Client;
 *   3. aplica as migrations;
 *   4. roda o seed (admin sempre; catálogo inicial só em banco vazio);
 *   5. compila o Next.js.
 */
import { execSync } from "node:child_process";

const env = process.env;
const problems = [];

const databaseUrl = env.DATABASE_URL || env.POSTGRES_URL;
if (!databaseUrl) {
  problems.push(
    "Banco de dados não conectado (DATABASE_URL). Na Vercel: aba Storage → Create Database → Neon (Postgres) → conecte a este projeto.",
  );
}
if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) {
  problems.push("AUTH_SECRET ausente ou com menos de 32 caracteres (Settings → Environment Variables).");
}
for (const name of ["PIX_KEY", "PIX_RECEIVER_NAME", "PIX_CITY"]) {
  if (!env[name]) problems.push(`${name} não definida (Settings → Environment Variables).`);
}

if (problems.length > 0) {
  console.error("\n✖ CHAVIX 3D: configuração incompleta para publicar\n");
  for (const problem of problems) console.error(`  • ${problem}`);
  console.error("\nDepois de ajustar, vá em Deployments → ⋯ → Redeploy.\n");
  process.exit(1);
}

if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
  console.warn("⚠ ADMIN_EMAIL/ADMIN_PASSWORD não definidos: nenhum administrador será criado neste deploy.");
}
if (!env.NEXT_PUBLIC_SITE_URL && env.VERCEL_PROJECT_PRODUCTION_URL) {
  // Usa o domínio de produção da Vercel quando o site ainda não tem domínio próprio.
  env.NEXT_PUBLIC_SITE_URL = `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  console.log(`• NEXT_PUBLIC_SITE_URL não definida: usando ${env.NEXT_PUBLIC_SITE_URL}`);
}

const run = (command) => {
  console.log(`\n$ ${command}`);
  execSync(command, { stdio: "inherit", env });
};

run("npx prisma generate");
run("npx prisma migrate deploy");
run("npx prisma db seed");
run("npx next build");
