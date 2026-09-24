import type { Prisma, SyncMode, SyncTrigger } from "@prisma/client";
import { prisma } from "@/lib/db";
import { errorMessage, logger } from "@/lib/logger";
import { emptyStats, ensureDataSource, Ingestor } from "@/server/cortex/ingest";
import { getProvider } from "./registry";
import { ConnectorNotAvailableError } from "./types";
import { loadCredentials } from "./vault";

const MAX_PAGES = 200;

/**
 * Executa uma sincronização. Idempotente: registros são identificados por externalId na fonte,
 * então reprocessar ou repetir uma sincronização nunca duplica dados.
 */
export async function runSync(tenantId: string, integrationId: string, mode: SyncMode, trigger: SyncTrigger) {
  const integration = await prisma.integration.findFirst({ where: { id: integrationId, tenantId } });
  if (!integration) throw new Error("Integração não encontrada.");
  const running = await prisma.syncJob.findFirst({ where: { tenantId, integrationId, status: "RUNNING", startedAt: { gt: new Date(Date.now() - 30 * 60_000) } } });
  if (running) throw new Error("Já existe uma sincronização em andamento para esta integração.");

  const job = await prisma.syncJob.create({
    data: { tenantId, integrationId, mode, trigger, status: "RUNNING", startedAt: new Date(), cursorFrom: mode === "INCREMENTAL" ? integration.syncCursor : null },
  });
  const logs: { ts: string; level: string; message: string }[] = [];
  const log = (message: string, level: "info" | "warn" | "error" = "info") => logs.push({ ts: new Date().toISOString(), level, message });
  const provider = getProvider(integration.provider);
  const stats = emptyStats();
  let cursor = mode === "INCREMENTAL" ? integration.syncCursor : null;
  let status: "SUCCESS" | "PARTIAL" | "FAILED" = "SUCCESS";

  try {
    if (!provider) throw new Error(`Provider "${integration.provider}" não registrado.`);
    log(`Iniciando sincronização ${mode.toLowerCase()} (${trigger.toLowerCase()}) via ${provider.label}.`);
    const credentials = await loadCredentials(tenantId, integrationId);
    const ds = await ensureDataSource(tenantId, integration.name, "INTEGRATION", integration.id, `Integração ${provider.label}`);
    const ingestor = new Ingestor(tenantId, ds.id);
    const ctx = { tenantId, integrationId, config: integration.config as Record<string, unknown>, credentials, log };
    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await provider.fetch(ctx, { mode, cursor, page });
      await ingestor.ingest(result.batch);
      if (result.nextCursor !== undefined) cursor = result.nextCursor;
      if (!result.hasMore) break;
    }
    Object.assign(stats, ingestor.stats);
    if (stats.rejected) {
      status = stats.processed ? "PARTIAL" : "FAILED";
      log(`${stats.rejected} registros rejeitados na validação.`, "warn");
    }
    log(`Concluído: ${stats.processed} processados (${stats.created} novos, ${stats.updated} atualizados), ${stats.rejected} rejeitados.`);
  } catch (err) {
    status = "FAILED";
    log(errorMessage(err), "error");
    logger.warn("sync.failed", { tenantId, integrationId, err: errorMessage(err) });
  }

  const finishedAt = new Date();
  const notAvailable = provider?.availability === "planned";
  await prisma.$transaction([
    prisma.syncJob.update({
      where: { id: job.id },
      data: {
        status,
        finishedAt,
        recordsTotal: stats.total,
        recordsProcessed: stats.processed,
        recordsCreated: stats.created,
        recordsUpdated: stats.updated,
        recordsRejected: stats.rejected,
        cursorTo: cursor,
        errors: stats.errors.slice(0, 100) as unknown as Prisma.InputJsonValue,
        logs: logs as unknown as Prisma.InputJsonValue,
      },
    }),
    prisma.integration.update({
      where: { id: integrationId },
      data: {
        lastSyncAt: finishedAt,
        syncCursor: status !== "FAILED" ? cursor : integration.syncCursor,
        status: notAvailable ? "NOT_IMPLEMENTED" : status === "FAILED" ? "ERROR" : "ACTIVE",
        nextSyncAt: integration.syncIntervalMinutes && !notAvailable ? new Date(finishedAt.getTime() + integration.syncIntervalMinutes * 60_000) : null,
      },
    }),
  ]);
  return prisma.syncJob.findUniqueOrThrow({ where: { id: job.id } });
}

/** Executa sincronizações agendadas vencidas (chamado por scripts/run-jobs.ts ou cron). */
export async function runDueSyncs(limit = 20) {
  const due = await prisma.integration.findMany({
    where: { nextSyncAt: { lte: new Date() }, status: { in: ["ACTIVE", "ERROR"] } },
    take: limit,
    orderBy: { nextSyncAt: "asc" },
  });
  const results = [];
  for (const i of due) {
    try {
      const job = await runSync(i.tenantId, i.id, "INCREMENTAL", "SCHEDULED");
      results.push({ integrationId: i.id, status: job.status });
    } catch (err) {
      results.push({ integrationId: i.id, status: "FAILED", error: errorMessage(err) });
    }
  }
  return results;
}

export { ConnectorNotAvailableError };
