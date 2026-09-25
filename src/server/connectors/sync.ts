import type { Prisma, SyncMode, SyncTrigger } from "@prisma/client";
import { prisma } from "@/lib/db";
import { errorMessage, logger } from "@/lib/logger";
import { audit, type AuditActor } from "@/server/audit";
import { emptyStats, ensureDataSource, Ingestor } from "@/server/cortex/ingest";
import { getProvider } from "./registry";
import { friendlyError, scrub } from "./sql/errors";
import { ConnectorNotAvailableError, type ConnectorTable, type RowRejection } from "./types";
import { loadCredentials } from "./vault";

const MAX_PAGES = 200;
const MAX_STORED_ERRORS = 500;

export class SyncBlockedError extends Error {}

/**
 * Executa uma sincronização. Idempotente: registros são identificados por externalId na fonte,
 * então reprocessar ou repetir uma sincronização nunca duplica dados. Uma fonte indisponível
 * marca apenas a integração como ERROR — o restante do JR Cortex continua funcionando.
 */
export async function runSync(tenantId: string, integrationId: string, mode: SyncMode, trigger: SyncTrigger, actor?: AuditActor) {
  const integration = await prisma.integration.findFirst({ where: { id: integrationId, tenantId }, include: { tables: { where: { enabled: true } } } });
  if (!integration) throw new SyncBlockedError("Integração não encontrada.");
  if (integration.status === "DISABLED") throw new SyncBlockedError("Integração desativada. Reative-a para sincronizar.");
  if (integration.status === "NOT_IMPLEMENTED") throw new SyncBlockedError("Este conector ainda depende de API externa e não sincroniza dados.");
  const running = await prisma.syncJob.findFirst({ where: { tenantId, integrationId, status: "RUNNING", startedAt: { gt: new Date(Date.now() - 30 * 60_000) } } });
  if (running) throw new SyncBlockedError("Já existe uma sincronização em andamento para esta integração.");

  const who: AuditActor = actor ?? { tenantId, userId: null, userEmail: "agendador" };
  const job = await prisma.syncJob.create({
    data: { tenantId, integrationId, mode, trigger, status: "RUNNING", startedAt: new Date(), cursorFrom: mode === "INCREMENTAL" ? integration.syncCursor : null },
  });
  await prisma.integration.update({ where: { id: integrationId }, data: { status: "SYNCING" } });
  await audit(who, { action: "integration.sync.started", resource: "integration", resourceId: integrationId, metadata: { mode, trigger, jobId: job.id } });

  const logs: { ts: string; level: string; message: string }[] = [];
  const log = (message: string, level: "info" | "warn" | "error" = "info") => logs.push({ ts: new Date().toISOString(), level, message });
  const provider = getProvider(integration.provider);
  const stats = emptyStats();
  const rejections: RowRejection[] = [];
  let cursor = mode === "INCREMENTAL" ? integration.syncCursor : null;
  let status: "SUCCESS" | "PARTIAL" | "FAILED" = "SUCCESS";
  let errorMsg: string | null = null;
  let credentials: Record<string, string> = {};
  const started = Date.now();

  try {
    if (!provider) throw new Error(`Conector "${integration.provider}" não registrado.`);
    log(`Iniciando sincronização ${mode.toLowerCase()} (${trigger.toLowerCase()}) via ${provider.label}.`);
    credentials = await loadCredentials(tenantId, integrationId);
    const ds = await ensureDataSource(tenantId, integration.name, "INTEGRATION", integration.id, `Integração ${provider.label}`);
    const ingestor = new Ingestor(tenantId, ds.id);
    const tables: ConnectorTable[] = integration.tables.map((t) => ({
      id: t.id,
      schemaName: t.schemaName,
      tableName: t.tableName,
      entity: t.entity,
      mapping: (t.mapping ?? {}) as Record<string, string | null>,
      columns: (t.columns ?? []) as ConnectorTable["columns"],
      incrementalColumn: t.incrementalColumn,
      lastCursor: mode === "INCREMENTAL" ? t.lastCursor : null,
    }));
    const ctx = { tenantId, integrationId, config: integration.config as Record<string, unknown>, credentials, tables, log };
    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await provider.fetch(ctx, { mode, cursor, page });
      await ingestor.ingest(result.batch);
      if (result.rejected?.length) rejections.push(...result.rejected);
      await result.afterIngest?.();
      if (result.nextCursor !== undefined) cursor = result.nextCursor;
      if (!result.hasMore) break;
    }
    Object.assign(stats, ingestor.stats);
    stats.rejected += rejections.length;
    if (stats.rejected) {
      status = stats.processed ? "PARTIAL" : "FAILED";
      log(`${stats.rejected} registros rejeitados na validação.`, "warn");
    }
    log(`Concluído: ${stats.processed} processados (${stats.created} novos, ${stats.updated} atualizados), ${stats.rejected} rejeitados.`);
  } catch (err) {
    status = "FAILED";
    const secrets = Object.values(credentials).flatMap((c) => {
      try {
        const o = JSON.parse(c) as Record<string, unknown>;
        return Object.values(o).filter((v): v is string => typeof v === "string");
      } catch {
        return [c];
      }
    });
    const f = err instanceof ConnectorNotAvailableError ? { message: err.message, reason: "" } : friendlyError(err, secrets);
    errorMsg = f.reason ? `Integração indisponível: ${f.message} ${f.reason}` : f.message;
    log(errorMsg, "error");
    logger.warn("sync.failed", { tenantId, integrationId, err: scrub(errorMessage(err), secrets) });
  }

  const finishedAt = new Date();
  const durationMs = Date.now() - started;
  const planned = provider?.availability === "planned";
  const errorRows = [
    ...stats.errors.map((e) => ({ message: e.message, metadata: { entity: e.entity, index: e.index, externalId: e.externalId ?? null } })),
    ...rejections.map((r) => ({ message: r.message, metadata: r.metadata ?? {} })),
    ...(errorMsg ? [{ message: errorMsg, metadata: { fatal: true } }] : []),
  ].slice(0, MAX_STORED_ERRORS);

  await prisma.$transaction([
    prisma.syncJob.update({
      where: { id: job.id },
      data: {
        status,
        finishedAt,
        durationMs,
        errorMessage: errorMsg,
        recordsTotal: stats.total + rejections.length,
        recordsProcessed: stats.processed,
        recordsCreated: stats.created,
        recordsUpdated: stats.updated,
        recordsRejected: stats.rejected,
        cursorTo: cursor,
        errors: errorRows.slice(0, 100) as unknown as Prisma.InputJsonValue,
        logs: logs as unknown as Prisma.InputJsonValue,
      },
    }),
    prisma.syncError.createMany({ data: errorRows.map((e) => ({ tenantId, syncJobId: job.id, message: e.message.slice(0, 1000), metadata: e.metadata as Prisma.InputJsonValue })) }),
    prisma.integration.update({
      where: { id: integrationId },
      data: {
        lastSyncAt: finishedAt,
        syncCursor: status !== "FAILED" ? cursor : integration.syncCursor,
        status: planned ? "NOT_IMPLEMENTED" : status === "FAILED" ? "ERROR" : "CONNECTED",
        lastError: status === "FAILED" ? errorMsg ?? "Falha na sincronização." : null,
        recordsSynced: { increment: stats.processed },
        nextSyncAt: integration.syncIntervalMinutes && !planned ? new Date(finishedAt.getTime() + integration.syncIntervalMinutes * 60_000) : null,
      },
    }),
  ]);
  await audit(who, {
    action: status === "FAILED" ? "integration.sync.failed" : "integration.sync.completed",
    resource: "integration",
    resourceId: integrationId,
    result: status === "FAILED" ? "FAILURE" : "SUCCESS",
    metadata: { jobId: job.id, mode, status, processed: stats.processed, rejected: stats.rejected, durationMs },
  });
  return prisma.syncJob.findUniqueOrThrow({ where: { id: job.id } });
}

/** Executa sincronizações agendadas vencidas (chamado por scripts/run-jobs.ts ou cron). */
export async function runDueSyncs(limit = 20) {
  const due = await prisma.integration.findMany({
    where: { nextSyncAt: { lte: new Date() }, status: { in: ["CONNECTED", "ERROR"] } },
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
