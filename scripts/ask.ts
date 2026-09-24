/** Utilitário de desenvolvimento: faz perguntas ao Cortex via linha de comando (tenant JR Demo). */
import { prisma } from "@/lib/db";
import { todayInTz } from "@/lib/periods";
import { ROLE_PERMISSIONS } from "@/server/auth/permissions";
import { askCortex } from "@/server/ai/orchestrator";

async function main() {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: process.env.TENANT ?? "jr-demo" } });
  const ctx = {
    tenantId: tenant.id,
    timezone: tenant.timezone,
    today: todayInTz(tenant.timezone),
    permissions: new Set(ROLE_PERMISSIONS[(process.env.ROLE as keyof typeof ROLE_PERMISSIONS) ?? "ADMIN_CLIENTE"]),
    minCashBalance: tenant.minCashBalance ? Number(tenant.minCashBalance) : null,
  };
  const questions = process.argv.slice(2);
  for (const q of questions) {
    const a = await askCortex({ ctx, question: q, history: [], allowExternalAI: false });
    console.log(`\n=== ${q}\n[tools: ${a.trace.tools.map((t) => `${t.name}${JSON.stringify(t.input)}`).join(", ")}] (${a.trace.durationMs}ms)\n${a.content}`);
  }
  await prisma.$disconnect();
}
main();
