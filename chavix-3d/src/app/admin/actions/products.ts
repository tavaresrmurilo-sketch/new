"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { buildSearchText } from "@/lib/catalog";
import { db } from "@/lib/db";
import { effectivePriceCents } from "@/lib/pricing";
import { deleteStoredImage } from "@/lib/storage";
import { fieldErrors } from "@/lib/validation/common";
import { productInputSchema } from "@/lib/validation/admin";
import type { Prisma } from "@/generated/prisma/client";

export type SaveResult = { ok: true; id: string } | { ok: false; error: string; fields?: Record<string, string> };

function revalidateCatalog(slug?: string) {
  revalidatePath("/", "layout");
  if (slug) revalidatePath(`/produto/${slug}`);
}

export async function saveProduct(input: unknown): Promise<SaveResult> {
  await requireAdmin();
  const parsed = productInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revise os campos destacados", fields: fieldErrors(parsed.error) };
  const p = parsed.data;

  const [slugTaken, skuTaken, category] = await Promise.all([
    db.product.findFirst({ where: { slug: p.slug, NOT: p.id ? { id: p.id } : undefined }, select: { id: true } }),
    db.product.findFirst({ where: { sku: p.sku, NOT: p.id ? { id: p.id } : undefined }, select: { id: true } }),
    db.category.findUnique({ where: { id: p.categoryId } }),
  ]);
  if (slugTaken) return { ok: false, error: "Já existe um produto com este endereço (slug)", fields: { slug: "Slug já usado" } };
  if (skuTaken) return { ok: false, error: "Já existe um produto com este SKU", fields: { sku: "SKU já usado" } };
  if (!category) return { ok: false, error: "Categoria não encontrada", fields: { categoryId: "Categoria inválida" } };

  const data = {
    name: p.name,
    slug: p.slug,
    sku: p.sku,
    categoryId: p.categoryId,
    shortDescription: p.shortDescription,
    description: p.description,
    priceCents: p.priceCents,
    promoPriceCents: p.promoPriceCents,
    effectivePriceCents: effectivePriceCents(p.priceCents, p.promoPriceCents),
    stock: p.stock,
    allowBackorder: p.allowBackorder,
    active: p.active,
    featured: p.featured,
    isNew: p.isNew,
    isBestSeller: p.isBestSeller,
    minQuantity: p.minQuantity,
    maxQuantity: p.maxQuantity,
    widthMm: p.widthMm,
    heightMm: p.heightMm,
    depthMm: p.depthMm,
    weightGrams: p.weightGrams,
    material: p.material,
    productionDays: p.productionDays,
    searchText: buildSearchText([p.name, p.shortDescription, p.sku, category.name, p.material, ...p.variants.map((v) => v.name)]),
  };

  const id = await db.$transaction(async (tx) => {
    const product = p.id ? await tx.product.update({ where: { id: p.id }, data }) : await tx.product.create({ data });

    // Cores: atualiza as existentes, cria novas, remove as que saíram
    const keepVariantIds = p.variants.map((v) => v.id).filter((v): v is string => Boolean(v));
    await tx.productVariant.deleteMany({ where: { productId: product.id, id: { notIn: keepVariantIds } } });
    for (const [position, v] of p.variants.entries()) {
      const variantData = { name: v.name, colorHex: v.colorHex.toLowerCase(), priceDeltaCents: v.priceDeltaCents, active: v.active, position };
      if (v.id) await tx.productVariant.updateMany({ where: { id: v.id, productId: product.id }, data: variantData });
      else await tx.productVariant.create({ data: { ...variantData, productId: product.id } });
    }

    // Personalizações
    const keepCustomIds = p.customizations.map((c) => c.id).filter((c): c is string => Boolean(c));
    await tx.customization.deleteMany({ where: { productId: product.id, id: { notIn: keepCustomIds } } });
    for (const [position, c] of p.customizations.entries()) {
      const customData = {
        label: c.label,
        type: c.type,
        required: c.required,
        placeholder: c.placeholder || null,
        maxLength: c.type === "TEXT" ? c.maxLength : null,
        priceCents: c.type === "TEXT" ? c.priceCents : 0,
        options: (c.type === "SELECT" ? c.options : []) as Prisma.InputJsonValue,
        position,
      };
      if (c.id) await tx.customization.updateMany({ where: { id: c.id, productId: product.id }, data: customData });
      else await tx.customization.create({ data: { ...customData, productId: product.id } });
    }
    return product.id;
  });

  revalidateCatalog(p.slug);
  revalidatePath("/admin/produtos");
  return { ok: true, id };
}

