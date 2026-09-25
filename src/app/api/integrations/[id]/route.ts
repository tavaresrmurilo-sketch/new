import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/server/audit";
import { apiRoute, requireApi } from "@/server/auth/guard";
import { isSqlKind, syncIntervalSchema, updateExternalConnection } from "@/server/connectors/external";
import { storeCredentials } from "@/server/connectors/vault";
import { AppError, NotFoundError } from "@/server/errors";
import { sanitizeText } from "@/server/security/sanitize";

const schema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  status: z.enum(["CONNECTED", "DISABLED"]).optional(),
  /** conexão de banco/API: campos secretos vazios mantêm o valor salvo */
  connection: z.record(z.string(), z.unknown()).optional(),
  /** credenciais de conectores legados (ex.: Google Sheets) */
  credentials: z.record(z.string(), z.string().max(4000)).optional(),
  syncIntervalMinutes: z.union([syncIntervalSchema, z.number().int().min(15).max(10_080)]).optional(),
});

export const PATCH = apiRoute<{ id: string }>(async (req, { id }) => {
  const ctx = await requireApi("integrations:manage");
  const body = schema.parse(await req.json());
  const integration = await prisma.integration.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!integration) throw new NotFoundError("Integração não encontrada.");
  if (integration.status === "NOT_IMPLEMENTED" && body.status) throw new AppError("Conector ainda não disponível.", 422);

  if (body.connection) {
    if (!isSqlKind(integration.provider) && integration.provider !== "rest-api") throw new AppError("Esta integração não usa conexão de banco/API.", 422);
    await updateExternalConnection(ctx, id, body.connection);
  }
  if (body.credentials) await storeCredentials(ctx.tenantId, id, body.credentials);

  const interval = body.syncIntervalMinutes === undefined ? integration.syncIntervalMinutes : body.syncIntervalMinutes;
  const current = await prisma.integration.findUniqueOrThrow({ where: { id } });
  const status = body.status ?? (body.credentials && current.status === "PENDING" ? "CONNECTED" : current.status);
  const active = status === "CONNECTED" || status === "ERROR";
  await prisma.integration.update({
    where: { id },
    data: {
      status,
      ...(body.name ? { name: sanitizeText(body.name, 80) } : {}),
      syncIntervalMinutes: interval,
      nextSyncAt: active && interval ? new Date(Date.now() + interval * 60_000) : null,
    },
  });
  const action = body.status === "DISABLED" ? "integration.disabled" : "integration.updated";
  await audit(ctx, { action, resource: "integration", resourceId: id, metadata: { status, syncIntervalMinutes: interval, credentialsChanged: Boolean(body.credentials || body.connection) } });
  return NextResponse.json({ ok: true, status });
});

export const DELETE = apiRoute<{ id: string }>(async (_req, { id }) => {
  const ctx = await requireApi("integrations:manage");
  const r = await prisma.integration.deleteMany({ where: { id, tenantId: ctx.tenantId } });
  if (!r.count) throw new NotFoundError("Integração não encontrada.");
  await audit(ctx, { action: "integration.deleted", resource: "integration", resourceId: id, metadata: { note: "credenciais removidas; dados já sincronizados permanecem no Cortex" } });
  return NextResponse.json({ ok: true });
});
