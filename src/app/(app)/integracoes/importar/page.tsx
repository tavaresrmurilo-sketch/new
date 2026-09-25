import { DataTable } from "@/components/cortex/blocks";
import { ImportWizard } from "@/components/cortex/import-wizard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { prisma } from "@/lib/db";
import { fmt } from "@/lib/format";
import { requirePage } from "@/server/auth/guard";
import { TARGET_LABELS } from "@/server/cortex/mapping";

export const metadata = { title: "Importar planilha" };

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const { tipo } = await searchParams;
  const ctx = await requirePage("import:run");
  const jobs = await prisma.importJob.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: "desc" }, take: 15, include: { file: { select: { fileName: true } } } });
  return (
    <>
      <PageHeader title={tipo === "csv" ? "Importar CSV" : tipo === "excel" ? "Importar Excel" : "Importação de planilhas"} description="Envie o arquivo, confira colunas e tipos detectados, ajuste o mapeamento e veja quantas linhas são válidas ou rejeitadas." />
      <ImportWizard accept={tipo === "csv" ? "csv" : tipo === "excel" ? "excel" : undefined} />
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Importações recentes</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <DataTable
            columns={[{ key: "date", label: "Data" }, { key: "file", label: "Arquivo" }, { key: "target", label: "Tipo" }, { key: "status", label: "Status" }, { key: "total", label: "Linhas", format: "int", align: "right" }, { key: "processed", label: "Processadas", format: "int", align: "right" }, { key: "rejected", label: "Rejeitadas", format: "int", align: "right" }]}
            rows={jobs.map((j) => ({ date: fmt.dateTime(j.createdAt), file: j.file.fileName, target: TARGET_LABELS[j.target], status: j.status, total: j.totalRows, processed: j.processedRows, rejected: j.rejectedRows }))}
          />
        </CardContent>
      </Card>
    </>
  );
}
