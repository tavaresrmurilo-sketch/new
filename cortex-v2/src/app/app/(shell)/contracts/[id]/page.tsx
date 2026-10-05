import Link from "next/link";
import { notFound } from "next/navigation";
import { MetricCard } from "@/components/common/metric-card";
import { DetailList, PageHeader, Section } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/badges";
import { BreadcrumbLabel } from "@/components/shell/shell-context";
import { Card, CardContent } from "@/components/ui/card";
import { ContractActions } from "@/features/contracts/components/contract-actions";
import { DocumentList } from "@/features/documents/components/document-list";
import { DocumentUploadButton } from "@/features/documents/components/document-upload";
import { addDaysToKey, dateOnlyKey, dayKeyInTz, diffKeys } from "@/lib/dates";
import { formatCurrency, formatDate } from "@/lib/format";
import { CONTRACT_STATUS, RECEIVABLE_STATUS, RECURRENCE_LABELS, RENEWAL_LABELS } from "@/lib/labels";
import { toNumber } from "@/lib/utils";
import { requireCtx } from "@/server/auth/context";
import { getContractDetail, monthlyEquivalent } from "@/server/modules/contracts";

export default async function ContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx("contracts.read");
  const { id } = await params;
  const c = await getContractDetail(ctx, id);
  if (!c) notFound();
  const tz = ctx.org.timezone;
  const todayKey = dayKeyInTz(new Date(), tz);
  const finance = ctx.permissions.has("finance.read");
  const money = (v: unknown) => (finance ? formatCurrency(v, ctx.org.currency) : "•••");
  const writable = ctx.access.level === "FULL";
  const daysLeft = c.endDate ? diffKeys(todayKey, dateOnlyKey(c.endDate)) : null;
  const value = toNumber(c.value);
  const durationDays = c.endDate ? diffKeys(dateOnlyKey(c.startDate), dateOnlyKey(c.endDate)) : null;
  const renewSuggestion =
    c.endDate && (c.status === "ACTIVE" || c.status === "EXPIRED") && durationDays
      ? { startDate: addDaysToKey(dateOnlyKey(c.endDate), 1), endDate: addDaysToKey(dateOnlyKey(c.endDate), 1 + durationDays), value }
      : null;
  const received = c.receivables.filter((r) => r.status === "RECEIVED").reduce((s, r) => s + toNumber(r.amount), 0);
  return (
    <div className="space-y-5">
      <BreadcrumbLabel segment={id} label={c.number} />
      <PageHeader
        eyebrow={<StatusBadge map={CONTRACT_STATUS} value={c.status} />}
        title={`${c.number} · ${c.title}`}
        description={<Link href={`/app/clients/${c.client.id}`} className="hover:underline">{c.client.name}</Link>}
        actions={
          <ContractActions
            id={id}
            clientLabel={c.client.name}
            renewSuggestion={renewSuggestion}
            canWrite={writable && ctx.permissions.has("contracts.write")}
            canDelete={writable && ctx.permissions.has("contracts.delete")}
            values={{
              title: c.title,
              number: c.number,
              clientId: c.clientId,
              proposalId: c.proposalId,
              opportunityId: c.opportunityId,
              ownerId: c.ownerId,
              value,
              recurrence: c.recurrence,
              startDate: dateOnlyKey(c.startDate),
              endDate: c.endDate ? dateOnlyKey(c.endDate) : null,
              renewalType: c.renewalType,
              status: c.status,
              signedAt: c.signedAt ? dateOnlyKey(c.signedAt) : null,
              notes: c.notes,
            }}
          />
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Valor" value={money(value)} hint={RECURRENCE_LABELS[c.recurrence]} />
        <MetricCard label="Equivalente mensal" value={c.recurrence === "ONE_TIME" ? "—" : money(monthlyEquivalent(value, c.recurrence))} />
        <MetricCard label="Vencimento" value={c.endDate ? formatDate(c.endDate) : "Indeterminado"} hint={daysLeft === null ? undefined : daysLeft < 0 ? `Vencido há ${-daysLeft} dia(s)` : `Em ${daysLeft} dia(s)`} tone={daysLeft !== null && c.status === "ACTIVE" ? (daysLeft < 0 ? "danger" : daysLeft <= 30 ? "warning" : "default") : "default"} />
        <MetricCard label="Recebido" value={money(received)} hint={`${c.receivables.length} recebível(is)`} />
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <Section title="Documentos" actions={writable && ctx.permissions.has("documents.write") ? <DocumentUploadButton defaults={{ contractId: id, clientId: c.clientId, category: "CONTRACT" }} /> : null}>
            <DocumentList documents={c.documents} tz={tz} canDelete={writable && ctx.permissions.has("documents.delete")} />
          </Section>
          {finance ? (
            <Section title="Recebíveis" actions={<Link href={`/app/finance?tab=receivables`} className="text-xs text-primary hover:underline">Gerenciar no Financeiro</Link>}>
              <ul className="divide-y rounded-lg border bg-card">
                {c.receivables.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="flex-1">{r.description}</span>
                    <StatusBadge map={RECEIVABLE_STATUS} value={r.status} />
                    <span className="text-xs text-muted-foreground">{formatDate(r.dueDate)}</span>
                    <span className="tabular font-medium">{formatCurrency(r.amount, ctx.org.currency)}</span>
                  </li>
                ))}
                {!c.receivables.length ? <li className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhum recebível vinculado.</li> : null}
              </ul>
            </Section>
          ) : null}
        </div>
        <Card>
          <CardContent className="pt-4">
            <DetailList
              className="sm:grid-cols-1"
              items={[
                { label: "Início", value: formatDate(c.startDate) },
                { label: "Renovação", value: RENEWAL_LABELS[c.renewalType] },
                { label: "Assinado em", value: c.signedAt ? formatDate(c.signedAt) : "—" },
                { label: "Responsável", value: c.owner?.name ?? "—" },
                { label: "Proposta de origem", value: c.proposal ? <Link href={`/app/proposals/${c.proposal.id}`} className="hover:underline">#{c.proposal.number} · {c.proposal.title}</Link> : "—" },
                { label: "Oportunidade", value: c.opportunity ? <Link href={`/app/opportunities/${c.opportunity.id}`} className="hover:underline">{c.opportunity.title}</Link> : "—" },
                { label: "Alertas", value: c.lastAlertThreshold ? `Último alerta: ${c.lastAlertThreshold} dias` : "Nenhum alerta enviado ainda" },
              ]}
            />
            {c.notes ? <p className="mt-4 whitespace-pre-line border-t pt-3 text-sm text-muted-foreground">{c.notes}</p> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
