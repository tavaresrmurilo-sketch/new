import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { asJson } from "@/server/ai/orchestrator";
import { analyticsCtx } from "@/server/analytics/base";
import { assumptionsSchema, scenarioBaseline, scenarioStartMonth, simulate } from "@/server/analytics/scenarios";
import { audit } from "@/server/audit";
import { apiRoute, requireApi } from "@/server/auth/guard";
import { sanitizeText } from "@/server/security/sanitize";

const schema = z.object({ name: z.string().min(1).max(80), kind: z.enum(["CONSERVATIVE", "BASE", "OPTIMISTIC", "CUSTOM"]), assumptions: assumptionsSchema });

export const POST = apiRoute(async (req) => {
  const ctx = await requireApi("scenarios:use");
  const body = schema.parse(await req.json());
  const actx = await analyticsCtx(ctx);
  const baseline = await scenarioBaseline(actx);
  const result = simulate(baseline, body.assumptions, scenarioStartMonth(actx));
  const s = await prisma.scenario.create({
    data: { tenantId: ctx.tenantId, name: sanitizeText(body.name, 80), kind: body.kind, assumptions: asJson(body.assumptions), result: asJson({ baseline, ...result }), createdById: ctx.userId },
  });
  await audit(ctx, { action: "scenario.saved", resource: "scenario", resourceId: s.id });
  return NextResponse.json({ id: s.id });
});
