import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { effectivePriceCents } from "@/lib/pricing";
import { normalizeSearch } from "@/lib/text";

export const PAGE_SIZE = 24;

export const cardInclude = {
  category: { select: { name: true, slug: true } },
  images: { orderBy: { position: "asc" }, take: 2 },
  variants: { where: { active: true }, orderBy: { position: "asc" }, select: { name: true, colorHex: true, priceDeltaCents: true } },
} satisfies Prisma.ProductInclude;

type CardSource = Prisma.ProductGetPayload<{ include: typeof cardInclude }>;

export type Availability = "in_stock" | "on_demand" | "sold_out";

export function availabilityOf(p: { stock: number; allowBackorder: boolean }): Availability {
  if (p.stock > 0) return "in_stock";
  return p.allowBackorder ? "on_demand" : "sold_out";
}

export interface ProductCardData {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  priceCents: number;
  finalPriceCents: number;
  categoryName: string;
  isNew: boolean;
  isBestSeller: boolean;
  availability: Availability;
  productionDays: number;
  material: string;
  image: { url: string; thumbUrl: string; alt: string; width: number; height: number } | null;
  hoverImage: { thumbUrl: string; alt: string } | null;
  colors: Array<{ name: string; hex: string }>;
  hasVariantPricing: boolean;
}

export function toProductCard(p: CardSource): ProductCardData {
  const [first, second] = p.images;
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    shortDescription: p.shortDescription,
    priceCents: p.priceCents,
    finalPriceCents: effectivePriceCents(p.priceCents, p.promoPriceCents),
    categoryName: p.category.name,
    isNew: p.isNew,
    isBestSeller: p.isBestSeller,
    availability: availabilityOf(p),
    productionDays: p.productionDays,
    material: p.material,
    image: first ? { url: first.url, thumbUrl: first.thumbUrl, alt: first.alt || p.name, width: first.width, height: first.height } : null,
    hoverImage: second ? { thumbUrl: second.thumbUrl, alt: second.alt || p.name } : null,
    colors: p.variants.map((v) => ({ name: v.name, hex: v.colorHex })),
    hasVariantPricing: p.variants.some((v) => v.priceDeltaCents > 0),
  };
}

export const SORTS = {
  relevancia: "Relevância",
  "menor-preco": "Menor preço",
  "maior-preco": "Maior preço",
  "mais-vendidos": "Mais vendidos",
  recentes: "Mais recentes",
} as const;
export type SortKey = keyof typeof SORTS;

export interface ProductFilters {
  q?: string;
  category?: string;
  minPriceCents?: number;
  maxPriceCents?: number;
  color?: string;
  availability?: "pronta-entrega" | "sob-encomenda";
  isNew?: boolean;
  bestSeller?: boolean;
  sort: SortKey;
  page: number;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function reaisToCents(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n < 100_000 ? Math.round(n * 100) : undefined;
}

/** Lê os filtros da URL (/produtos?q=...&categoria=...) de forma tolerante. */
export function parseFilters(params: Record<string, string | string[] | undefined>): ProductFilters {
  const sort = first(params.ordem);
  const availability = first(params.disponibilidade);
  const page = Number(first(params.pagina) ?? "1");
  return {
    q: first(params.q)?.slice(0, 80) || undefined,
    category: first(params.categoria)?.slice(0, 80) || undefined,
    minPriceCents: reaisToCents(first(params.min)),
    maxPriceCents: reaisToCents(first(params.max)),
    color: first(params.cor)?.slice(0, 40) || undefined,
    availability: availability === "pronta-entrega" || availability === "sob-encomenda" ? availability : undefined,
    isNew: first(params.lancamentos) === "1",
    bestSeller: first(params["mais-vendidos"]) === "1",
    sort: sort && sort in SORTS ? (sort as SortKey) : "relevancia",
    page: Number.isInteger(page) && page > 0 && page < 1000 ? page : 1,
  };
}

function buildWhere(filters: ProductFilters): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [{ active: true }, { category: { active: true } }];
  if (filters.q) {
    for (const term of normalizeSearch(filters.q).split(" ").filter(Boolean).slice(0, 6)) {
      and.push({ searchText: { contains: term } });
    }
  }
  if (filters.category) and.push({ category: { slug: filters.category } });
  if (filters.minPriceCents != null) and.push({ effectivePriceCents: { gte: filters.minPriceCents } });
  if (filters.maxPriceCents != null) and.push({ effectivePriceCents: { lte: filters.maxPriceCents } });
  if (filters.color) and.push({ variants: { some: { active: true, name: { equals: filters.color, mode: "insensitive" } } } });
  if (filters.availability === "pronta-entrega") and.push({ stock: { gt: 0 } });
  if (filters.availability === "sob-encomenda") and.push({ stock: { lte: 0 }, allowBackorder: true });
  if (filters.isNew) and.push({ isNew: true });
  if (filters.bestSeller) and.push({ OR: [{ isBestSeller: true }, { salesCount: { gt: 0 } }] });
  return { AND: and };
}