export async function toggleProductFlag(id: string, flag: "active" | "featured" | "isNew" | "isBestSeller", value: boolean) {
  await requireAdmin();
  if (!["active", "featured", "isNew", "isBestSeller"].includes(flag)) return;
  const product = await db.product.update({ where: { id: String(id) }, data: { [flag]: Boolean(value) } });
  revalidateCatalog(product.slug);
  revalidatePath("/admin/produtos");
}

export async function updateStock(id: string, stock: number): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  if (!Number.isInteger(stock) || stock < 0 || stock > 1_000_000) return { ok: false, error: "Estoque inválido" };
  const product = await db.product.update({ where: { id: String(id) }, data: { stock } });
  revalidateCatalog(product.slug);
  revalidatePath("/admin/produtos");
  return { ok: true };
}

/** Exclui de vez se nunca foi vendido; senão apenas desativa (preserva o histórico dos pedidos). */
export async function deleteProduct(id: string): Promise<void> {
  await requireAdmin();
  const product = await db.product.findUnique({ where: { id: String(id) }, include: { images: true, _count: { select: { orderItems: true } } } });
  if (!product) redirect("/admin/produtos");
  if (product._count.orderItems > 0) {
    await db.product.update({ where: { id: product.id }, data: { active: false } });
    revalidateCatalog(product.slug);
    redirect(`/admin/produtos/${product.id}?aviso=desativado`);
  }
  await db.product.delete({ where: { id: product.id } });
  for (const image of product.images) {
    await deleteStoredImage(image.storageKey);
    await deleteStoredImage(image.thumbKey);
  }
  revalidateCatalog(product.slug);
  redirect("/admin/produtos?aviso=excluido");
}

export async function deleteProductImage(imageId: string): Promise<void> {
  await requireAdmin();
  const image = await db.productImage.findUnique({ where: { id: String(imageId) }, include: { product: { select: { slug: true } } } });
  if (!image) return;
  await db.productImage.delete({ where: { id: image.id } });
  await deleteStoredImage(image.storageKey);
  await deleteStoredImage(image.thumbKey);
  revalidateCatalog(image.product.slug);
  revalidatePath(`/admin/produtos/${image.productId}`);
}

export async function updateImage(imageId: string, changes: { alt?: string; move?: "up" | "down" }): Promise<void> {
  await requireAdmin();
  const image = await db.productImage.findUnique({ where: { id: String(imageId) } });
  if (!image) return;
  if (typeof changes.alt === "string") {
    await db.productImage.update({ where: { id: image.id }, data: { alt: changes.alt.replace(/\s+/g, " ").trim().slice(0, 160) } });
  }
  if (changes.move) {
    const siblings = await db.productImage.findMany({ where: { productId: image.productId }, orderBy: { position: "asc" } });
    const index = siblings.findIndex((s) => s.id === image.id);
    const swapWith = siblings[changes.move === "up" ? index - 1 : index + 1];
    if (swapWith) {
      const order = siblings.map((s) => s.id);
      order[index] = swapWith.id;
      order[changes.move === "up" ? index - 1 : index + 1] = image.id;
      await db.$transaction(order.map((id, position) => db.productImage.update({ where: { id }, data: { position } })));
    }
  }
  const product = await db.product.findUnique({ where: { id: image.productId }, select: { slug: true } });
  revalidateCatalog(product?.slug);
  revalidatePath(`/admin/produtos/${image.productId}`);
}
