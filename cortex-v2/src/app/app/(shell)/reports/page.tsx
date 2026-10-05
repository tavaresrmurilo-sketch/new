import Link from "next/link";
import { BarChart3, FileText, Scale } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { can, requireCtx } from "@/server/auth/context";
import { hasFeature } from "@/server/billing/feature-gate";
import { canSeeReport, REPORTS } from "@/server/reports/definitions";

export const metadata = { title: "Relatórios" };

export default async function ReportsPage() {
  const ctx = await requireCtx("reports.read");
  const list = REPORTS.filter((r) => canSeeReport(ctx, r));
  return (
    <div className="space-y-5">
      <PageHeader title="Relatórios" description="Relatórios calculados a partir dos dados reais do workspace, com exportação em CSV, XLSX e PDF." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((r) => (
          <Link key={r.key} href={`/app/reports/${r.key}`} className="rounded-lg border bg-card p-4 hover:bg-accent">
            <BarChart3 className="mb-2 size-5 text-primary" />
            <p className="font-medium">{r.title}</p>
            <p className="text-[13px] text-muted-foreground">{r.description}</p>
          </Link>
        ))}
        {can(ctx, "opportunities.read") ? (
          <Link href="/app/reports/win-loss" className="rounded-lg border bg-card p-4 hover:bg-accent">
            <Scale className="mb-2 size-5 text-primary" />
            <p className="font-medium">Win/Loss Intelligence</p>
            <p className="text-[13px] text-muted-foreground">Motivos de ganho e perda, concorrentes, origens e ciclo de venda.</p>
          </Link>
        ) : null}
        {can(ctx, "finance.read") && hasFeature(ctx, "executive_report") ? (
          <a href="/api/reports/executive" target="_blank" rel="noreferrer" className="rounded-lg border bg-card p-4 hover:bg-accent">
            <FileText className="mb-2 size-5 text-primary" />
            <p className="font-medium">Relatório Executivo (PDF)</p>
            <p className="text-[13px] text-muted-foreground">Resumo do mês para a diretoria: KPIs, pipeline, forecast, riscos e Pulse.</p>
          </a>
        ) : null}
      </div>
    </div>
  );
}
