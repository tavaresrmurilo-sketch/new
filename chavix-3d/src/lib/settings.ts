import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { parseCustomBuilderConfig, type CustomBuilderConfig } from "@/lib/custom-builder";
import { parseShippingConfig, type ShippingConfig } from "@/lib/shipping";

export interface StoreSettingsView {
  storeName: string;
  whatsappNumber: string | null;
  contactEmail: string | null;
  instagram: string | null;
  announcement: string | null;
  pickupAddress: string | null;
  shipping: ShippingConfig;
  customBuilder: CustomBuilderConfig;
}

/** Configurações da loja (com padrões seguros se o seed ainda não rodou). Memoizado por requisição. */
export const getStoreSettings = cache(async (): Promise<StoreSettingsView> => {
  const row = await db.storeSettings.findUnique({ where: { id: "default" } });
  return {
    storeName: row?.storeName ?? "CHAVIX 3D",
    whatsappNumber: row?.whatsappNumber ?? null,
    contactEmail: row?.contactEmail ?? null,
    instagram: row?.instagram ?? null,
    announcement: row?.announcement ?? null,
    pickupAddress: row?.pickupAddress ?? null,
    shipping: parseShippingConfig(row?.shipping),
    customBuilder: parseCustomBuilderConfig(row?.customBuilder),
  };
});
