import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { DataTable, Pagination, type Column } from "@/components/common/data-table";
import { EmptyState } from "@/components/common/empty-state";
import { FilterBar } from "@/components/common/filter-bar";
import { MetricCard } from "@/components/common/metric-card";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/badges";
import { buttonVariants } from "@/components/ui/button";
import { SavedViews } from "@/features/preferences/components/saved-views";
import { dayKeyInTz } from "@/lib/dates";
import { formatCurrency, formatDate, formatRelativeTime } from "@/lib/format";
import { PROPOSAL_STATUS } from "@/lib/labels";
import { parseListParams, type SearchParams } from "@/lib/list-params";
import { requireCtx } from "@/server/auth/context";
import { savedViewsFor } from "@/server/modules/preferences";
import { listProposals, proposalSignals } from "@/server/modules/proposals";

export const metadata = { title: "Propostas" };

type Row = Awaited<ReturnType<typeof listProposals>>["rows"][number];

export default async function ProposalsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireCtx("proposals.read");
  const sp = await searchParams;
  const params = parseListParams(sp, { sortable: ["number", "total", "validUntil", "createdAt"], defaultSort: "createdAt" });
  const [{ rows, total, awaiting }, members, views] = await Promise.all([
    listProposals(ctx, params),
    ctx.db.organizationMember.findMany({ where: { status: "ACTIVE" }, select: { userId: true, user: { select: { name: true } } } }),
    savedViewsFor(ctx, "proposals"),
  ]);
  const todayKey = dayKeyInTz(new Date(), ctx.org.timezone);
  const finance = ctx.permissions.has("finance.read");
  const money = (v: unknown) => (finance ? formatCurrency(v, ctx.org.currency) : "•••");
  const canWrite = ctx.permissions.has("proposals.write") && ctx.access.level === "FULL";
  const stalled = rows.filter((r) => proposalSignals(r, todayKey, ctx.org.settings.followUpDays).length).length;
  const columns: Column<Row>[] = [
    { key: "number", header: "Nº", sortable: true, cell: (r) => <span className="tabular text-muted-foreground">#{r.number}</span> },
    {
      key: "title",
      header: "Proposta",
      cell: (r) => (
        <Link href={`/app/proposals/${r.id}`} className="block min-w-[220px]">
          <span className="font-medium hover:underline">{r.title}</span>
          <span className="block text-xs text-muted-foreground">{r.client.name}</span>
        </Link>
      ),
    },
    { key: "status", header: "Status", cell: (r) => <StatusBadge map={PROPOSAL_STATUS} value={r.status} /> },
    { key: "total", header: "Total", sortable: true, align: "right", cell: (r) => money(r.total) },
    { key: "validUntil", header: "Validade", sortable: true, cell: (r) => (r.validUntil ? formatDate(r.validUntil) : "—") },
    {
      key: "signal",
      header: "Proposal Intelligence",
      cell: (r) => {
        const s = proposalSignals(r, todayKey, ctx.org.settings.followUpDays)[0];
        return s ? <span className={s.tone === "danger" ? "text-xs text-destructive" : "text-xs text-warning"}>{s.text}</span> : <span className="text-xs text-muted-foreground">{r.sentAt ? `enviada ${formatRelativeTime(r.sentAt)}` : "—"}</span>;
      },
    },
    { key: "owner", header: "Responsável", cell: (r) => r.owner?.name ?? "—" },
  ];
  return (
    <div>
      <PageHeader
        title="Propostas"
        description="Crie propostas com itens, descontos e impostos, gere PDF e acompanhe visualizações reais pelo link enviado ao cliente."
        actions={canWrite ? <Link href="/app/proposals/new" className={buttonVariants({ size: "sm" })}><Plus /> Nova proposta</Link> : null}
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <MetricCard label="Aguardando resposta" value={awaiting.count} hint={`${money(awaiting.value)} em propostas enviadas/negociação`} href="/app/proposals?status=OPEN" />
        <MetricCard label="Com alerta nesta página" value={stalled} hint="Paradas, sem follow-up ou vencendo" tone={stalled ? "warning" : "default"} />
        <MetricCard label="Total no filtro" value={total} />
      </div>
      <div className="mb-3"><SavedViews entity="proposals" views={views} /></div>
      <FilterBar
        searchPlaceholder="Buscar por nº, título ou cliente"
        filters={[
          { key: "status", label: "Status", options: [{ value: "OPEN", label: "Aguardando resposta" }, ...Object.entries(PROPOSAL_STATUS).map(([v, l]) => ({ value: v, label: l.label }))] },
          { key: "owner", label: "Responsável", options: [{ value: "me", label: "Minhas propostas" }, ...members.map((m) => ({ value: m.userId, label: m.user.name }))] },
          { key: "min", label: "Valor", options: [{ value: "20000", label: "Acima de R$ 20 mil" }, { value: "50000", label: "Acima de R$ 50 mil" }, { value: "100000", label: "Acima de R$ 100 mil" }] },
        ]}
      />
      <DataTable columns={columns} rows={rows} pathname="/app/proposals" searchParams={sp} sort={params.sort} dir={params.dir} empty={<EmptyState icon={FileText} title="Nenhuma proposta encontrada" description="Crie uma proposta manualmente ou peça ao Córtex AI uma estrutura inicial para revisar." action={canWrite ? <Link href="/app/proposals/new" className={buttonVariants({ size: "sm" })}><Plus /> Criar proposta</Link> : null} />} />
      <Pagination pathname="/app/proposals" searchParams={sp} page={params.page} pageSize={params.pageSize} total={total} />
    </div>
  );
}
