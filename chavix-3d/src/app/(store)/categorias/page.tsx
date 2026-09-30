import type { Metadata } from "next";
import Link from "next/link";
import { listCategories } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Categorias",
  description: "Chaveiros 3D por tema: games, geek, filmes e séries, carros, esportes, nomes, casais, pets, personalizados e minimalistas.",
  alternates: { canonical: "/categorias" },
};

export default async function CategoriesPage() {
  const categories = await listCategories();
  return (
    <div className="container-page pt-10 sm:pt-14">
      <p className="spec text-accent">Categorias</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] sm:text-5xl">Escolha pelo que você curte.</h1>
      <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((category) => (
          <li key={category.slug}>
            <Link
              href={`/categoria/${category.slug}`}
              className="group flex h-full gap-4 rounded-2xl border border-line bg-surface p-3 transition-colors hover:border-ink/25"
            >
              <span className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-sunken">
                {category.cover ? (
                  <img src={category.cover.thumbUrl} alt="" width={96} height={96} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                ) : (
                  <span className="layers-ink block h-full w-full" />
                )}
              </span>
              <span className="flex min-w-0 flex-col py-1">
                <span className="text-lg font-semibold tracking-tight group-hover:text-accent">{category.name}</span>
                {category.description && <span className="mt-1 line-clamp-2 text-sm text-muted">{category.description}</span>}
                <span className="spec mt-auto pt-2 text-muted">
                  {category.productCount} {category.productCount === 1 ? "modelo" : "modelos"}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
