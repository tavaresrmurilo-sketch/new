import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { ProductRowControls } from "@/components/admin/product-row";
import { Card, EmptyState, PageHeader, TableWrap, td, th } from "@/components/admin/ui";
import { ButtonLink } from "@/components/ui/button";
import { db } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { normalizeSearch } from "@/lib/text";

export const metadata = { title: "Produtos" };

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function AdminProductsPage({ searchParams }: Props) {
  const params = await searchParams;
  const q = params.q?.trim().slice(0, 80) ?? "";
  const where: Prisma.ProductWhereInput = {};
  if (params.categoria) where.categoryId = params.categoria;
  if (params.status === "ativos") where.active = true;
  if (params.status === "inativos") where.active = false;
  if (params.status === "sem-estoque") where.stock = { lte: 0 };
  if (q) where.AND = normalizeSearch(q).split(" ").filter(Boolean).map((t) => ({ searchText: { contains: t } }));

  const [products, categories] = await Promise.all([
    db.product.findMany({
      where,
      orderBy: [{ active: "desc" }, { createdAt: "desc" }],
      include: { category: { select: { name: true } }, images: { orderBy: { position: "asc" }, take: 1 }, _count: { select: { variants: true } } },
    }),
    db.category.findMany({ orderBy: { position: "asc" } }),
  ]);

  return (
    <>
      <PageHeader
        title="Produtos"
        description={`${products.length} ${products.length === 1 ? "produto" : "produtos"}`}
        actions={<ButtonLink href="/admin/produtos/novo">Novo produto</ButtonLink>}
      />
      {params.aviso === "excluido" && <p className="mb-4 rounded-lg bg-success-soft p-3 text-sm text-success">Produto excluído.</p>}

      <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_200px_180px_auto]" action="/admin/produtos">
        <input name="q" defaultValue={q} placeholder="Buscar por nome ou SKU" aria-label="Buscar produtos" className="h-10 rounded-md border border-line-strong bg-surface px-3 text-sm focus:border-accent focus:outline-none" />
        <select name="categoria" defaultValue={params.categoria ?? ""} aria-label="Categoria" className="h-10 rounded-md border border-line-strong bg-surface px-3 text-sm">
          <option value="">Todas as categorias</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={params.status ?? ""} aria-label="Situação" className="h-10 rounded-md border border-line-strong bg-surface px-3 text-sm">
          <option value="">Todos</option>
          <option value="ativos">Ativos</option>
          <option value="inativos">Inativos</option>
          <option value="sem-estoque">Sem estoque</option>
        </select>
        <button type="submit" className="h-10 rounded-md bg-ink px-4 text-sm font-medium text-white hover:bg-ink-2">
          Filtrar
        </button>
      </form>

      <Card padded={false}>
        {products.length === 0 ? (
          <EmptyState
            title="Nenhum produto encontrado"
            description="Cadastre seu primeiro chaveiro: nome, preço, cores e fotos."
            action={<ButtonLink href="/admin/produtos/novo">Novo produto</ButtonLink>}
          />
        ) : (
          <TableWrap>
            <thead className="border-b border-line bg-sunken/50">
              <tr>
                <th className={th}>Produto</th>
                <th className={th}>Categoria</th>
                <th className={`${th} text-right`}>Preço</th>
                <th className={th}>Estoque</th>
                <th className={th}>Ativo</th>
                <th className={th}>Destaque</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-0 hover:bg-sunken/40">
                  <td className={td}>
                    <Link href={`/admin/produtos/${p.id}`} className="flex items-center gap-3">
                      <span className="h-11 w-11 shrink-0 overflow-hidden rounded-md border border-line bg-sunken">
                        {p.images[0] && <img src={p.images[0].thumbUrl} alt="" className="h-full w-full object-cover" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-medium hover:text-accent">{p.name}</span>
                        <span className="font-mono text-xs text-muted">
                          {p.sku}
                          {p._count.variants > 0 && ` · ${p._count.variants} cores`}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className={`${td} text-muted`}>{p.category.name}</td>
                  <td className={`${td} text-right tabular-nums`}>
                    {p.promoPriceCents != null && p.promoPriceCents < p.priceCents ? (
                      <>
                        <span className="font-medium">{formatBRL(p.promoPriceCents)}</span>
                        <span className="block text-xs text-muted line-through">{formatBRL(p.priceCents)}</span>
                      </>
                    ) : (
                      <span className="font-medium">{formatBRL(p.priceCents)}</span>
                    )}
                  </td>
                  <ProductRowControls id={p.id} stock={p.stock} allowBackorder={p.allowBackorder} active={p.active} featured={p.featured} tdClass={td} />
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </>
  );
}
