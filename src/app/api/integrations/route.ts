import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/server/audit";
import { apiRoute, requireApi } from "@/server/auth/guard";
import { getProvider } from "@/server/connectors/registry";
import { storeCredentials } from "@/server/connectors/vault";
import { ensureDataSource } from "@/server/cortex/ingest";
import { AppError } from "@/server/errors";
import { sanitizeText } from "@/server/security/sanitize";

const schema = z.object({
  provider: z.string().min(1).max(40),
  name: z.string().trim().min(2).max(80),
  credentials: z.record(z.string(), z.string().max(4000)).default({}),
  config: z.record(z.string(), z.unknown()).default({}),
  syncIntervalMinutes: z.number().int().min(15).max(10_080).nullable().optional(),
});

export const POST = apiRoute(async (req) => {
  const ctx = await requireApi("integrations:manage");
  const body = schema.parse(await req.json());
  const provider = getProvider(body.provider);
  if (!provider) throw new AppError("Conector desconhecido.", 422);
  if (provider.configSchema) {
    const parsed = provider.configSchema.safeParse(body.config);
    if (!parsed.success) throw new AppError(`Configuração inválida: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`, 422);
  }
  const missing = provider.credentialFields.filter((f) => f.required && !body.credentials[f.key]);
  const status = provider.availability === "planned" ? "NOT_IMPLEMENTED" : missing.length ? "PENDING_CREDENTIALS" : "ACTIVE";
  const integration = await prisma.integration.create({
    data: {
      tenantId: ctx.tenantId,
      name: sanitizeText(body.name, 80),
      type: provider.type,
      provider: provider.id,
      status,
      isMock: provider.availability === "mock",
      config: body.config as Prisma.InputJsonValue,
      syncIntervalMinutes: body.syncIntervalMinutes ?? null,
      nextSyncAt: body.syncIntervalMinutes && status === "ACTIVE" ? new Date(Date.now() + body.syncIntervalMinutes * 60_000) : null,
    },
  });
  await storeCredentials(ctx.tenantId, integration.id, body.credentials);
  await ensureDataSource(ctx.tenantId, integration.name, "INTEGRATION", integration.id, `Integração ${provider.label}`).catch(() => undefined);
  await audit(ctx, { action: "integration.created", resource: "integration", resourceId: integration.id, metadata: { provider: provider.id, status } });
  return NextResponse.json({ id: integration.id, status });
});
