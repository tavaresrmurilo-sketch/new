import { Tags } from "lucide-react";
import type { Metadata } from "next";
import { CategoryEditButton, CategoryPin } from "@/components/admin/category-editor";
import { AdminPage, DataList, DataRow } from "@/components/admin/ui";
import { Badge, EmptyState } from "@/components/ui/misc";
import { listCategoriesAdmin } from "@/server/admin/catalog";
import { requireAdmin } from "@/server/auth/guards";
import { formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Categorias" };

const COLS = "minmax(0,2fr) minmax(0,1fr) minmax(0,0.6fr) minmax(0,0.8fr) minmax(0,0.8fr) 110px";

export default async function CategoriesPage() {
  await requireAdmin();
  const categories = await listCategoriesAdmin();

  return (
    <AdminPage
      title="Categorias"
      description="Taxonomia do mapa: nome, cor do pino, ícone e ordem dos filtros. Mudanças valem na hora para todo mundo."
      actions={<CategoryEditButton />}
    >
      {categories.length === 0 ? (
        <div className="rounded-3xl border border-border bg-surface shadow-card">
          <EmptyState icon={<Tags />} title="Nenhuma categoria" description="Rode o seed (npm run db:seed) para criar a taxonomia inicial ou crie a primeira categoria." action={<CategoryEditButton />} />
        </div>
      ) : (
        <DataList columns={COLS} head={["Categoria", "Cor", "Ordem", "Eventos", "Status", ""]}>
          {categories.map((c) => (
            <DataRow key={c.id} columns={COLS} className={c.active ? undefined : "bg-surface-2/40"}>
              <div className="flex min-w-0 items-center gap-3">
                <CategoryPin color={c.color} icon={c.icon} size="sm" />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{c.name}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">/{c.slug}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-14 text-sm lg:hidden">
                <span className="inline-flex items-center gap-1.5 font-mono text-xs">
                  <span className="size-3 rounded-full" style={{ background: c.color }} /> {c.color}
                </span>
                <span className="text-muted-foreground">ordem {c.sortOrder}</span>
                <span className="text-muted-foreground">{formatNumber(c._count.events)} eventos</span>
                {!c.active && <Badge tone="neutral">Inativa</Badge>}
              </div>
              <div className="hidden items-center gap-2 font-mono text-xs lg:flex">
                <span className="size-4 rounded-full border border-border" style={{ background: c.color }} /> {c.color}
              </div>
              <div className="hidden text-sm tabular-nums lg:block">{c.sortOrder}</div>
              <div className="hidden text-sm tabular-nums lg:block">{formatNumber(c._count.events)}</div>
              <div className="hidden lg:block">{c.active ? <Badge tone="success">Ativa</Badge> : <Badge tone="neutral">Inativa</Badge>}</div>
              <div className="pl-14 lg:pl-0 lg:text-right">
                <CategoryEditButton category={{ id: c.id, slug: c.slug, name: c.name, icon: c.icon, color: c.color, sortOrder: c.sortOrder, active: c.active }} />
              </div>
            </DataRow>
          ))}
        </DataList>
      )}
    </AdminPage>
  );
}
