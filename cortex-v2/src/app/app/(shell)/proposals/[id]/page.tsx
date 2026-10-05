import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Eye, Sparkles } from "lucide-react";
import { MetricCard } from "@/components/common/metric-card";
import { PageHeader, Section } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/badges";
import { BreadcrumbLabel } from "@/components/shell/shell-context";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { DocumentList } from "@/features/documents/components/document-list";
import { DocumentUploadButton } from "@/features/documents/components/document-upload";
import { ProposalActions } from "@/features/proposals/components/proposal-actions";
import { appUrl } from "@/lib/env";
import { dayKeyInTz } from "@/lib/dates";
import { formatCurrency, formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { PROPOSAL_STATUS } from "@/lib/labels";
import { calculateProposal } from "@/lib/proposal-math";
import { toNumber } from "@/lib/utils";
import { requireCtx } from "@/server/auth/context";
import { getProposalDetail, proposalSignals } from "@/server/modules/proposals";

export default async function ProposalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx("proposals.read");
  const { id } = await params;
  const p = await getProposalDetail(ctx, id);
  if (!p) notFound();
  const tz = ctx.org.timezone;
  const money = (v: number) => formatCurrency(v, p.currency);
  const items = p.items.map((i) => ({ ...i, quantity: toNumber(i.quantity), unitPrice: toNumber(i.unitPrice) }));
  const totals = calculateProposal(items, { type: p.discountType, value: toNumber(p.discountValue) }, (p.taxes as { name: string; rate: number }[]) ?? []);
  const signals = proposalSignals(p, dayKeyInTz(new Date(), tz), ctx.org.settings.followUpDays);
  const writable = ctx.access.level === "FULL";
  const pendingApproval = await ctx.db.decision.findFirst({ where: { dedupeKey: `approve-proposal:${id}`, status: "PENDING" }, select: { id: true } });
  return (
    <div className="space-y-5">
      <BreadcrumbLabel segment={id} label={`#${p.number}`} />
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            Proposta #{p.number} <StatusBadge map={PROPOSAL_STATUS} value={p.status} />
            {p.aiGenerated ? <Badge tone="primary"><Sparkles /> Estruturada com IA</Badge> : null}
            {pendingApproval ? <Badge tone="warning">Aguardando aprovação</Badge> : null}
          </span>
        }
        title={p.title}
        description={
          <>
            <Link href={`/app/clients/${p.client.id}`} className="hover:underline">{p.client.name}</Link>
            {p.opportunity ? <> · <Link href={`/app/opportunities/${p.opportunity.id}`} className="hover:underline">{p.opportunity.title}</Link></> : null}
          </>
        }
        actions={<ProposalActions id={id} status={p.status} publicUrl={p.publicToken ? `${appUrl()}/p/${p.publicToken}` : null} hasOpportunity={Boolean(p.opportunity && p.opportunity.status === "OPEN")} canWrite={writable && ctx.permissions.has("proposals.write")} canDelete={writable && ctx.permissions.has("proposals.delete")} />}
      />
      {signals.length ? (
        <div className="space-y-1.5 rounded-lg border border-warning/30 bg-warning/5 p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-warning"><AlertTriangle className="size-3.5" /> Proposal Intelligence</p>
          {signals.map((s) => <p key={s.text} className="text-sm">{s.text}</p>)}
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total" value={money(totals.total)} hint={totals.discountAmount ? `Desconto de ${money(totals.discountAmount)}` : undefined} />
        <MetricCard label="Enviada" value={p.sentAt ? formatDate(p.sentAt) : "Não enviada"} />
        <MetricCard
          label="Visualizações do cliente"
          value={p.publicToken ? p.viewCount : "—"}
          hint={p.viewedAt ? `Primeira em ${formatDateTime(p.viewedAt, tz)}` : p.publicToken ? "Ainda não aberta pelo link" : "Rastreamento disponível após o envio"}
        />
        <MetricCard label="Validade" value={p.validUntil ? formatDate(p.validUntil) : "—"} />
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          {p.scope ? (
            <Section title="Escopo">
              <div className="whitespace-pre-line rounded-lg border bg-card p-4 text-sm leading-relaxed">{p.scope}</div>
            </Section>
          ) : null}
          <Section title="Itens">
            <div className="overflow-hidden rounded-lg border bg-card">
              <Table>
                <THead>
                  <TR><TH>Descrição</TH><TH className="text-center">Unid.</TH><TH className="text-right">Qtd.</TH><TH className="text-right">Valor unit.</TH><TH className="text-right">Total</TH></TR>
                </THead>
                <TBody>
                  {items.map((i, idx) => (
                    <TR key={i.id}>
                      <TD>{i.description}</TD>
                      <TD className="text-center text-muted-foreground">{i.unit ?? ""}</TD>
                      <TD className="tabular text-right">{formatNumber(i.quantity, 2)}</TD>
                      <TD className="tabular text-right">{money(i.unitPrice)}</TD>
                      <TD className="tabular text-right font-medium">{money(totals.lines[idx] ?? 0)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          </Section>
          {p.notes ? (
            <Section title="Condições e observações">
              <div className="whitespace-pre-line rounded-lg border bg-card p-4 text-sm">{p.notes}</div>
            </Section>
          ) : null}
          <Section title="Documentos" actions={writable && ctx.permissions.has("documents.write") ? <DocumentUploadButton defaults={{ proposalId: id, clientId: p.clientId, category: "PROPOSAL" }} /> : null}>
            <DocumentList documents={p.documents} tz={tz} canDelete={writable && ctx.permissions.has("documents.delete")} />
          </Section>
        </div>
        <Card className="lg:sticky lg:top-16 lg:self-start">
          <CardContent className="space-y-2 pt-4 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular">{money(totals.subtotal)}</span></div>
            {totals.discountAmount ? <div className="flex justify-between"><span className="text-muted-foreground">Desconto</span><span className="tabular">− {money(totals.discountAmount)}</span></div> : null}
            {totals.taxes.map((t) => <div key={t.name} className="flex justify-between"><span className="text-muted-foreground">{t.name} ({t.rate}%)</span><span className="tabular">{money(t.amount)}</span></div>)}
            <div className="flex items-baseline justify-between border-t pt-2"><span className="font-medium">Total</span><span className="tabular text-lg font-semibold">{money(totals.total)}</span></div>
            <div className="space-y-1 border-t pt-3 text-xs text-muted-foreground">
              <p>Responsável: {p.owner?.name ?? "—"}</p>
              <p>Criada em {formatDateTime(p.createdAt, tz)}</p>
              {p.acceptedAt ? <p className="text-success">Aceita em {formatDateTime(p.acceptedAt, tz)}</p> : null}
              {p.rejectedAt ? <p className="text-destructive">Recusada em {formatDateTime(p.rejectedAt, tz)}{p.rejectionReason ? ` — ${p.rejectionReason}` : ""}</p> : null}
              {p.lastFollowUpAt ? <p>Último follow-up: {formatDateTime(p.lastFollowUpAt, tz)}</p> : null}
              {p.viewedAt ? <p className="inline-flex items-center gap-1"><Eye className="size-3" /> Visualizada {p.viewCount}×</p> : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
