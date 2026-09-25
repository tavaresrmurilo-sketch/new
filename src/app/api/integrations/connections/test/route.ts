import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/server/audit";
import { apiRoute, enforceRateLimit, requireApi } from "@/server/auth/guard";
import { sourceSchema, testSource } from "@/server/connectors/external";

const schema = z.object({ source: sourceSchema });

/** Testa uma conexão ainda não salva. A resposta nunca contém credenciais. */
export const POST = apiRoute(async (req) => {
  const ctx = await requireApi("integrations:manage");
  enforceRateLimit(`int-test:${ctx.tenantId}`, { limit: 20, windowMs: 60_000 });
  const { source } = schema.parse(await req.json());
  const result = await testSource(source);
  await audit(ctx, { action: "integration.tested", resource: "integration", result: result.ok ? "SUCCESS" : "FAILURE", metadata: { provider: source.kind, stage: "wizard", code: result.code ?? null } });
  return NextResponse.json(result);
});
