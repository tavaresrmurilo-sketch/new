import { Hero } from "@/components/home/hero";
import { Shelf } from "@/components/home/shelf";
import { Benefits, CategoriesSection, CustomSection, FaqSection, FinalCta, HowItWorks, Reviews } from "@/components/home/sections";
import { getProductsForShelf, listCategories, productDetailInclude } from "@/lib/catalog";
import { db } from "@/lib/db";
import { getStoreSettings } from "@/lib/settings";
import { whatsappLink, WHATSAPP_MESSAGES } from "@/lib/whatsapp";
import { SITE, siteUrl } from "@/lib/site";

export default async function HomePage() {
  const [settings, spotlight, newProducts, bestSellers, categories, reviews] = await Promise.all([
    getStoreSettings(),
    db.product.findFirst({
      where: { active: true, featured: true, category: { active: true }, images: { some: {} } },
      include: productDetailInclude,
      orderBy: [{ salesCount: "desc" }, { createdAt: "asc" }],
    }),
    getProductsForShelf("new"),
    getProductsForShelf("bestsellers"),
    listCategories(),
    db.review.findMany({ where: { status: "APPROVED" }, orderBy: { createdAt: "desc" }, take: 6 }),
  ]);

  const organization = {
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    name: SITE.name,
    slogan: SITE.slogan,
    description: SITE.description,
    url: siteUrl(),
    logo: siteUrl("/brand/chavix-icon-512.png"),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organization).replace(/</g, "\\u003c") }} />
      <Hero spotlight={spotlight} />
      <Shelf eyebrow="Lançamentos" title="Acabou de sair da impressora." href="/produtos?lancamentos=1" products={newProducts} />
      <CategoriesSection categories={categories} />
      <Shelf
        eyebrow="Mais vendidos"
        title="Os que mais saem daqui."
        description="Os modelos que mais aparecem em mochila, chave de casa e presente."
        href="/produtos?ordem=mais-vendidos"
        products={bestSellers}
      />
      <CustomSection config={settings.customBuilder} whatsappHref={whatsappLink(settings.whatsappNumber, WHATSAPP_MESSAGES.custom)} />
      <HowItWorks />
      <Benefits />
      <Reviews reviews={reviews} />
      <FaqSection />
      <FinalCta whatsappHref={whatsappLink(settings.whatsappNumber, WHATSAPP_MESSAGES.general)} />
    </>
  );
}
