import { CouponManager } from "@/components/admin/coupon-manager";
import { PageHeader } from "@/components/admin/ui";
import { db } from "@/lib/db";

export const metadata = { title: "Cupons" };

const toInputDate = (date: Date | null) =>
  date ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date) : null;

export default async function AdminCouponsPage() {
  const coupons = await db.coupon.findMany({ orderBy: [{ active: "desc" }, { createdAt: "desc" }] });
  return (
    <>
      <PageHeader title="Cupons" description="Percentual ou valor fixo, com validade, limite de usos e compra mínima. O desconto é sempre recalculado no servidor." />
      <CouponManager
        coupons={coupons.map((c) => ({
          id: c.id,
          code: c.code,
          description: c.description,
          type: c.type,
          value: c.value,
          minSubtotalCents: c.minSubtotalCents,
          maxUses: c.maxUses,
          usedCount: c.usedCount,
          startsAt: toInputDate(c.startsAt),
          expiresAt: toInputDate(c.expiresAt),
          active: c.active,
          firstPurchaseOnly: c.firstPurchaseOnly,
        }))}
      />
    </>
  );
}
