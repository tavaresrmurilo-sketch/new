import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { BreadcrumbLabel } from "@/components/shell/shell-context";
import { ProposalEditor } from "@/features/proposals/components/proposal-editor";
import { dateOnlyKey } from "@/lib/dates";
import { toNumber } from "@/lib/utils";
import { requireCtx } from "@/server/auth/context";
import { getProposalDetail } from "@/server/modules/proposals";

export default async function EditProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx("proposals.write");
  const { id } = await params;
  const p = await getProposalDetail(ctx, id);
  if (!p) notFound();
  if (p.status === "ACCEPTED" || p.status === "REJECTED") redirect(`/app/proposals/${id}`);
  return (
    <div>
      <BreadcrumbLabel segment={id} label={`#${p.number}`} />
      <PageHeader title={`Editar proposta #${p.number}`} />
      <ProposalEditor
        id={id}
        currency={p.currency}
        labels={{ client: p.client.name, opportunity: p.opportunity?.title ?? null }}
        defaultValues={{
          title: p.title,
          clientId: p.clientId,
          opportunityId: p.opportunityId,
          contactId: p.contactId,
          ownerId: p.ownerId,
          scope: p.scope,
          notes: p.notes,
          validUntil: p.validUntil ? dateOnlyKey(p.validUntil) : null,
          discountType: p.discountType,
          discountValue: toNumber(p.discountValue),
          taxes: (p.taxes as { name: string; rate: number }[]) ?? [],
          items: p.items.map((i) => ({ description: i.description, unit: i.unit, quantity: toNumber(i.quantity), unitPrice: toNumber(i.unitPrice) })),
          aiGenerated: p.aiGenerated,
        }}
      />
    </div>
  );
}
