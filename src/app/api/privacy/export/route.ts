import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { audit } from "@/server/audit";
import { apiRoute, enforceRateLimit, requireApi } from "@/server/auth/guard";

export const runtime = "nodejs";

/** Portabilidade (LGPD art. 18): exporta todos os dados da empresa em JSON. Credenciais nunca são exportadas. */
export const GET = apiRoute(async () => {
  const ctx = await requireApi("privacy:manage");
  enforceRateLimit(`privacy-export:${ctx.tenantId}`, { limit: 3, windowMs: 3_600_000 });
  const t = { tenantId: ctx.tenantId };
  const [tenant, users, dataSources, customers, suppliers, products, sellers, sales, saleItems, revenues, expenses, payables, receivables, payments, accounts, costCenters, chart, knowledge, insights, conversations, messages, invoices, orders, integrations] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: ctx.tenantId } }),
    prisma.user.findMany({ where: t, select: { id: true, name: true, email: true, active: true, createdAt: true, lastLoginAt: true, role: { select: { key: true } } } }),
    prisma.dataSource.findMany({ where: t }),
    prisma.customer.findMany({ where: t }),
    prisma.supplier.findMany({ where: t }),
    prisma.product.findMany({ where: t }),
    prisma.seller.findMany({ where: t }),
    prisma.sale.findMany({ where: t }),
    prisma.saleItem.findMany({ where: t }),
    prisma.revenue.findMany({ where: t }),
    prisma.expense.findMany({ where: t }),
    prisma.accountPayable.findMany({ where: t }),
    prisma.accountReceivable.findMany({ where: t }),
    prisma.payment.findMany({ where: t }),
    prisma.financialAccount.findMany({ where: t }),
    prisma.costCenter.findMany({ where: t }),
    prisma.chartAccount.findMany({ where: t }),
    prisma.knowledgeItem.findMany({ where: t }),
    prisma.insight.findMany({ where: t }),
    prisma.conversation.findMany({ where: t }),
    prisma.message.findMany({ where: t, select: { id: true, conversationId: true, role: true, content: true, createdAt: true } }),
    prisma.invoice.findMany({ where: t }),
    prisma.order.findMany({ where: t }),
    // metadados das integrações — credenciais NUNCA são exportadas
    prisma.integration.findMany({ where: t, select: { id: true, name: true, provider: true, type: true, status: true, syncIntervalMinutes: true, lastSyncAt: true, recordsSynced: true, createdAt: true } }),
  ]);
  await audit(ctx, { action: "privacy.data_exported", resource: "tenant", resourceId: ctx.tenantId });
  const body = JSON.stringify({ exportedAt: new Date().toISOString(), tenant, users, dataSources, customers, suppliers, products, sellers, sales, saleItems, revenues, expenses, payables, receivables, payments, accounts, costCenters, chart, knowledge, insights, conversations, messages, invoices, orders, integrations });
  return new NextResponse(body, { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="jrcortex-export-${tenant?.slug}.json"`, "Cache-Control": "no-store" } });
});
