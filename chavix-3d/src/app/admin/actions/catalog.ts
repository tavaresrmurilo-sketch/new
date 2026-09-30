"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { fieldErrors } from "@/lib/validation/common";
import { categoryInputSchema, couponInputSchema } from "@/lib/validation/admin";

type Result = { ok: true } | { ok: false; error: string; fields?: Record<string, string> };

export async function saveCategory(input: unknown): Promise<Result> {
  await requireAdmin();
  const parsed = categoryInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revise os campos", fields: fieldErrors(parsed.error) };
  const c = parsed.data;
  const taken = await db.category.findFirst({ where: { slug: c.slug, NOT: c.id ? { id: c.id } : undefined } });
  if (taken) return { ok: false, error: "Já existe uma categoria com esse endereço", fields: { slug: "Slug já usado" } };
  const data = { name: c.name, slug: c.slug, description: c.description || null, position: c.position, active: c.active };
  if (c.id) await db.category.update({ where: { id: c.id }, data });
  else await db.category.create({ data });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteCategory(id: string): Promise<Result> {
  await requireAdmin();
  const count = await db.product.count({ where: { categoryId: String(id) } });
  if (count > 0) return { ok: false, error: `Esta categoria tem ${count} produto(s). Mova-os para outra categoria ou desative a categoria.` };
  await db.category.delete({ where: { id: String(id) } });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function saveCoupon(input: unknown): Promise<Result> {
  await requireAdmin();
  const parsed = couponInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revise os campos", fields: fieldErrors(parsed.error) };
  const c = parsed.data;
  const taken = await db.coupon.findFirst({ where: { code: c.code, NOT: c.id ? { id: c.id } : undefined } });
  if (taken) return { ok: false, error: "Já existe um cupom com esse código", fields: { code: "Código já usado" } };
  const toDate = (value: string | null, endOfDay: boolean) => {
    if (!value) return null;
    const date = new Date(`${value}T${endOfDay ? "23:59:59" : "00:00:00"}-03:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const startsAt = toDate(c.startsAt, false);
  const expiresAt = toDate(c.expiresAt, true);
  if (startsAt && expiresAt && expiresAt < startsAt) return { ok: false, error: "A validade termina antes de começar", fields: { expiresAt: "Data inválida" } };
  const data = {
    code: c.code,
    description: c.description || null,
    type: c.type,
    value: c.value,
    minSubtotalCents: c.minSubtotalCents,
    maxUses: c.maxUses,
    startsAt,
    expiresAt,
    active: c.active,
    firstPurchaseOnly: c.firstPurchaseOnly,
  };
  if (c.id) await db.coupon.update({ where: { id: c.id }, data });
  else await db.coupon.create({ data });
  revalidatePath("/admin/cupons");
  return { ok: true };
}

export async function toggleCoupon(id: string, active: boolean): Promise<void> {
  await requireAdmin();
  await db.coupon.update({ where: { id: String(id) }, data: { active: Boolean(active) } });
  revalidatePath("/admin/cupons");
}

export async function deleteCoupon(id: string): Promise<Result> {
  await requireAdmin();
  const used = await db.couponUsage.count({ where: { couponId: String(id) } });
  if (used > 0) {
    await db.coupon.update({ where: { id: String(id) }, data: { active: false } });
    return { ok: false, error: "Cupom já usado em pedidos: foi desativado em vez de excluído." };
  }
  await db.coupon.delete({ where: { id: String(id) } });
  revalidatePath("/admin/cupons");
  return { ok: true };
}

export async function moderateReview(id: string, status: "APPROVED" | "HIDDEN"): Promise<void> {
  await requireAdmin();
  if (status !== "APPROVED" && status !== "HIDDEN") return;
  await db.review.update({ where: { id: String(id) }, data: { status } });
  revalidatePath("/", "layout");
}
