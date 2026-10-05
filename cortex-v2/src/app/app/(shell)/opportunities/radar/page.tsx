import Link from "next/link";
import { Radar } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { LinkTabs } from "@/components/common/link-tabs";
import { MetricCard } from "@/components/common/metric-card";
import { PageHeader } from "@/components/common/page-header";
import { RadarBadge } from "@/components/common/radar-badge";
import { formatCurrency, formatDate, formatRelativeTime } from "@/lib/format";
import { first, type SearchParams } from "@/lib/list-params";
import { toNumber } from "@/lib/utils";
import { requireCtx } from "@/server/auth/context";
import { RADAR_LABELS, type RadarCategory } from "@/server/intelligence/opportunity-score";
import { getOpportunityRadar } from "@/server/modules/opportunities";

export const metadata = { title: "Opportunity Radar" };

export default async function RadarPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireCtx("opportunities.read");
  const sp = await searchParams;
  const all = await getOpportunityRadar(ctx);
  const cat = (first(sp.category) ?? "ALL") as RadarCategory | "ALL";
  const list = cat === "ALL" ? all : all.filter((o) => o.scored.category === cat);
  const finance = ctx.permissions.has("finance.read");
  const money = (v: number) => (finance ? formatCurrency(v, ctx.org.currency, { compact: true }) : "•••");
  const sumOf = (c: RadarCategory) => all.filter((o) => o.scored.category === c).reduce((s, o) => s + toNumber(o.value), 0);
  const countOf = (c: RadarCategory) => all.filter((o) => o.scored.category === c).length;
  return (
    <div className="space-y-5">
      <PageHeader
        title="Opportunity Radar"
        description="Cada oportunidade aberta recebe um score de 0 a 100 calculado por regras transparentes: etapa, recência de atividade, prazo, proposta, mapa de decisão, reuniões e pendências."
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(["HOT", "WARM", "COLD", "AT_RISK"] as const).map((c) => (
          <MetricCard key={c} label={`${RADAR_LABELS[c].label} · ${RADAR_LABELS[c].description}`} value={countOf(c)} hint={money(sumOf(c))} href={`/app/opportunities/radar?category=${c}`} tone={c === "AT_RISK" && countOf(c) ? "danger" : "default"} />
        ))}
      </div>
      <LinkTabs
        pathname="/app/opportunities/radar"
        searchParams={sp}
        active={cat === "ALL" ? "ALL" : cat}
        tabs={[{ key: "ALL", label: "Todas", count: all.length }, ...(["HOT", "WARM", "COLD", "AT_RISK"] as const).map((c) => ({ key: c, label: RADAR_LABELS[c].label, count: countOf(c) }))].map((t) => t)}
      />
      {list.length ? (
        <div className="space-y-3">
          {list.map((o) => (
            <div key={o.id} className="grid gap-4 rounded-lg border bg-card p-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <div className="min-w-0 space-y-1.5">
                <div className="flex items-center gap-2">
                  <RadarBadge category={o.scored.category} score={o.scored.score} />
                  <span className="text-xs text-muted-foreground">{o.stage.name}</span>
                </div>
                <Link href={`/app/opportunities/${o.id}`} className="block truncate font-medium hover:underline">
                  {o.title}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {o.client.name} · {money(toNumber(o.value))} · última interação {formatRelativeTime(o.lastActivityAt)}
                  {o.expectedCloseDate ? ` · previsão ${formatDate(o.expectedCloseDate)}` : ""}
                </p>
                {o.scored.recommendations[0] ? (
                  <p className="pt-1 text-[13px]">
                    <span className="font-medium">Próxima ação:</span> {o.scored.recommendations[0].action}{" "}
                    <span className="text-muted-foreground">— {o.scored.recommendations[0].reason}</span>
                  </p>
                ) : null}
              </div>
              <ul className="space-y-0.5 text-xs">
                <li className="mb-1 font-medium text-success">Fatores positivos</li>
                {o.scored.positives.length ? o.scored.positives.slice(0, 4).map((f) => <li key={f.label}>+{f.impact} · {f.label}</li>) : <li className="text-muted-foreground">Nenhum</li>}
              </ul>
              <ul className="space-y-0.5 text-xs">
                <li className="mb-1 font-medium text-destructive">Fatores negativos</li>
                {o.scored.negatives.length ? o.scored.negatives.slice(0, 4).map((f) => <li key={f.label}>{f.impact} · {f.label}</li>) : <li className="text-muted-foreground">Nenhum</li>}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon={Radar} title="Nenhuma oportunidade nesta categoria" description="O radar considera apenas oportunidades em aberto." />
      )}
    </div>
  );
}
