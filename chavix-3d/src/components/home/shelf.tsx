import type { ProductCardData } from "@/lib/catalog";
import { ProductCard } from "@/components/store/product-card";
import { SectionHeading } from "@/components/ui/section";

/** Prateleira: rolagem horizontal no celular, grade no desktop. */
export function Shelf({
  eyebrow,
  title,
  description,
  href,
  products,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  href: string;
  products: ProductCardData[];
}) {
  if (products.length === 0) return null;
  return (
    <section className="container-page pt-20">
      <SectionHeading eyebrow={eyebrow} title={title} description={description} action={{ href, label: "Ver todos" }} />
      <div className="no-scrollbar -mx-4 mt-8 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-5 sm:overflow-visible sm:px-0 lg:grid-cols-4">
        {products.slice(0, 4).map((product) => (
          <ProductCard key={product.id} product={product} className="w-[46%] shrink-0 snap-start sm:w-auto" />
        ))}
      </div>
    </section>
  );
}
