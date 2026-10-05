import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { AcceptProposal } from "@/features/public/accept-proposal";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { calculateProposal } from "@/lib/proposal-math";
import { toNumber } from "@/lib/utils";
import { trackPublicView } from "@/server/modules/proposals";
import { requestInfo } from "@/server/request";
import { rateLimit } from "@/server/security/rate-limit";

export const dynamic = "force-dynamic";
export const metadata = { title: "Proposta comercial", robots: { index: false, follow: false } };

export default async function PublicProposalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { ip } = await requestInfo();
  const rl = await rateLimit(`proposal-view:${ip ?? "unknown"}`, 60, 600);
  if (!rl.ok) return <p className="p-10 text-center text-sm">Muitas requisições. Tente novamente em alguns minutos.</p>;
  const tracked = await trackPublicView(token);
  if (!tracked) notFound();
  const p = await prisma.proposal.findUnique({
    where: { id: tracked.id },
    include: { items: { orderBy: { sortOrder: "asc" } }, client: { select: { name: true } }, owner: { select: { name: true, email: true } } },
  });
  if (!p) notFound();
  const org = await prisma.organization.findUnique({ where: { id: p.organizationId }, select: { name: true } });
  const items = p.items.map((i) => ({ ...i, quantity: toNumber(i.quantity), unitPrice: toNumber(i.unitPrice) }));
  const t = calculateProposal(items, { type: p.discountType, value: toNumber(p.discountValue) }, (p.taxes as { name: string; rate: number }[]) ?? []);
  const money = (v: number) => formatCurrency(v, p.currency);
  const open = ["SENT", "VIEWED", "NEGOTIATION"].includes(p.status);
  return (
    <div className="min-h-dvh bg-subtle py-10">
      <div className="mx-auto max-w-3xl space-y-6 rounded-xl border bg-background p-6 shadow-sm sm:p-10">
        <header className="flex items-start justify-between gap-4 border-b pb-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-primary">Proposta comercial nº {p.number}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{p.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {org?.name} para {p.client.name}
              {p.validUntil ? ` · válida até ${formatDate(p.validUntil)}` : ""}
            </p>
          </div>
          <Logo compact />
        </header>
        {p.scope ? (
          <section>
            <h2 className="mb-2 text-sm font-semibold">Escopo</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed">{p.scope}</p>
          </section>
        ) : null}
        <section>
          <h2 className="mb-2 text-sm font-semibold">Investimento</h2>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-subtle text-xs text-muted-foreground">
                <tr><th className="px-3 py-2 text-left">Descrição</th><th className="px-3 py-2 text-right">Qtd.</th><th className="px-3 py-2 text-right">Valor unit.</th><th className="px-3 py-2 text-right">Total</th></tr>
              </thead>
              <tbody>
                {items.map((i, idx) => (
                  <tr key={i.id} className="border-t">
                    <td className="px-3 py-2">{i.description}</td>
                    <td className="tabular px-3 py-2 text-right">{formatNumber(i.quantity, 2)} {i.unit ?? ""}</td>
                    <td className="tabular px-3 py-2 text-right">{money(i.unitPrice)}</td>
                    <td className="tabular px-3 py-2 text-right">{money(t.lines[idx] ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ml-auto mt-3 w-full max-w-xs space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular">{money(t.subtotal)}</span></div>
            {t.discountAmount ? <div className="flex justify-between"><span className="text-muted-foreground">Desconto</span><span className="tabular">− {money(t.discountAmount)}</span></div> : null}
            {t.taxes.map((x) => <div key={x.name} className="flex justify-between"><span className="text-muted-foreground">{x.name} ({x.rate}%)</span><span className="tabular">{money(x.amount)}</span></div>)}
            <div className="flex justify-between border-t pt-1 text-base font-semibold"><span>Total</span><span className="tabular">{money(t.total)}</span></div>
          </div>
        </section>
        {p.notes ? (
          <section>
            <h2 className="mb-2 text-sm font-semibold">Condições</h2>
            <p className="whitespace-pre-line text-sm">{p.notes}</p>
          </section>
        ) : null}
        <section className="rounded-lg border bg-subtle/60 p-5">
          {p.status === "ACCEPTED" ? (
            <p className="flex items-center gap-2 text-sm font-medium text-success"><CheckCircle2 className="size-5" /> Proposta aceita em {formatDate(p.acceptedAt)}. Obrigado!</p>
          ) : open ? (
            <AcceptProposal token={token} />
          ) : (
            <p className="text-sm text-muted-foreground">Esta proposta não está mais disponível para aceite.</p>
          )}
          {p.owner ? <p className="mt-3 text-xs text-muted-foreground">Dúvidas? Fale com {p.owner.name}{p.owner.email ? ` (${p.owner.email})` : ""}.</p> : null}
        </section>
        <a href={`/api/public/proposals/${token}/pdf`} className="block text-center text-xs text-primary hover:underline">Baixar em PDF</a>
      </div>
    </div>
  );
}
