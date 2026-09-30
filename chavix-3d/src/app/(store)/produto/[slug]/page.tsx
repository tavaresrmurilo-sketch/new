import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductGallery } from "@/components/store/product-gallery";
import { ProductCard } from "@/components/store/product-card";
import { PurchasePanel } from "@/components/store/purchase-panel";
import { Badge } from "@/components/ui/badge";
import { Price } from "@/components/ui/price";
import { SectionHeading } from "@/components/ui/section";
import { availabilityOf, getProductBySlug, getRelatedProducts } from "@/lib/catalog";
import { toCustomizationDefs } from "@/lib/cart/service";
import { effectivePriceCents } from "@/lib/pricing";
import { getStoreSettings } from "@/lib/settings";
import { absoluteUrl, siteUrl } from "@/lib/site";
import { whatsappLink, WHATSAPP_MESSAGES } from "@/lib/whatsapp";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Produto não encontrado" };
  const image = product.images[0];
  return {
    title: `${product.name} — chaveiro 3D`,
    description: product.shortDescription,
    alternates: { canonical: `/produto/${product.slug}` },
    openGraph: {
      title: `${product.name} · CHAVIX 3D`,
      description: product.shortDescription,
      url: siteUrl(`/produto/${product.slug}`),
      images: image ? [{ url: absoluteUrl(image.url), width: image.width, height: image.height, alt: image.alt }] : undefined,
    },
  };
}

function mm(value: number | null) {
  return value == null ? null : value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const [settings, related] = await Promise.all([getStoreSettings(), getRelatedProducts(product)]);
  const finalPrice = effectivePriceCents(product.priceCents, product.promoPriceCents);
  const availability = availabilityOf(product);
  const url = siteUrl(`/produto/${product.slug}`);
  const hasVariantPricing = product.variants.some((v) => v.priceDeltaCents > 0);
  const dims = [product.widthMm, product.heightMm, product.depthMm].every((v) => v != null)
    ? `${mm(product.widthMm)} × ${mm(product.heightMm)} × ${mm(product.depthMm)} mm`
    : null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.shortDescription,
    sku: product.sku,
    image: product.images.map((i) => absoluteUrl(i.url)),
    category: product.category.name,
    material: product.material,
    brand: { "@type": "Brand", name: "CHAVIX 3D" },
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "BRL",
      price: (finalPrice / 100).toFixed(2),
      availability:
        availability === "in_stock"
          ? "https://schema.org/InStock"
          : availability === "on_demand"
            ? "https://schema.org/PreOrder"
            : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
    },
  };

  const specs: Array<[string, string]> = [
    ["Material", product.material],
    ...(dims ? ([["Medidas", dims]] as Array<[string, string]>) : []),
    ...(product.weightGrams != null ? ([["Peso", `${mm(product.weightGrams)} g`]] as Array<[string, string]>) : []),
    ["Produção", `${product.productionDays} ${product.productionDays === 1 ? "dia útil" : "dias úteis"} após o pagamento`],
    ["SKU", product.sku],
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="container-page pt-6 sm:pt-10">
        <nav aria-label="Trilha" className="spec mb-6 truncate text-muted">
          <Link href="/produtos" className="hover:text-ink">
            Chaveiros
          </Link>{" "}
          /{" "}
          <Link href={`/categoria/${product.category.slug}`} className="hover:text-ink">
            {product.category.name}
          </Link>{" "}
          / <span className="text-ink-2">{product.name}</span>
        </nav>

        <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
          <ProductGallery images={product.images} name={product.name} />

          <div className="lg:py-2">
            <div className="flex flex-wrap gap-1.5">
              {product.isNew && <Badge tone="accent">Lançamento</Badge>}
              {product.isBestSeller && <Badge tone="neutral">Mais vendido</Badge>}
              {availability === "in_stock" && <Badge tone="success">Pronta entrega</Badge>}
              {availability === "on_demand" && <Badge tone="warning">Sob encomenda</Badge>}
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] sm:text-[2.6rem] sm:leading-[1.05]">{product.name}</h1>
            <p className="mt-3 text-[1.05rem] leading-relaxed text-muted">{product.shortDescription}</p>
            <div className="mt-5">
              <Price cents={finalPrice} compareAtCents={finalPrice < product.priceCents ? product.priceCents : null} from={hasVariantPricing} size="xl" />
              <p className="mt-1 text-sm text-muted">No Pix, com QR Code gerado na hora.</p>
            </div>

            <div className="mt-8 border-t border-line pt-8">
              <PurchasePanel
                product={{
                  id: product.id,
                  name: product.name,
                  priceCents: product.priceCents,
                  finalPriceCents: finalPrice,
                  minQuantity: product.minQuantity,
                  maxQuantity: product.allowBackorder ? product.maxQuantity : Math.min(product.maxQuantity, product.stock),
                  availability,
                  productionDays: product.productionDays,
                  variants: product.variants.map((v) => ({ id: v.id, name: v.name, colorHex: v.colorHex, priceDeltaCents: v.priceDeltaCents })),
                  customizations: toCustomizationDefs(product.customizations).map((c) => ({
                    ...c,
                    placeholder: product.customizations.find((x) => x.id === c.id)?.placeholder ?? null,
                  })),
                }}
                whatsappHref={whatsappLink(settings.whatsappNumber, WHATSAPP_MESSAGES.product(product.name, siteUrl(`/produto/${product.slug}`)))}
              />
            </div>

            <div className="mt-8 rounded-xl border border-line bg-surface p-4 text-sm">
              <p className="font-medium">
                {availability === "in_stock"
                  ? `Pronta entrega · ${product.stock} ${product.stock === 1 ? "unidade" : "unidades"}`
                  : availability === "on_demand"
                    ? "Produzido sob encomenda"
                    : "Esgotado"}
              </p>
              <p className="mt-1 text-muted">
                Prazo de produção: até {product.productionDays} {product.productionDays === 1 ? "dia útil" : "dias úteis"} depois da confirmação do Pix. O frete é calculado no checkout.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-16 grid gap-10 border-t border-line pt-12 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
          <section>
            <h2 className="text-xl font-semibold tracking-tight">Sobre este chaveiro</h2>
            <div className="mt-4 space-y-4 leading-relaxed whitespace-pre-line text-ink-2">{product.description}</div>
          </section>
          <section>
            <h2 className="text-xl font-semibold tracking-tight">Ficha técnica</h2>
            <dl className="mt-4 divide-y divide-line border-y border-line">
              {specs.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-6 py-3 text-sm">
                  <dt className="spec pt-0.5 text-muted">{label}</dt>
                  <dd className="text-right font-mono text-[0.82rem] text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        {related.length > 0 && (
          <section className="mt-20">
            <SectionHeading eyebrow="Você também pode curtir" title="Combina com este" action={{ href: `/categoria/${product.category.slug}`, label: `Mais de ${product.category.name}` }} />
            <div className="mt-8 grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-5 lg:grid-cols-4">
              {related.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
