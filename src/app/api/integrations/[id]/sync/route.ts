import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorMessage } from "@/lib/logger";
import { apiRoute, enforceRateLimit, requireApi } from "@/server/auth/guard";
import { runSync } from "@/server/connectors/sync";
import { AppError, NotFoundError } from "@/server/errors";

export const runtime = "nodejs";
export const maxDuration = 300;

const schema = z.object({ mode: z.enum(["INCREMENTAL", "FULL", "REPROCESS"]).default("INCREMENTAL") });

export const POST = apiRoute<{ id: string }>(async (req, { id }) => {
  const ctx = await requireApi("integrations:manage");
  enforceRateLimit(`int-sync:${ctx.tenantId}`, { limit: 10, windowMs: 60_000 });
  const { mode } = schema.parse(await req.json().catch(() => ({})));
  const integration = await prisma.integration.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!integration) throw new NotFoundError("Integração não encontrada.");
  try {
    const job = await runSync(ctx.tenantId, id, mode, "MANUAL", ctx);
    return NextResponse.json({ job });
  } catch (err) {
    throw new AppError(errorMessage(err), 409);
  }
});
