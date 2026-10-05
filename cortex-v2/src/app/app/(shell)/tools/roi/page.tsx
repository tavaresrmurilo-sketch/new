import Link from "next/link";
import { DeleteButton } from "@/components/common/delete-button";
import { PageHeader, Section } from "@/components/common/page-header";
import { deleteRoiScenarioAction } from "@/features/roi/actions";
import { RoiCalculator } from "@/features/roi/components/roi-calculator";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/format";
import type { RoiInputs } from "@/lib/roi";
import { first, type SearchParams } from "@/lib/list-params";
import { can, requireCtx } from "@/server/auth/context";

export const metadata = { title: "Calculadora de ROI" };

export default async function RoiPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireCtx("opportunities.read");
  const sp = await searchParams;
  const scenarios = await ctx.db.roiScenario.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  const clientIds = [...new Set(scenarios.map((s) => s.clientId).filter((x): x is string => !!x))];
  const clients = clientIds.length ? await ctx.db.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true } }) : [];
  const loaded = scenarios.find((s) => s.id === first(sp.scenario));
  const canSave = can(ctx, "opportunities.write") && ctx.access.level === "FULL";
  return (
    <div className="space-y-6">
      <PageHeader title="Calculadora de ROI" description="Monte cenários de retorno para apoiar propostas: investimento, custos, economia e receita adicional. Cálculo determinístico e transparente." />
      <RoiCalculator key={loaded?.id ?? "new"} currency={ctx.org.currency} canSave={canSave} initial={loaded ? (loaded.inputs as unknown as RoiInputs) : undefined} />
      <Section title="Cenários salvos">
        {scenarios.length ? (
          <ul className="divide-y rounded-lg border bg-card">
            {scenarios.map((s) => {
              const r = s.results as { roiPct?: number | null; paybackMonths?: number | null; netGain?: number };
              const client = clients.find((c) => c.id === s.clientId);
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <Link href={`/app/tools/roi?scenario=${s.id}`} className="font-medium hover:underline">{s.name}</Link>
                    <p className="text-xs text-muted-foreground">
                      {client ? <><Link href={`/app/clients/${client.id}`} className="hover:underline">{client.name}</Link> · </> : null}
                      ROI {r.roiPct == null ? "—" : `${formatNumber(r.roiPct, 1)}%`} · payback {r.paybackMonths == null ? "—" : `${formatNumber(r.paybackMonths, 1)} meses`} · ganho líquido {formatCurrency(r.netGain ?? 0, ctx.org.currency)} · {formatDateTime(s.createdAt, ctx.org.timezone)}
                    </p>
                  </div>
                  {canSave ? <DeleteButton action={deleteRoiScenarioAction} id={s.id} label="cenário" iconOnly description="O cenário será excluído permanentemente." /> : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">Nenhum cenário salvo.</p>
        )}
      </Section>
    </div>
  );
}
