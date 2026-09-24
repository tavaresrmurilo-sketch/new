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
  const result = { syncs, insightTenants, expiredSessions: expired.count, ms: Date.now() - started };
  logger.info("jobs.completed", result);
  return result;
}
