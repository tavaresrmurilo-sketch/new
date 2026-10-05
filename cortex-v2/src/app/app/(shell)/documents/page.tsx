import Link from "next/link";
import { Download, Eye, FolderOpen, Globe } from "lucide-react";
import { DataTable, Pagination, type Column } from "@/components/common/data-table";
import { DeleteButton } from "@/components/common/delete-button";
import { EmptyState } from "@/components/common/empty-state";
import { FilterBar } from "@/components/common/filter-bar";
import { PageHeader } from "@/components/common/page-header";
import { TagList } from "@/components/common/tag-list";
import { Badge } from "@/components/ui/badge";
import { deleteDocumentAction } from "@/features/documents/actions";
import { DocumentUploadButton } from "@/features/documents/components/document-upload";
import { formatBytes, formatDateTime } from "@/lib/format";
import { DOCUMENT_CATEGORY } from "@/lib/labels";
import { parseListParams, type SearchParams } from "@/lib/list-params";
import { can, requireCtx } from "@/server/auth/context";
import { checkLimit } from "@/server/billing/feature-gate";
import { listDocuments } from "@/server/modules/documents";

export const metadata = { title: "Documentos" };

type Row = Awaited<ReturnType<typeof listDocuments>>["rows"][number];

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireCtx("documents.read");
  const sp = await searchParams;
  const params = parseListParams(sp, { sortable: ["name", "sizeBytes", "createdAt"], defaultSort: "createdAt" });
  const [{ rows, total, usedBytes }, limit] = await Promise.all([listDocuments(ctx, params), checkLimit(ctx, "storage_mb", 0)]);
  const writable = ctx.access.level === "FULL";
  const canUpload = writable && can(ctx, "documents.write");
  const canDelete = writable && can(ctx, "documents.delete");
  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "Documento",
      sortable: true,
      cell: (d) => (
        <div className="min-w-[240px]">
          <span className="font-medium">{d.name}</span>
          <span className="block text-xs text-muted-foreground">{d.fileName}</span>
          {d.tags.length ? <TagList tags={d.tags} className="mt-1" /> : null}
        </div>
      ),
    },
    {
      key: "category",
      header: "Categoria",
      cell: (d) => (
        <div className="flex flex-wrap items-center gap-1">
          <Badge>{DOCUMENT_CATEGORY[d.category] ?? d.category}</Badge>
          {d.sharedWithClient ? <Badge tone="info" title="Visível no Portal do Cliente"><Globe /> Portal</Badge> : null}
        </div>
      ),
    },
    {
      key: "links",
      header: "Vinculado a",
      cell: (d) => (
        <span className="text-xs">
          {d.client ? <Link href={`/app/clients/${d.client.id}`} className="hover:underline">{d.client.name}</Link> : null}
          {d.client && d.project ? " · " : null}
          {d.project ? <Link href={`/app/projects/${d.project.id}`} className="hover:underline">{d.project.name}</Link> : null}
          {!d.client && !d.project ? <span className="text-muted-foreground">—</span> : null}
        </span>
      ),
    },
    { key: "sizeBytes", header: "Tamanho", sortable: true, align: "right", cell: (d) => <span className="tabular text-xs">{formatBytes(d.sizeBytes)}</span> },
    { key: "createdAt", header: "Enviado em", sortable: true, cell: (d) => <span className="text-xs">{formatDateTime(d.createdAt, ctx.org.timezone)}</span> },
    {
      key: "actions",
      header: <span className="sr-only">Ações</span>,
      align: "right",
      cell: (d) => (
        <div className="flex items-center justify-end gap-0.5">
          {d.mimeType === "application/pdf" || d.mimeType.startsWith("image/") ? (
            <a href={`/api/files/${d.id}?inline=1`} target="_blank" rel="noreferrer" className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={`Visualizar ${d.name}`}>
              <Eye className="size-4" />
            </a>
          ) : null}
          <a href={`/api/files/${d.id}`} className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={`Baixar ${d.name}`}>
            <Download className="size-4" />
          </a>
          {canDelete ? <DeleteButton action={deleteDocumentAction} id={d.id} label={d.name} iconOnly /> : null}
        </div>
      ),
    },
  ];
  return (
    <div className="space-y-4">
      <PageHeader
        title="Documentos"
        description={`Arquivos vinculados a clientes, projetos, propostas e contratos. Uso: ${formatBytes(usedBytes)}${limit.max !== null ? ` de ${formatBytes(limit.max * 1024 * 1024)}` : ""}.`}
        actions={canUpload ? <DocumentUploadButton /> : null}
      />
      <FilterBar searchPlaceholder="Buscar por nome, arquivo ou descrição" filters={[{ key: "category", label: "Categoria", options: Object.entries(DOCUMENT_CATEGORY).map(([value, label]) => ({ value, label })) }]} />
      <DataTable
        columns={columns}
        rows={rows}
        pathname="/app/documents"
        searchParams={sp}
        sort={params.sort}
        dir={params.dir}
        empty={<EmptyState icon={FolderOpen} title="Nenhum documento encontrado" description="Envie contratos, propostas, relatórios e arquivos de projetos. Tipos aceitos: PDF, imagens, planilhas, documentos de texto e CSV." action={canUpload ? <DocumentUploadButton /> : null} />}
      />
      <Pagination pathname="/app/documents" searchParams={sp} page={params.page} pageSize={params.pageSize} total={total} />
    </div>
  );
}
