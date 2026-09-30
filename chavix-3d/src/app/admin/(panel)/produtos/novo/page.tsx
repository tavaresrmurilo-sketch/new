import { PageHeader } from "@/components/admin/ui";
import { ProductForm } from "@/components/admin/product-form";
import { db } from "@/lib/db";

export const metadata = { title: "Novo produto" };

export default async function NewProductPage() {
  const categories = await db.category.findMany({ orderBy: { position: "asc" }, select: { id: true, name: true } });
  return (
    <>
      <PageHeader back={{ href: "/admin/produtos", label: "Produtos" }} title="Novo produto" description="Depois de criar, você adiciona as fotos." />
      {categories.length === 0 ? (
        <p className="rounded-lg bg-warning-soft p-4 text-sm text-warning">Crie uma categoria antes de cadastrar produtos.</p>
      ) : (
        <ProductForm initial={null} categories={categories} />
      )}
    </>
  );
}
