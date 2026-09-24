import { ArrowRight, BookOpen, Database } from "lucide-react";
import Link from "next/link";
import { DataTable } from "@/components/cortex/blocks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { prisma } from "@/lib/db";
import { fmt } from "@/lib/format";
import { requirePage } from "@/server/auth/guard";

export const metadata = { title: "Cortex" };

const PIPELINE = ["Sistemas da empresa", "Conectores", "Ingestão", "Validação", "Normalização", "Cortex", "Camada analítica", "Inteligência artificial", "Dashboards · Relatórios · Chat"];

export default async function CortexPage() {
  const ctx = await requirePage("cortex:view");
  const t = { tenantId: ctx.tenantId };
  const [customers, suppliers, products, sellers, sales, items, revenues, expenses, payables, receivables, payments, accounts, costCenters, inventory, chart, knowledge, sources, imports] = await Promise.all([
    prisma.customer.count({ where: t }),
    prisma.supplier.count({ where: t }),
    prisma.product.count({ where: t }),
    prisma.seller.count({ where: t }),
    prisma.sale.count({ where: t }),
    prisma.saleItem.count({ where: t }),
    prisma.revenue.count({ where: t }),
    prisma.expense.count({ where: t }),
    prisma.accountPayable.count({ where: t }),
    prisma.accountReceivable.count({ where: t }),
    prisma.payment.count({ where: t }),
    prisma.financialAccount.count({ where: t }),
    prisma.costCenter.count({ where: t }),
    prisma.inventoryMovement.count({ where: t }),
    prisma.chartAccount.count({ where: t }),
    prisma.knowledgeItem.count({ where: { ...t, active: true } }),
    prisma.dataSource.findMany({ where: t, orderBy: { lastUpdatedAt: "desc" }, include: { _count: { select: { sales: true, expenses: true, receivables: true, payables: true, customers: true } } } }),
    prisma.importJob.aggregate({ where: t, _sum: { processedRows: true, rejectedRows: true } }),
  ]);
  const entities: [string, number][] = [
    ["Clientes", customers], ["Fornecedores", suppliers], ["Produtos/serviços", products], ["Vendedores", sellers], ["Vendas", sales], ["Itens de venda", items],
    ["Receitas", revenues], ["Despesas", expenses], ["Contas a pagar", payables], ["Contas a receber", receivables], ["Pagamentos/recebimentos", payments],
    ["Contas financeiras", accounts], ["Centros de custo", costCenters], ["Movimentações de estoque", inventory], ["Contas do plano de contas", chart], ["Itens de conhecimento", knowledge],
  ];
  return (
    <>
      <PageHeader
        title="Cortex"
        description="Núcleo central de dados: informações normalizadas, estruturadas e rastreáveis de todos os sistemas da empresa."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/cortex/conhecimento">
              <BookOpen /> Cortex Knowledge
            </Link>
          </Button>
        }
      />
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Pipeline de dados</CardTitle>
          <CardDescription>A IA nunca acessa a base bruta: ela usa ferramentas internas com consultas parametrizadas e isoladas por empresa.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-1.5">
            {PIPELINE.map((p, i) => (
              <div key={p} className="flex items-center gap-1.5">
                <span className={`rounded-md border px-2.5 py-1 text-xs ${p === "Cortex" ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}>{p}</span>
                {i < PIPELINE.length - 1 ? <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" /> : null}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        {entities.map(([l, v]) => (
          <Card key={l} className="p-3">
            <p className="text-[11px] text-muted-foreground">{l}</p>
            <p className="mt-1 text-lg font-semibold tabular">{fmt.int(v)}</p>
          </Card>
        ))}
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-4 w-4" /> Fontes de dados
            </CardTitle>
            <CardDescription>Toda resposta do Cortex informa de qual fonte vieram os números</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <DataTable
              columns={[{ key: "name", label: "Fonte" }, { key: "kind", label: "Tipo" }, { key: "updated", label: "Última atualização" }, { key: "records", label: "Registros principais", format: "int", align: "right" }]}
              rows={sources.map((s) => ({ name: s.name, kind: s.kind, updated: fmt.dateTime(s.lastUpdatedAt), records: s._count.sales + s._count.expenses + s._count.receivables + s._count.payables + s._count.customers }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Qualidade e governança</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Linhas importadas por planilha: <strong>{fmt.int(imports._sum.processedRows ?? 0)}</strong></p>
            <p>Linhas rejeitadas na validação: <strong>{fmt.int(imports._sum.rejectedRows ?? 0)}</strong></p>
            <p className="text-muted-foreground">Registros são identificados por (empresa, fonte, id externo): sincronizações repetidas não duplicam dados.</p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <Badge variant="secondary">Isolamento por tenant</Badge>
              <Badge variant="secondary">Validação Zod</Badge>
              <Badge variant="secondary">Idempotência</Badge>
              <Badge variant="secondary">Auditoria</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
