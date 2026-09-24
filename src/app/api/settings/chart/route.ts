import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { audit } from "@/server/audit";
import { apiRoute, requireApi } from "@/server/auth/guard";
import { AppError } from "@/server/errors";
import { chartAccountSchema } from "@/server/schemas";

export const POST = apiRoute(async (req) => {
  const ctx = await requireApi("settings:manage");
  const b = chartAccountSchema.parse(await req.json());
  if (await prisma.chartAccount.findUnique({ where: { tenantId_code: { tenantId: ctx.tenantId, code: b.code } } })) throw new AppError("Já existe uma conta com este código.", 409);
  const a = await prisma.chartAccount.create({ data: { tenantId: ctx.tenantId, code: b.code, name: b.name, dreGroup: b.dreGroup, categoryAliases: b.categoryAliases, isSensitive: b.isSensitive } });
  await audit(ctx, { action: "chart_account.created", resource: "chart_account", resourceId: a.id, metadata: { code: b.code, group: b.dreGroup } });
  return NextResponse.json({ id: a.id });
});
