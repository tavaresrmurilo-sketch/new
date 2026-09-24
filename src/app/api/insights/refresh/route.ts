import { NextResponse } from "next/server";
import { analyticsCtx } from "@/server/analytics/base";
import { refreshInsights } from "@/server/analytics/insights";
import { audit } from "@/server/audit";
import { apiRoute, requireApi } from "@/server/auth/guard";

export const POST = apiRoute(async () => {
  const ctx = await requireApi("insights:view");
  const r = await refreshInsights(await analyticsCtx(ctx));
  await audit(ctx, { action: "insights.generated", resource: "insight", metadata: { detected: r.detected } });
  return NextResponse.json(r);
});
