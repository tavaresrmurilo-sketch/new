import Link from "next/link";
import type { ProductCardData } from "@/lib/catalog";
import { Badge } from "@/components/ui/badge";
import { Price } from "@/components/ui/price";
import { cn } from "@/lib/cn";

function discountPercent(price: number, final: number) {
  return Math.round(((price - final) / price) * 100);
}

export function ProductCard({ product, priority = false, className }: { product: ProductCardData; priority?: boolean; className?: string }) {
  const onSale = product.finalPriceCents < product.priceCents;
  return (
    <article className={cn("group relative flex flex-col", className)}>
      <div className="relative aspect-square overflow-hidden rounded-xl border border-line bg-sunken">
        {product.image ? (
          <>
            <img
              src={product.image.thumbUrl}
              srcSet={`${product.image.thumbUrl} 600w, ${product.image.url} 1200w`}
              sizes="(min-width: 1024px) 280px, (min-width: 640px) 33vw, 50vw"
              alt={product.image.alt}
              width={600}
              height={600}
              loading={priority ? "eager" : "lazy"}
              fetchPriority={priority ? "high" : undefined}
              className={cn(
                "h-full w-full object-cover transition-[opacity,transform] duration-500 ease-out group-hover:scale-[1.03]",
                product.hoverImage && "group-hover:opacity-0",
              )}
            />
            {product.hoverImage && (
              <img
                src={product.hoverImage.thumbUrl}
                alt=""
                aria-hidden="true"
                width={600}
                height={600}
                loading="lazy"
                className="absolute inset-0 h-full w-full scale-[1.03] object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100"
              />
            )}
          </>
        ) : (
          <div className="layers-ink grid h-full place-items-center text-sm text-muted">Sem foto</div>
        )}
        <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1">
          {onSale && <Badge tone="dark">−{discountPercent(product.priceCents, product.finalPriceCents)}%</Badge>}
          {product.isNew && <Badge tone="accent">Novo</Badge>}
          {product.availability === "sold_out" && <Badge tone="neutral">Esgotado</Badge>}
        </div>
      </div>

      <div className="flex flex-1 flex-col px-0.5 pt-3">
        <p className="spec text-muted">{product.categoryName}</p>
        <h3 className="mt-1 text-[0.98rem] leading-snug font-medium tracking-tight group-hover:text-accent">
          <Link href={`/produto/${product.slug}`} className="after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-4 focus-visible:after:outline-accent">
            {product.name}
          </Link>
        </h3>
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <Price cents={product.finalPriceCents} compareAtCents={onSale ? product.priceCents : null} from={product.hasVariantPricing} />
          {product.colors.length > 0 && (
            <span className="flex -space-x-1 pb-1" aria-label={`${product.colors.length} cores`}>
              {product.colors.slice(0, 4).map((c) => (
                <span key={c.name} title={c.name} className="h-3.5 w-3.5 rounded-full ring-2 ring-canvas" style={{ background: c.hex }} />
              ))}
              {product.colors.length > 4 && <span className="pl-2 text-[0.7rem] text-muted">+{product.colors.length - 4}</span>}
            </span>
          )}
        </div>
        <p className="mt-1 text-[0.75rem] text-muted">
          {product.availability === "in_stock"
            ? "Pronta entrega"
            : product.availability === "on_demand"
              ? `Sob encomenda · ${product.productionDays} dias úteis`
              : "Indisponível no momento"}
        </p>
      </div>
    </article>
  );
}

export function ProductGrid({ products, priorityCount = 0 }: { products: ProductCardData[]; priorityCount?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-4">
      {products.map((product, i) => (
        <ProductCard key={product.id} product={product} priority={i < priorityCount} />
      ))}
    </div>
  );
}
