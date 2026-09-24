import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errorMessage } from "@/lib/logger";
import { audit } from "@/server/audit";
import { apiRoute, requireApi } from "@/server/auth/guard";
import { getProvider } from "@/server/connectors/registry";
import { loadCredentials } from "@/server/connectors/vault";
import { NotFoundError } from "@/server/errors";

export const POST = apiRoute<{ id: string }>(async (_req, { id }) => {
  const ctx = await requireApi("integrations:manage");
  const integration = await prisma.integration.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!integration) throw new NotFoundError("Integração não encontrada.");
  const provider = getProvider(integration.provider);
  if (!provider) throw new NotFoundError("Conector não registrado.");
  let result: { ok: boolean; message: string };
  try {
    result = await provider.testConnection({ tenantId: ctx.tenantId, integrationId: id, config: integration.config as Record<string, unknown>, credentials: await loadCredentials(ctx.tenantId, id), log: () => undefined });
  } catch (err) {
    result = { ok: false, message: errorMessage(err) };
  }
  await audit(ctx, { action: "integration.tested", resource: "integration", resourceId: id, result: result.ok ? "SUCCESS" : "FAILURE" });
  return NextResponse.json(result);
});
