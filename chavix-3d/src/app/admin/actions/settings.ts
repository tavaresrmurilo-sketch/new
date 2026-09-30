"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { customBuilderConfigSchema, DEFAULT_CUSTOM_BUILDER } from "@/lib/custom-builder";
import { db } from "@/lib/db";
import { DEFAULT_SHIPPING_CONFIG, shippingConfigSchema } from "@/lib/shipping";
import { fieldErrors, firstIssue } from "@/lib/validation/common";
import { storeInfoSchema } from "@/lib/validation/admin";

type Result = { ok: true } | { ok: false; error: string; fields?: Record<string, string> };

async function ensureRow() {
  await db.storeSettings.upsert({
    where: { id: "default" },
    create: { id: "default", shipping: DEFAULT_SHIPPING_CONFIG, customBuilder: DEFAULT_CUSTOM_BUILDER },
    update: {},
  });
}

export async function saveStoreInfo(input: unknown): Promise<Result> {
  await requireAdmin();
  const parsed = storeInfoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error), fields: fieldErrors(parsed.error) };
  await ensureRow();
  const d = parsed.data;
  await db.storeSettings.update({
    where: { id: "default" },
    data: {
      storeName: d.storeName,
      whatsappNumber: d.whatsappNumber || null,
      contactEmail: d.contactEmail || null,
      instagram: d.instagram || null,
      announcement: d.announcement || null,
      pickupAddress: d.pickupAddress || null,
    },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function saveShipping(input: unknown): Promise<Result> {
  await requireAdmin();
  const parsed = shippingConfigSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error), fields: fieldErrors(parsed.error) };
  if (!parsed.data.pickup.enabled && !parsed.data.local.enabled && !parsed.data.national.enabled) {
    return { ok: false, error: "Deixe pelo menos uma forma de entrega ativa" };
  }
  await ensureRow();
  await db.storeSettings.update({ where: { id: "default" }, data: { shipping: parsed.data } });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function saveCustomBuilder(input: unknown): Promise<Result> {
  await requireAdmin();
  const parsed = customBuilderConfigSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error), fields: fieldErrors(parsed.error) };
  const ids = [...parsed.data.shapes.map((s) => s.id), ...parsed.data.colors.map((c) => c.id)];
  if (new Set(parsed.data.shapes.map((s) => s.id)).size !== parsed.data.shapes.length || new Set(parsed.data.colors.map((c) => c.id)).size !== parsed.data.colors.length) {
    return { ok: false, error: "Há identificadores repetidos em formatos ou cores" };
  }
  if (ids.length === 0) return { ok: false, error: "Cadastre formatos e cores" };
  if (parsed.data.maxQuantity < parsed.data.minQuantity) return { ok: false, error: "Quantidade máxima menor que a mínima" };
  await ensureRow();
  await db.storeSettings.update({ where: { id: "default" }, data: { customBuilder: parsed.data } });
  revalidatePath("/", "layout");
  return { ok: true };
}
