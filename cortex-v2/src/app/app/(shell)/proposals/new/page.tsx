import { PageHeader } from "@/components/common/page-header";
import { NewProposalWorkspace } from "@/features/proposals/components/new-proposal-workspace";
import { first, type SearchParams } from "@/lib/list-params";
import { requireCtx } from "@/server/auth/context";
import { aiAvailability } from "@/server/ai/availability";

export const metadata = { title: "Nova proposta" };

export default async function NewProposalPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireCtx("proposals.write");
  const sp = await searchParams;
  const clientId = first(sp.clientId);
  const opportunityId = first(sp.opportunityId);
  const [client, opp] = await Promise.all([
    clientId ? ctx.db.client.findUnique({ where: { id: clientId }, select: { id: true, name: true } }) : null,
    opportunityId ? ctx.db.opportunity.findUnique({ where: { id: opportunityId }, select: { id: true, title: true, clientId: true, client: { select: { name: true } } } }) : null,
  ]);
  const effectiveClient = client ?? (opp ? { id: opp.clientId, name: opp.client.name } : null);
  return (
    <div>
      <PageHeader title="Nova proposta" description="Preencha os itens e condições — ou gere uma estrutura com o Córtex AI e revise antes de salvar." />
      <NewProposalWorkspace
        currency={ctx.org.currency}
        aiAvailable={await aiAvailability(ctx)}
        labels={{ client: effectiveClient?.name ?? null, opportunity: opp?.title ?? null }}
        defaults={{ clientId: effectiveClient?.id, opportunityId: opp?.id ?? null, title: opp?.title ?? "" }}
      />
    </div>
  );
}
