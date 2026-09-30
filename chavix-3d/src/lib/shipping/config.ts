import { z } from "zod";

const cents = z.number().int().min(0).max(100_000_00);

export const shippingConfigSchema = z.object({
  pickup: z.object({
    enabled: z.boolean(),
    /** Endereço/instruções mostrados ao cliente depois da compra */
    instructions: z.string().max(500),
  }),
  local: z.object({
    enabled: z.boolean(),
    priceCents: cents,
    freeAboveCents: cents.nullable(),
    estimatedDays: z.number().int().min(0).max(60),
    /** Formato "Cidade/UF", ex.: "Goiânia/GO" */
    cities: z.array(z.string().min(3).max(80)).max(200),
  }),
  national: z.object({
    enabled: z.boolean(),
    priceCents: cents,
    freeAboveCents: cents.nullable(),
    estimatedDays: z.number().int().min(0).max(90),
  }),
});

export type ShippingConfig = z.infer<typeof shippingConfigSchema>;

export const DEFAULT_SHIPPING_CONFIG: ShippingConfig = {
  pickup: {
    enabled: true,
    instructions: "Combinamos o local e o horário da retirada pelo WhatsApp assim que o pedido ficar pronto.",
  },
  local: { enabled: false, priceCents: 1000, freeAboveCents: 12000, estimatedDays: 2, cities: [] },
  national: { enabled: true, priceCents: 2490, freeAboveCents: 19900, estimatedDays: 8 },
};

export function parseShippingConfig(value: unknown): ShippingConfig {
  const parsed = shippingConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_SHIPPING_CONFIG;
}
