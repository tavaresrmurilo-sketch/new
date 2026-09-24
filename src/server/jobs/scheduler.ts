import { prisma } from "@/lib/db";
import { errorMessage, logger } from "@/lib/logger";
import { todayInTz } from "@/lib/periods";
import { refreshInsights } from "@/server/analytics/insights";
import { ROLE_PERMISSIONS } from "@/server/auth/permissions";
import { runDueSyncs } from "@/server/connectors/sync";

/**
 * Rotinas em segundo plano: sincronizações agendadas, análise periódica de insights e limpeza de sessões.
 * Preparado para rodar via cron (scripts/run-jobs.ts ou POST /api/jobs/run) ou uma fila (BullMQ/pg-boss) no futuro.
 */
export async function runScheduledJobs() {
  const started = Date.now();
  const syncs = await runDueSyncs();
  const tenants = await prisma.tenant.findMany({ where: { status: { in: ["ACTIVE", "TRIAL"] } }, select: { id: true, timezone: true, minCashBalance: true } });
  let insightTenants = 0;
  for (const t of tenants) {
    try {
      await refreshInsights({ tenantId: t.id, timezone: t.timezone, today: todayInTz(t.timezone), permissions: new Set(ROLE_PERMISSIONS.ADMIN_CLIENTE), minCashBalance: t.minCashBalance ? Number(t.minCashBalance) : null });
      insightTenants++;
    } catch (err) {
      logger.warn("jobs.insights_failed", { tenantId: t.id, err: errorMessage(err) });
    }
  }
  const expired = await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  const retention = await applyRetention();
  const result = { syncs, insightTenants, expiredSessions: expired.count, retention, ms: Date.now() - started };
  logger.info("jobs.completed", result);
  return result;
}

/**
 * Política de retenção (LGPD — minimização): remove, por tenant, conversas, arquivos brutos de importação
 * e histórico de relatórios mais antigos que Tenant.dataRetentionDays. Dados financeiros normalizados do
 * Cortex não são apagados automaticamente — a exclusão deles é uma ação explícita do cliente.
 */
export async function applyRetention() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, dataRetentionDays: true } });
  let conversations = 0;
  let files = 0;
  let reports = 0;
  for (const t of tenants) {
    const cutoff = new Date(Date.now() - t.dataRetentionDays * 86_400_000);
    conversations += (await prisma.conversation.deleteMany({ where: { tenantId: t.id, updatedAt: { lt: cutoff } } })).count;
    files += (await prisma.importedFile.deleteMany({ where: { tenantId: t.id, createdAt: { lt: cutoff } } })).count;
    reports += (await prisma.report.deleteMany({ where: { tenantId: t.id, createdAt: { lt: cutoff } } })).count;
  }
  return { conversations, files, reports };
}
