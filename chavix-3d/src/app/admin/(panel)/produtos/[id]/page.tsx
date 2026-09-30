import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteProduct } from "@/app/admin/actions/products";
import { ImageManager } from "@/components/admin/image-manager";
import { ProductForm } from "@/components/admin/product-form";
import { Card, PageHeader } from "@/components/admin/ui";
import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import { toCustomizationDefs } from "@/lib/cart/service";
import { db } from "@/lib/db";

export const metadata = { title: "Editar produto" };

export default async function EditProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aviso?: string }> }) {
  const { id } = await params;
  const { aviso } = await searchParams;
  const [product, categories] = await Promise.all([
    db.product.findUnique({
      where: { id },
      include: {
        images: { orderBy: { position: "asc" } },
        variants: { orderBy: { position: "asc" } },
        customizations: { orderBy: { position: "asc" } },
        _count: { select: { orderItems: true } },
      },
    }),
    db.category.findMany({ orderBy: { position: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!product) notFound();

  const defs = toCustomizationDefs(product.customizations);
  const deleteAction = deleteProduct.bind(null, product.id);

  return (
    <>
      <PageHeader
        back={{ href: "/admin/produtos", label: "Produtos" }}
        title={product.name}
        description={`${product.salesCount} unidades vendidas · ${product._count.orderItems} linhas em pedidos`}
        actions={
          <Link href={`/produto/${product.slug}`} target="_blank" className="inline-flex h-11 items-center rounded-md border border-line-strong px-4 text-sm font-medium hover:border-ink/40">
            Ver na loja ↗
          </Link>
        }
      />
      {aviso === "desativado" && (
        <p className="mb-6 rounded-lg bg-warning-soft p-3 text-sm text-warning">Este produto já foi vendido, então foi desativado em vez de excluído (o histórico dos pedidos é preservado).</p>
      )}

      <Card title="Fotos" className="mb-6">
        <ImageManager productId={product.id} images={product.images.map((i) => ({ id: i.id, thumbUrl: i.thumbUrl, alt: i.alt }))} />
      </Card>

      <ProductForm
        categories={categories}
        initial={{
          id: product.id,
          name: product.name,
          slug: product.slug,
          sku: product.sku,
          categoryId: product.categoryId,
          shortDescription: product.shortDescription,
          description: product.description,
          priceCents: product.priceCents,
          promoPriceCents: product.promoPriceCents,
          stock: product.stock,
          allowBackorder: product.allowBackorder,
          active: product.active,
          featured: product.featured,
          isNew: product.isNew,
          isBestSeller: product.isBestSeller,
          minQuantity: product.minQuantity,
          maxQuantity: product.maxQuantity,
          widthMm: product.widthMm,
          heightMm: product.heightMm,
          depthMm: product.depthMm,
          weightGrams: product.weightGrams,
          material: product.material,
          productionDays: product.productionDays,
          variants: product.variants.map((v) => ({ id: v.id, name: v.name, colorHex: v.colorHex, priceDeltaCents: v.priceDeltaCents, active: v.active })),
          customizations: product.customizations.map((c, i) => ({
            id: c.id,
            label: c.label,
            type: c.type,
            required: c.required,
            placeholder: c.placeholder ?? "",
            maxLength: c.maxLength,
            priceCents: c.priceCents,
            options: defs[i].options,
          })),
        }}
      />

      <Card title="Excluir produto" className="mt-6">
        <form action={deleteAction} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">
            {product._count.orderItems > 0
              ? "Este produto já tem vendas: ele será apenas desativado, para não apagar o histórico."
              : "Remove o produto e as fotos de vez. Não dá para desfazer."}
          </p>
          <ConfirmSubmit className="text-danger" message={product._count.orderItems > 0 ? "Desativar este produto?" : "Excluir este produto e as fotos? Não dá para desfazer."}>
            {product._count.orderItems > 0 ? "Desativar produto" : "Excluir produto"}
          </ConfirmSubmit>
        </form>
      </Card>
    </>
  );
}
