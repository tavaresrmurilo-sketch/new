import Link from "next/link";
import { Suspense } from "react";
import type { ProductCardData, ProductFilters } from "@/lib/catalog";
import { ProductGrid } from "./product-card";
import { ActiveFilters, FiltersPanel, MobileFilters, SortSelect, type FilterOptions } from "./catalog-controls";
import { ButtonLink } from "@/components/ui/button";

function pageHref(basePath: string, params: Record<string, string | string[] | undefined>, page: number) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && key !== "pagina") next.set(key, value);
  }
  if (page > 1) next.set("pagina", String(page));
  const qs = next.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function CatalogView({
  filters,
  params,
  basePath,
  options,
  result,
}: {
  filters: ProductFilters;
  params: Record<string, string | string[] | undefined>;
  basePath: string;
  options: FilterOptions;
  result: { items: ProductCardData[]; total: number; pages: number };
}) {
  const activeCount = ["categoria", "cor", "min", "max", "disponibilidade", "lancamentos", "mais-vendidos"].filter(
    (key) => params[key] && !(key === "categoria" && options.fixedCategory),
  ).length;

  return (
    <div className="grid gap-10 lg:grid-cols-[232px_1fr]">
      <aside className="hidden lg:block" aria-label="Filtros">
        <div className="sticky top-24">
          <Suspense>
            <FiltersPanel options={options} />
          </Suspense>
        </div>
      </aside>

      <div className="min-w-0">
        <div className="flex items-center justify-between gap-3 border-b border-line pb-4">
          <p className="text-sm text-muted tabular-nums">
            {result.total} {result.total === 1 ? "modelo" : "modelos"}
          </p>
          <div className="flex items-center gap-2">
            <Suspense>
              <MobileFilters options={options} activeCount={activeCount} />
              <SortSelect />
            </Suspense>
          </div>
        </div>
        <div className="mt-4 min-h-8">
          <Suspense>
            <ActiveFilters options={options} />
          </Suspense>
        </div>

        {result.items.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-line-strong px-6 py-16 text-center">
            <p className="text-lg font-medium">Nenhum chaveiro com esses filtros.</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted">Tente tirar algum filtro. Ou crie o seu do jeito que imaginou.</p>
            <div className="mt-6 flex justify-center gap-2">
              <ButtonLink href={basePath} variant="outline">
                Limpar filtros
              </ButtonLink>
              <ButtonLink href="/personalizar">Criar o meu</ButtonLink>
            </div>
          </div>
        ) : (
          <div className="mt-6">
            <ProductGrid products={result.items} priorityCount={4} />
          </div>
        )}

        {result.pages > 1 && (
          <nav className="mt-12 flex items-center justify-center gap-1" aria-label="Paginação">
            {Array.from({ length: result.pages }, (_, i) => i + 1).map((page) => (
              <Link
                key={page}
                href={pageHref(basePath, params, page)}
                aria-current={page === filters.page ? "page" : undefined}
                className={
                  page === filters.page
                    ? "grid h-10 min-w-10 place-items-center rounded-md bg-ink px-3 text-sm font-medium text-white"
                    : "grid h-10 min-w-10 place-items-center rounded-md px-3 text-sm text-ink-2 hover:bg-sunken"
                }
              >
                {page}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}
