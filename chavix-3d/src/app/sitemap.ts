import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

const STATIC_PATHS = ["/", "/produtos", "/categorias", "/personalizar", "/sobre", "/contato", "/faq", "/acompanhar", "/termos", "/politica-de-privacidade", "/trocas-e-devolucoes"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, categories] = await Promise.all([
    db.product.findMany({ where: { active: true, category: { active: true } }, select: { slug: true, updatedAt: true } }),
    db.category.findMany({ where: { active: true }, select: { slug: true, updatedAt: true } }),
  ]);
  return [
    ...STATIC_PATHS.map((path) => ({ url: siteUrl(path), changeFrequency: "weekly" as const, priority: path === "/" ? 1 : 0.6 })),
    ...categories.map((c) => ({ url: siteUrl(`/categoria/${c.slug}`), lastModified: c.updatedAt, changeFrequency: "weekly" as const, priority: 0.7 })),
    ...products.map((p) => ({ url: siteUrl(`/produto/${p.slug}`), lastModified: p.updatedAt, changeFrequency: "weekly" as const, priority: 0.8 })),
  ];
}
