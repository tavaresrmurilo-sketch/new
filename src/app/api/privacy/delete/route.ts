import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/server/audit";
import { apiRoute, requireApi } from "@/server/auth/guard";
import { AppError } from "@/server/errors";

const schema = z.object({ confirm: z.string() });

/** Exclusão (LGPD art. 18): remove todos os dados empresariais do Cortex, preservando usuários, configurações e auditoria. */
export const POST = apiRoute(async (req) => {
  const ctx = await requireApi("privacy:manage");
  const { confirm } = schema.parse(await req.json());
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } });
  if (confirm.trim() !== tenant.name) throw new AppError("Digite exatamente o nome da empresa para confirmar.", 422);
  const t = { tenantId: ctx.tenantId };
  await prisma.$transaction([
    prisma.payment.deleteMany({ where: t }),
    prisma.saleItem.deleteMany({ where: t }),
    prisma.accountReceivable.deleteMany({ where: t }),
    prisma.accountPayable.deleteMany({ where: t }),
    prisma.sale.deleteMany({ where: t }),
    prisma.revenue.deleteMany({ where: t }),
    prisma.expense.deleteMany({ where: t }),
    prisma.inventoryMovement.deleteMany({ where: t }),
    prisma.customer.deleteMany({ where: t }),
    prisma.supplier.deleteMany({ where: t }),
    prisma.product.deleteMany({ where: t }),
    prisma.seller.deleteMany({ where: t }),
    prisma.financialAccount.deleteMany({ where: t }),
    prisma.costCenter.deleteMany({ where: t }),
    prisma.importJob.deleteMany({ where: t }),
    prisma.importedFile.deleteMany({ where: t }),
    prisma.insight.deleteMany({ where: t }),
    prisma.forecast.deleteMany({ where: t }),
    prisma.scenario.deleteMany({ where: t }),
    prisma.report.deleteMany({ where: t }),
    prisma.conversation.deleteMany({ where: t }),
    prisma.dataSource.deleteMany({ where: { ...t, integrationId: null } }),
    prisma.tenant.update({ where: { id: ctx.tenantId }, data: { onboardingCompleted: false } }),
  ]);
  await audit(ctx, { action: "privacy.business_data_deleted", resource: "tenant", resourceId: ctx.tenantId });
  return NextResponse.json({ ok: true });
});
