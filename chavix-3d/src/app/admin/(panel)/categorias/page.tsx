import { CategoryManager } from "@/components/admin/category-manager";
import { PageHeader } from "@/components/admin/ui";
import { db } from "@/lib/db";

export const metadata = { title: "Categorias" };

export default async function AdminCategoriesPage() {
  const categories = await db.category.findMany({ orderBy: [{ position: "asc" }, { name: "asc" }], include: { _count: { select: { products: true } } } });
  return (
    <>
      <PageHeader title="Categorias" description="Crie quantas quiser. Categorias inativas somem da loja junto com seus produtos." />
      <CategoryManager
        categories={categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug, description: c.description, position: c.position, active: c.active, productCount: c._count.products }))}
      />
    </>
  );
}