function orderFor(sort: SortKey): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case "menor-preco":
      return [{ effectivePriceCents: "asc" }, { name: "asc" }];
    case "maior-preco":
      return [{ effectivePriceCents: "desc" }, { name: "asc" }];
    case "mais-vendidos":
      return [{ salesCount: "desc" }, { isBestSeller: "desc" }, { createdAt: "desc" }];
    case "recentes":
      return [{ createdAt: "desc" }];
    default:
      return [{ featured: "desc" }, { isBestSeller: "desc" }, { salesCount: "desc" }, { createdAt: "desc" }];
  }
}

/** Pontuação simples de relevância para a busca por texto. */
export function relevanceScore(name: string, searchText: string, query: string): number {
  const terms = normalizeSearch(query).split(" ").filter(Boolean);
  const normalizedName = normalizeSearch(name);
  let score = 0;
  for (const term of terms) {
    if (normalizedName.startsWith(term)) score += 6;
    else if (normalizedName.split(" ").some((word) => word.startsWith(term))) score += 4;
    else if (normalizedName.includes(term)) score += 3;
    else if (searchText.includes(term)) score += 1;
  }
  return score;
}

export async function searchProducts(filters: ProductFilters): Promise<{ items: ProductCardData[]; total: number; pages: number }> {
  const where = buildWhere(filters);
  const skip = (filters.page - 1) * PAGE_SIZE;

  if (filters.q && filters.sort === "relevancia") {
    const rows = await db.product.findMany({ where, include: cardInclude, orderBy: orderFor("relevancia"), take: 400 });
    const ranked = rows
      .map((row) => ({ row, score: relevanceScore(row.name, row.searchText, filters.q!) }))
      .sort((a, b) => b.score - a.score);
    return {
      items: ranked.slice(skip, skip + PAGE_SIZE).map(({ row }) => toProductCard(row)),
      total: ranked.length,
      pages: Math.max(1, Math.ceil(ranked.length / PAGE_SIZE)),
    };
  }

  const [rows, total] = await Promise.all([
    db.product.findMany({ where, include: cardInclude, orderBy: orderFor(filters.sort), skip, take: PAGE_SIZE }),
    db.product.count({ where }),
  ]);
  return { items: rows.map(toProductCard), total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Busca instantânea do cabeçalho: poucos resultados, rápidos. */
export async function instantSearch(q: string) {
  const terms = normalizeSearch(q).split(" ").filter(Boolean).slice(0, 5);
  if (terms.length === 0) return { products: [], categories: [] };
  const [products, categories] = await Promise.all([
    db.product.findMany({
      where: { active: true, category: { active: true }, AND: terms.map((t) => ({ searchText: { contains: t } })) },
      include: cardInclude,
      take: 40,
    }),
    db.category.findMany({ where: { active: true }, orderBy: { position: "asc" } }),
  ]);
  const ranked = products
    .map((p) => ({ p, score: relevanceScore(p.name, p.searchText, q) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(({ p }) => {
      const card = toProductCard(p);
      return { slug: card.slug, name: card.name, categoryName: card.categoryName, finalPriceCents: card.finalPriceCents, thumbUrl: card.image?.thumbUrl ?? null };
    });
  const matchingCategories = categories
    .filter((c) => terms.every((t) => normalizeSearch(c.name).includes(t)))
    .slice(0, 3)
    .map((c) => ({ slug: c.slug, name: c.name }));
  return { products: ranked, categories: matchingCategories };
}

export const listCategories = cache(async () => {
  const categories = await db.category.findMany({
    where: { active: true },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { products: { where: { active: true } } } },
      products: {
        where: { active: true, images: { some: {} } },
        orderBy: [{ featured: "desc" }, { salesCount: "desc" }],
        take: 1,
        select: { images: { orderBy: { position: "asc" }, take: 1, select: { thumbUrl: true, alt: true } } },
      },
    },
  });
  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    productCount: c._count.products,
    cover: c.products[0]?.images[0] ?? null,
  }));
});

