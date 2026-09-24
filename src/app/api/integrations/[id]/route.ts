import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/server/audit";
import { apiRoute, requireApi } from "@/server/auth/guard";
import { storeCredentials } from "@/server/connectors/vault";
import { NotFoundError } from "@/server/errors";

const schema = z.object({
  status: z.enum(["ACTIVE", "PAUSED"]).optional(),
  credentials: z.record(z.string(), z.string().max(4000)).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  syncIntervalMinutes: z.number().int().min(15).max(10_080).nullable().optional(),
});

export const PATCH = apiRoute<{ id: string }>(async (req, { id }) => {
  const ctx = await requireApi("integrations:manage");
  const body = schema.parse(await req.json());
  const integration = await prisma.integration.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!integration) throw new NotFoundError("Integração não encontrada.");
  if (body.credentials) await storeCredentials(ctx.tenantId, id, body.credentials);
  const interval = body.syncIntervalMinutes === undefined ? integration.syncIntervalMinutes : body.syncIntervalMinutes;
  const status = integration.status === "NOT_IMPLEMENTED" ? "NOT_IMPLEMENTED" : body.status ?? (body.credentials ? "ACTIVE" : integration.status);
  await prisma.integration.update({
    where: { id },
    data: {
      status,
      ...(body.config ? { config: body.config as Prisma.InputJsonValue } : {}),
      syncIntervalMinutes: interval,
      nextSyncAt: status === "ACTIVE" && interval ? new Date(Date.now() + interval * 60_000) : null,
    },
  });
  await audit(ctx, { action: "integration.updated", resource: "integration", resourceId: id, metadata: { status, credentialsChanged: Boolean(body.credentials), configChanged: Boolean(body.config) } });
  return NextResponse.json({ ok: true });
});

export const DELETE = apiRoute<{ id: string }>(async (_req, { id }) => {
  const ctx = await requireApi("integrations:manage");
  const r = await prisma.integration.deleteMany({ where: { id, tenantId: ctx.tenantId } });
  if (!r.count) throw new NotFoundError("Integração não encontrada.");
  await audit(ctx, { action: "integration.deleted", resource: "integration", resourceId: id, metadata: { note: "dados já sincronizados permanecem no Cortex" } });
  return NextResponse.json({ ok: true });
});
