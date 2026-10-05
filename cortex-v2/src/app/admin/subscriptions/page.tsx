import { StatusBadge } from "@/components/common/badges";
import { Pagination } from "@/components/common/data-table";
import { PageHeader } from "@/components/common/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { SubscriptionEditor } from "@/features/admin/components/admin-ui";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/format";
import { SUBSCRIPTION_STATUS } from "@/lib/labels";
import { first, type SearchParams } from "@/lib/list-params";

export const metadata = { title: "Assinaturas" };

export default async function AdminSubs({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(first(sp.page)) || 1);
  const status = first(sp.status);
  const where = { organization: { isDemo: false }, ...(status ? { status: status as "ACTIVE" } : {}) };
  const [rows, total, plans] = await Promise.all([
    prisma.subscription.findMany({ where, orderBy: { updatedAt: "desc" }, skip: (page - 1) * 30, take: 30, include: { plan: { select: { name: true } }, organization: { select: { name: true } } } }),
    prisma.subscription.count({ where }),
    prisma.plan.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="Assinaturas" description="Status: TRIALING, ACTIVE, PAST_DUE, CANCELED, SUSPENDED. Alterações manuais ficam auditadas." />
      <div className="flex flex-wrap gap-1 text-xs">{["", "TRIALING", "ACTIVE", "PAST_DUE", "CANCELED", "SUSPENDED"].map((s) => <a key={s} href={s ? `?status=${s}` : "?"} className={`rounded-md border px-2 py-1 ${status === s || (!status && !s) ? "bg-accent" : ""}`}>{s || "Todas"}</a>)}</div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <THead><TR className="hover:bg-transparent"><TH>Empresa</TH><TH>Plano</TH><TH>Status</TH><TH>MRR</TH><TH>Provedor</TH><TH>Teste até</TH><TH>Período até</TH><TH /></TR></THead>
          <TBody>
            {rows.map((s) => (
              <TR key={s.id}>
                <TD className="font-medium">{s.organization.name}</TD>
                <TD className="text-xs">{s.plan.name}</TD>
                <TD><StatusBadge map={SUBSCRIPTION_STATUS} value={s.status} /></TD>
                <TD className="tabular text-xs">{formatCurrency(s.mrrCents / 100)}</TD>
                <TD className="text-xs">{s.provider}</TD>
                <TD className="text-xs">{s.trialEndsAt ? formatDate(s.trialEndsAt) : "—"}</TD>
                <TD className="text-xs">{s.currentPeriodEnd ? formatDate(s.currentPeriodEnd) : "—"}</TD>
                <TD><SubscriptionEditor organizationId={s.organizationId} planId={s.planId} status={s.status} trialEndsAt={s.trialEndsAt?.toISOString().slice(0, 10) ?? null} plans={plans} /></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
      <Pagination pathname="/admin/subscriptions" searchParams={sp} page={page} pageSize={30} total={total} />
    </>
  );
}
