import Link from "next/link";
import { FileSignature } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { MetricCard } from "@/components/common/metric-card";
import { PageHeader, Section } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate, formatRelativeTime } from "@/lib/format";
import { RENEWAL_LABELS } from "@/lib/labels";
import { requireCtx } from "@/server/auth/context";
import { getContractRadar } from "@/server/modules/contracts";

export const metadata = { title: "Contract Radar" };

const BUCKETS = [
  { key: "expired", label: "Vencidos", tone: "danger" as const },
  { key: "d7", label: "Vencem em até 7 dias", tone: "danger" as const },
  { key: "d30", label: "Vencem em até 30 dias", tone: "warning" as const },
  { key: "d60", label: "Vencem em até 60 dias", tone: "info" as const },
  { key: "d90", label: "Vencem em até 90 dias", tone: "neutral" as const },
];

export default async function ContractRadarPage() {
  const ctx = await requireCtx("contracts.read");
  const radar = await getContractRadar(ctx);
  const finance = ctx.permissions.has("finance.read");
  const money = (v: number) => (finance ? formatCurrency(v, ctx.org.currency, { compact: true }) : "•••");
  const rows = radar.rows.filter((r) => r.bucket !== "later");
  return (
    <div className="space-y-6">
      <PageHeader title="Contract Radar" description="Contratos próximos do vencimento, vencidos e a receita potencial de renovação." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Vencidos (ativos sem renovação)" value={radar.totals.expired} tone={radar.totals.expired ? "danger" : "default"} hint={money(radar.totals.expiredValue)} />
        <MetricCard label="Vencem em 30 dias" value={radar.totals.d30} tone={radar.totals.d30 ? "warning" : "default"} />
        <MetricCard label="Vencem em 90 dias" value={radar.totals.d90} />
        <MetricCard label="Receita potencial de renovação (90 dias)" value={money(radar.totals.renewalPotential90)} hint="Valor de um novo ciclo dos contratos renováveis" />
      </div>
      {rows.length ? (
        BUCKETS.map((b) => {
          const list = rows.filter((r) => r.bucket === b.key);
          if (!list.length) return null;
          return (
            <Section key={b.key} title={b.label}>
              <ul className="divide-y rounded-lg border bg-card">
                {list.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <Link href={`/app/contracts/${c.id}`} className="font-medium hover:underline">{c.number} · {c.title}</Link>
                      <p className="text-xs text-muted-foreground">
                        <Link href={`/app/clients/${c.client.id}`} className="hover:underline">{c.client.name}</Link> · {RENEWAL_LABELS[c.renewalType]} · último contato {c.client.lastInteractionAt ? formatRelativeTime(c.client.lastInteractionAt) : "nunca"}
                      </p>
                    </div>
                    <Badge tone={b.tone}>{c.daysLeft < 0 ? `vencido há ${-c.daysLeft} dia(s)` : `${c.daysLeft} dia(s)`}</Badge>
                    <span className="text-xs text-muted-foreground">{formatDate(c.endDate)}</span>
                    <span className="tabular w-24 text-right font-medium">{money(c.value)}</span>
                    {c.renewable ? <Badge tone="success">renovável</Badge> : null}
                  </li>
                ))}
              </ul>
            </Section>
          );
        })
      ) : (
        <EmptyState icon={FileSignature} title="Nenhum contrato vencendo nos próximos 90 dias" description="Contratos com vencimento aparecem aqui automaticamente." />
      )}
    </div>
  );
}
