import { NextResponse } from "next/server";
import { z } from "zod";
import { analyticsCtx } from "@/server/analytics/base";
import { refreshInsights } from "@/server/analytics/insights";
import { audit } from "@/server/audit";
import { apiRoute, requireApi } from "@/server/auth/guard";
import { processImportJob } from "@/server/cortex/import";

export const runtime = "nodejs";
export const maxDuration = 300;

const schema = z.object({
  mapping: z.record(z.string(), z.string().max(200).nullable()),
  sourceName: z.string().trim().max(80).optional(),
});

/** Etapa 2: processa com o mapeamento confirmado pelo usuário. */
export const POST = apiRoute<{ id: string }>(async (req, { id }) => {
  const ctx = await requireApi("import:run");
  const body = schema.parse(await req.json());
  const job = await processImportJob(ctx.tenantId, id, body.mapping, body.sourceName);
  await audit(ctx, { action: "import.processed", resource: "import", resourceId: id, result: job.status === "FAILED" ? "FAILURE" : "SUCCESS", metadata: { status: job.status, processed: job.processedRows, created: job.createdRows, updated: job.updatedRows, rejected: job.rejectedRows } });
  if (job.status !== "FAILED") await refreshInsights(await analyticsCtx(ctx)).catch(() => undefined);
  return NextResponse.json({ job });
});
