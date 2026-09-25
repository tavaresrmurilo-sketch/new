import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { audit } from "@/server/audit";
import { apiRoute, enforceRateLimit, requireApi } from "@/server/auth/guard";
import { isSqlKind, storedSource, testSource, type TestResult } from "@/server/connectors/external";
import { getProvider } from "@/server/connectors/registry";
import { friendlyError } from "@/server/connectors/sql/errors";
import { loadCredentials } from "@/server/connectors/vault";
import { NotFoundError } from "@/server/errors";

/** Testa a conexão salva (credenciais são lidas e usadas somente no servidor). */
export const POST = apiRoute<{ id: string }>(async (_req, { id }) => {
  const ctx = await requireApi("integrations:manage");
  enforceRateLimit(`int-test:${ctx.tenantId}`, { limit: 20, windowMs: 60_000 });
  const integration = await prisma.integration.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!integration) throw new NotFoundError("Integração não encontrada.");

  let result: Pick<TestResult, "ok" | "message" | "reason" | "causes" | "code"> & { durationMs?: number };
  if (isSqlKind(integration.provider) || integration.provider === "rest-api") {
    const r = await testSource(await storedSource(ctx.tenantId, id));
    result = { ok: r.ok, message: r.message, reason: r.reason, causes: r.causes, code: r.code, durationMs: r.durationMs };
  } else {
    const provider = getProvider(integration.provider);
    if (!provider) throw new NotFoundError("Conector não registrado.");
    try {
      result = await provider.testConnection({ tenantId: ctx.tenantId, integrationId: id, config: integration.config as Record<string, unknown>, credentials: await loadCredentials(ctx.tenantId, id), tables: [], log: () => undefined });
    } catch (err) {
      const f = friendlyError(err);
      result = { ok: false, message: f.message, reason: f.reason };
    }
  }
  if (integration.status === "CONNECTED" || integration.status === "ERROR") {
    await prisma.integration.update({ where: { id }, data: { status: result.ok ? "CONNECTED" : "ERROR", lastError: result.ok ? null : `${result.message} ${result.reason ?? ""}`.trim() } });
  }
  await audit(ctx, { action: "integration.tested", resource: "integration", resourceId: id, result: result.ok ? "SUCCESS" : "FAILURE", metadata: { code: result.code ?? null } });
  return NextResponse.json(result);
});
