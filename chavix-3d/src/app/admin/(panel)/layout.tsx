import type { Metadata } from "next";
import { AdminMobileBar, AdminSidebar } from "@/components/admin/nav";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { default: "Painel", template: "%s · Painel CHAVIX" }, robots: { index: false, follow: false } };

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();
  const [review, reviews] = await Promise.all([
    db.order.count({ where: { status: "PAYMENT_REVIEW" } }),
    db.review.count({ where: { status: "PENDING" } }),
  ]);
  const badges = { review, reviews };
  return (
    <div className="flex min-h-dvh bg-canvas">
      <AdminSidebar badges={badges} name={session.name} email={session.email} />
      <div className="min-w-0 flex-1">
        <AdminMobileBar badges={badges} name={session.name} email={session.email} />
        <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-10 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
