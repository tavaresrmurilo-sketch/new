import type { Metadata } from "next";
import { CatalogView } from "@/components/store/catalog-view";
import { listCategories, listColors, parseFilters, searchProducts } from "@/lib/catalog";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : null;
  return {
    title: q ? `Busca: ${q}` : "Chaveiros em impressão 3D",
    description: "Todos os chaveiros da CHAVIX 3D: games, geek, nomes, pets, casais, minimalistas e mais. Filtre por categoria, cor, preço e disponibilidade.",
    alternates: { canonical: "/produtos" },
    robots: q ? { index: false, follow: true } : undefined,
  };
}

export default async function ProductsPage({ searchParams }: Props) {
  const params = await searchParams;
  const filters = parseFilters(params);
  const [result, categories, colors] = await Promise.all([searchProducts(filters), listCategories(), listColors()]);

  const title = filters.q
    ? `Resultados para “${filters.q}”`
    : filters.isNew
      ? "Lançamentos"
      : filters.bestSeller
        ? "Mais vendidos"
        : "Todos os chaveiros";

  return (
    <div className="container-page pt-10 pb-8 sm:pt-14">
      <header className="mb-8">
        <p className="spec text-accent">Catálogo</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] sm:text-5xl">{title}</h1>
        {!filters.q && <p className="mt-3 max-w-xl text-muted">Seu estilo, agora em 3D. Filtre por tema, cor, preço ou o que já está pronto para enviar.</p>}
      </header>
      <CatalogView filters={filters} params={params} basePath="/produtos" options={{ categories, colors }} result={result} />
    </div>
  );
}
