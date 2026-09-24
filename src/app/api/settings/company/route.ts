import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/server/audit";
import { apiRoute, requireApi } from "@/server/auth/guard";
import { sanitizeText } from "@/server/security/sanitize";

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  cnpj: z.string().trim().max(20).regex(/^[\d./-]*$/, "CNPJ inválido").nullable().optional(),
  logoUrl: z.string().trim().url().startsWith("https://").max(500).nullable().optional().or(z.literal("")),
  segment: z.string().trim().max(120).nullable().optional(),
  currency: z.enum(["BRL", "USD", "EUR"]),
  timezone: z.string().trim().max(60).refine((tz) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Timezone inválido"),
  fiscalYearStartMonth: z.number().int().min(1).max(12),
  revenueGoalMonthly: z.number().min(0).max(1e12).nullable().optional(),
  marginGoalPct: z.number().min(-100).max(100).nullable().optional(),
  minCashBalance: z.number().min(0).max(1e12).nullable().optional(),
  onboardingCompleted: z.boolean().optional(),
});

export const PATCH = apiRoute(async (req) => {
  const ctx = await requireApi("settings:manage");
  const b = schema.parse(await req.json());
  const before = await prisma.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } });
  await prisma.tenant.update({
    where: { id: ctx.tenantId },
    data: {
      name: sanitizeText(b.name, 120),
      cnpj: b.cnpj || null,
      logoUrl: b.logoUrl || null,
      segment: b.segment ? sanitizeText(b.segment, 120) : null,
      currency: b.currency,
      timezone: b.timezone,
      fiscalYearStartMonth: b.fiscalYearStartMonth,
      revenueGoalMonthly: b.revenueGoalMonthly ?? null,
      marginGoalPct: b.marginGoalPct ?? null,
      minCashBalance: b.minCashBalance ?? null,
      ...(b.onboardingCompleted !== undefined ? { onboardingCompleted: b.onboardingCompleted } : {}),
    },
  });
  await audit(ctx, { action: "settings.company_updated", resource: "tenant", resourceId: ctx.tenantId, metadata: { before: { name: before.name, minCashBalance: before.minCashBalance?.toString() ?? null, revenueGoalMonthly: before.revenueGoalMonthly?.toString() ?? null } } });
  return NextResponse.json({ ok: true });
});
