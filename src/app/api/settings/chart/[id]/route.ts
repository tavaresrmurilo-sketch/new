import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { audit } from "@/server/audit";
import { apiRoute, requireApi } from "@/server/auth/guard";
import { NotFoundError } from "@/server/errors";
import { chartAccountSchema } from "@/server/schemas";

export const PATCH = apiRoute<{ id: string }>(async (req, { id }) => {
  const ctx = await requireApi("settings:manage");
  const b = chartAccountSchema.parse(await req.json());
  const r = await prisma.chartAccount.updateMany({ where: { id, tenantId: ctx.tenantId }, data: { code: b.code, name: b.name, dreGroup: b.dreGroup, categoryAliases: b.categoryAliases, isSensitive: b.isSensitive } });
  if (!r.count) throw new NotFoundError();
  await audit(ctx, { action: "chart_account.updated", resource: "chart_account", resourceId: id, metadata: { code: b.code, group: b.dreGroup } });
  return NextResponse.json({ ok: true });
});

export const DELETE = apiRoute<{ id: string }>(async (_req, { id }) => {
  const ctx = await requireApi("settings:manage");
  const r = await prisma.chartAccount.deleteMany({ where: { id, tenantId: ctx.tenantId } });
  if (!r.count) throw new NotFoundError();
  await audit(ctx, { action: "chart_account.deleted", resource: "chart_account", resourceId: id });
  return NextResponse.json({ ok: true });
});