export async function getCategoryBySlug(slug: string) {
  return db.category.findFirst({ where: { slug, active: true } });
}

/** Cores disponíveis no catálogo (para o filtro). */
export async function listColors(): Promise<Array<{ name: string; hex: string }>> {
  const variants = await db.productVariant.findMany({
    where: { active: true, product: { active: true } },
    select: { name: true, colorHex: true },
    orderBy: { name: "asc" },
  });
  const seen = new Map<string, { name: string; hex: string }>();
  for (const v of variants) {
    const key = v.name.trim().toLowerCase();
    if (!seen.has(key)) seen.set(key, { name: v.name.trim(), hex: v.colorHex });
  }
  return [...seen.values()];
}

export async function getProductsForShelf(kind: "new" | "bestsellers" | "featured", take = 8): Promise<ProductCardData[]> {
  const where: Prisma.ProductWhereInput = { active: true, category: { active: true } };
  if (kind === "new") where.isNew = true;
  if (kind === "featured") where.featured = true;
  if (kind === "bestsellers") where.OR = [{ isBestSeller: true }, { salesCount: { gt: 0 } }];
  const orderBy: Prisma.ProductOrderByWithRelationInput[] =
    kind === "bestsellers" ? [{ salesCount: "desc" }, { isBestSeller: "desc" }] : [{ createdAt: "desc" }];
  const rows = await db.product.findMany({ where, include: cardInclude, orderBy, take });
  return rows.map(toProductCard);
}

export const productDetailInclude = {
  category: true,
  images: { orderBy: { position: "asc" } },
  variants: { where: { active: true }, orderBy: { position: "asc" } },
  customizations: { orderBy: { position: "asc" } },
} satisfies Prisma.ProductInclude;

export type ProductDetail = Prisma.ProductGetPayload<{ include: typeof productDetailInclude }>;

export const getProductBySlug = cache(async (slug: string): Promise<ProductDetail | null> => {
  return db.product.findFirst({ where: { slug, active: true, category: { active: true } }, include: productDetailInclude });
});

export async function getRelatedProducts(product: { id: string; categoryId: string }, take = 4): Promise<ProductCardData[]> {
  const sameCategory = await db.product.findMany({
    where: { active: true, categoryId: product.categoryId, id: { not: product.id } },
    include: cardInclude,
    orderBy: [{ salesCount: "desc" }, { createdAt: "desc" }],
    take,
  });
  if (sameCategory.length >= take) return sameCategory.map(toProductCard);
  const others = await db.product.findMany({
    where: { active: true, category: { active: true }, id: { notIn: [product.id, ...sameCategory.map((p) => p.id)] } },
    include: cardInclude,
    orderBy: [{ featured: "desc" }, { salesCount: "desc" }],
    take: take - sameCategory.length,
  });
  return [...sameCategory, ...others].map(toProductCard);
}

/** Texto de busca normalizado de um produto. */
export function buildSearchText(parts: Array<string | null | undefined>): string {
  return normalizeSearch(parts.filter(Boolean).join(" "));
}
