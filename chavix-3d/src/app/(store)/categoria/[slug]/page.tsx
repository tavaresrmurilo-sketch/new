import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CatalogView } from "@/components/store/catalog-view";
import { getCategoryBySlug, listCategories, listColors, parseFilters, searchProducts } from "@/lib/catalog";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) return { title: "Categoria não encontrada" };
  return {
    title: `Chaveiros ${category.name}`,
    description: category.description ?? `Chaveiros de ${category.name} impressos em 3D pela CHAVIX 3D.`,
    alternates: { canonical: `/categoria/${category.slug}` },
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const query = await searchParams;
  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  const filters = { ...parseFilters(query), category: category.slug };
  const [result, categories, colors] = await Promise.all([searchProducts(filters), listCategories(), listColors()]);

  return (
    <div className="container-page pt-10 pb-8 sm:pt-14">
      <nav aria-label="Trilha" className="spec text-muted">
        <Link href="/categorias" className="hover:text-ink">
          Categorias
        </Link>{" "}
        / <span className="text-ink-2">{category.name}</span>
      </nav>
      <header className="mt-3 mb-8">
        <h1 className="text-3xl font-semibold tracking-[-0.035em] sm:text-5xl">{category.name}</h1>
        {category.description && <p className="mt-3 max-w-xl text-muted">{category.description}</p>}
        {category.slug === "personalizados" && (
          <Link href="/personalizar" className="mt-4 inline-flex text-sm font-medium text-accent hover:underline">
            Quer algo do zero? Crie o seu chaveiro →
          </Link>
        )}
      </header>
      <CatalogView
        filters={filters}
        params={query}
        basePath={`/categoria/${category.slug}`}
        options={{ categories, colors, fixedCategory: category.slug }}
        result={result}
      />
    </div>
  );
}
