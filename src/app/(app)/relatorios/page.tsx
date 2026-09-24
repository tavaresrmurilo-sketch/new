import { FileText, Sparkles } from "lucide-react";
import { DataTable } from "@/components/cortex/blocks";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { prisma } from "@/lib/db";
import { fmt } from "@/lib/format";
import { requirePage } from "@/server/auth/guard";
import { REPORT_TYPES, type ReportType } from "@/server/reports/builder";
import { ReportExporter } from "./exporter";

export const metadata = { title: "Central de Relatórios" };

const DESCRIPTIONS: Partial<Record<ReportType, string>> = {
  dre: "Demonstração do resultado com análise do Cortex.",
  "fluxo-de-caixa": "Projeção diária PREVISTA para 30 dias.",
  vendas: "Indicadores e rankings comerciais.",
  clientes: "Ranking, variações e clientes inativos.",
  produtos: "Receita, volume, margem e crescimento.",
  "contas-a-pagar": "Títulos em aberto por fornecedor e vencimento.",
  "contas-a-receber": "Recebíveis, vencidos e inadimplência.",
  "resultado-gerencial": "Comparação de períodos e DRE gerencial.",
};

export default async function ReportsPage() {
  const ctx = await requirePage("reports:view");
  const canExport = ctx.permissions.has("reports:export");
  const available = (Object.keys(REPORT_TYPES) as ReportType[]).filter((t) => ctx.permissions.has(REPORT_TYPES[t].permission) && t !== "executivo" && t !== "reuniao");
  const history = await prisma.report.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: "desc" }, take: 20, include: { createdBy: { select: { name: true } } } });

  return (
    <>
      <PageHeader title="Central de Relatórios" description="Relatórios gerados a partir do Cortex, com identidade JR Consultorias. Exportação em PDF, Excel e CSV." />
      {ctx.permissions.has("dre:view") ? (
        <Card className="mb-4 border-primary/30 bg-gradient-to-br from-card to-accent/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-brand-gold" /> Relatório Executivo
            </CardTitle>
            <CardDescription>
              Resumo executivo, indicadores, resultado, variações, desempenho comercial, situação financeira, fluxo de caixa, pontos de atenção, oportunidades e conclusão — em PDF profissional.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ReportExporter type="executivo" canExport={canExport} primaryLabel="Gerar Relatório Executivo" formats={["pdf", "xlsx"]} />
          </CardContent>
        </Card>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {available.map((t) => (
          <Card key={t}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" /> {REPORT_TYPES[t].title}
              </CardTitle>
              <CardDescription>{DESCRIPTIONS[t]}</CardDescription>
            </CardHeader>
            <CardContent>
              <ReportExporter type={t} canExport={canExport} compact />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Histórico de relatórios gerados</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <DataTable
            columns={[{ key: "createdAt", label: "Data" }, { key: "title", label: "Relatório" }, { key: "period", label: "Período" }, { key: "format", label: "Formato" }, { key: "by", label: "Gerado por" }]}
            rows={history.map((h) => ({ createdAt: fmt.dateTime(h.createdAt), title: h.title, period: `${fmt.date(h.periodStart)} a ${fmt.date(h.periodEnd)}`, format: h.format, by: h.createdBy?.name ?? "—" }))}
          />
        </CardContent>
      </Card>
    </>
  );
}
