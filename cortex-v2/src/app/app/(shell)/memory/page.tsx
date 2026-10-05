import Link from "next/link";
import type { MemoryCategory, MemorySource, Prisma } from "@prisma/client";
import { Brain } from "lucide-react";
import { Pagination } from "@/components/common/data-table";
import { DeleteButton } from "@/components/common/delete-button";
import { EmptyState } from "@/components/common/empty-state";
import { FilterBar } from "@/components/common/filter-bar";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { deleteMemoryFactAction } from "@/features/memory/actions";
import { formatDateTime } from "@/lib/format";
import { MEMORY_CATEGORY, MEMORY_SOURCE } from "@/lib/labels";
import { first, type SearchParams } from "@/lib/list-params";
import { can, requireCtx } from "@/server/auth/context";

export const metadata = { title: "Córtex Memory" };

const PAGE_SIZE = 30;

export default async function MemoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireCtx("clients.read");
  const sp = await searchParams;
  const page = Math.max(1, Number(first(sp.page)) || 1);
  const q = (first(sp.q) ?? "").trim().slice(0, 100);
  const category = first(sp.category);
  const source = first(sp.source);
  const where: Prisma.MemoryFactWhereInput = {};
  if (q) where.content = { contains: q, mode: "insensitive" };
  if (category && category in MEMORY_CATEGORY) where.category = category as MemoryCategory;
  if (source && source in MEMORY_SOURCE) where.source = source as MemorySource;
  const [rows, total] = await Promise.all([
    ctx.db.memoryFact.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { client: { select: { id: true, name: true } }, author: { select: { name: true } } },
    }),
    ctx.db.memoryFact.count({ where }),
  ]);
  const projectIds = [...new Set(rows.map((r) => r.projectId).filter((x): x is string => !!x))];
  const oppIds = [...new Set(rows.map((r) => r.opportunityId).filter((x): x is string => !!x))];
  const [projects, opps] = await Promise.all([
    projectIds.length ? ctx.db.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true } }) : [],
    oppIds.length ? ctx.db.opportunity.findMany({ where: { id: { in: oppIds } }, select: { id: true, title: true } }) : [],
  ]);
  const canWrite = can(ctx, "memory.write") && ctx.access.level === "FULL";
  return (
    <div className="space-y-4">
      <PageHeader
        title="Córtex Memory"
        description="Fatos importantes confirmados pela equipe — preferências, exigências, dependências e contexto de clientes e projetos. Cada fato tem fonte, autor e data, e pode ser editado ou removido no registro de origem. A IA só usa o que está aqui."
      />
      <FilterBar
        searchPlaceholder="Buscar nos fatos"
        filters={[
          { key: "category", label: "Categoria", options: Object.entries(MEMORY_CATEGORY).map(([value, label]) => ({ value, label })) },
          { key: "source", label: "Fonte", options: Object.entries(MEMORY_SOURCE).map(([value, label]) => ({ value, label })) },
        ]}
      />
      {rows.length ? (
        <ul className="divide-y rounded-lg border bg-card">
          {rows.map((f) => {
            const project = projects.find((p) => p.id === f.projectId);
            const opp = opps.find((o) => o.id === f.opportunityId);
            return (
              <li key={f.id} className="flex gap-3 px-4 py-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm">{f.content}</p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <Badge>{MEMORY_CATEGORY[f.category] ?? f.category}</Badge>
                    {f.client ? <Link href={`/app/clients/${f.client.id}?tab=memory`} className="hover:underline">{f.client.name}</Link> : null}
                    {project ? <Link href={`/app/projects/${project.id}`} className="hover:underline">{project.name}</Link> : null}
                    {opp ? <Link href={`/app/opportunities/${opp.id}`} className="hover:underline">{opp.title}</Link> : null}
                    <span>· Fonte: {MEMORY_SOURCE[f.source] ?? f.source}</span>
                    {f.sourceRef?.startsWith("meeting:") ? <Link href={`/app/meetings/${f.sourceRef.slice(8)}`} className="hover:underline">(ver reunião)</Link> : null}
                    <span>· {f.author?.name ?? "—"} · {formatDateTime(f.updatedAt, ctx.org.timezone)}</span>
                  </div>
                </div>
                {canWrite ? <DeleteButton action={deleteMemoryFactAction} id={f.id} label="fato" iconOnly description="O fato será removido da Córtex Memory e deixará de ser usado pela IA." /> : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState icon={Brain} title="Nenhum fato registrado" description="Registre fatos na aba Memória de clientes, projetos e oportunidades, ou confirme sugestões geradas a partir de reuniões." />
      )}
      <Pagination pathname="/app/memory" searchParams={sp} page={page} pageSize={PAGE_SIZE} total={total} />
    </div>
  );
}
