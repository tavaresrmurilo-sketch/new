import { z } from "zod";
import { cleanText, optionalText, text } from "./common";

const cents = z.number().int().min(0).max(10_000_000);
const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use letras minúsculas, números e hífens")
  .max(80);
const measure = z.number().min(0).max(10_000).nullable();

export const variantInputSchema = z.object({
  id: z.string().max(40).optional(),
  name: text(1, 40, "Informe o nome da cor"),
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida"),
  priceDeltaCents: z.number().int().min(-1_000_000).max(1_000_000),
  active: z.boolean(),
});

export const customizationInputSchema = z
  .object({
    id: z.string().max(40).optional(),
    label: text(1, 60, "Informe o nome da personalização"),
    type: z.enum(["TEXT", "SELECT"]),
    required: z.boolean(),
    placeholder: optionalText(60),
    maxLength: z.number().int().min(1).max(80).nullable(),
    priceCents: cents,
    options: z.array(z.object({ label: text(1, 40), priceCents: cents })).max(60),
  })
  .refine((c) => c.type !== "SELECT" || c.options.length > 0, { message: "Adicione ao menos uma opção", path: ["options"] });

export const productInputSchema = z
  .object({
    id: z.string().max(40).optional(),
    name: text(2, 80, "Informe o nome"),
    slug,
    sku: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{2,32}$/, "SKU: letras, números e hífen"),
    categoryId: z.string().min(1, "Escolha a categoria").max(40),
    shortDescription: text(5, 160, "Escreva uma descrição curta"),
    description: z
      .string()
      .transform((v) => v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim())
      .pipe(z.string().min(10, "Escreva a descrição").max(5000)),
    priceCents: cents.refine((v) => v > 0, "O preço precisa ser maior que zero"),
    promoPriceCents: cents.nullable(),
    stock: z.number().int().min(0).max(1_000_000),
    allowBackorder: z.boolean(),
    active: z.boolean(),
    featured: z.boolean(),
    isNew: z.boolean(),
    isBestSeller: z.boolean(),
    minQuantity: z.number().int().min(1).max(1000),
    maxQuantity: z.number().int().min(1).max(5000),
    widthMm: measure,
    heightMm: measure,
    depthMm: measure,
    weightGrams: measure,
    material: text(2, 40, "Informe o material"),
    productionDays: z.number().int().min(0).max(90),
    variants: z.array(variantInputSchema).max(30),
    customizations: z.array(customizationInputSchema).max(20),
  })
  .refine((p) => p.promoPriceCents == null || p.promoPriceCents < p.priceCents, {
    message: "O preço promocional precisa ser menor que o preço cheio",
    path: ["promoPriceCents"],
  })
  .refine((p) => p.maxQuantity >= p.minQuantity, { message: "Máximo precisa ser maior ou igual ao mínimo", path: ["maxQuantity"] });

export type ProductInput = z.infer<typeof productInputSchema>;

export const categoryInputSchema = z.object({
  id: z.string().max(40).optional(),
  name: text(2, 60, "Informe o nome"),
  slug,
  description: optionalText(240),
  position: z.number().int().min(0).max(1000),
  active: z.boolean(),
});

export const couponInputSchema = z
  .object({
    id: z.string().max(40).optional(),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{3,30}$/, "Código: 3 a 30 letras, números, _ ou -"),
    description: optionalText(120),
    type: z.enum(["PERCENT", "FIXED"]),
    value: z.number().int().min(1).max(10_000_000),
    minSubtotalCents: cents.nullable(),
    maxUses: z.number().int().min(1).max(1_000_000).nullable(),
    startsAt: z.string().max(30).nullable(),
    expiresAt: z.string().max(30).nullable(),
    active: z.boolean(),
    firstPurchaseOnly: z.boolean(),
  })
  .refine((c) => c.type !== "PERCENT" || c.value <= 100, { message: "Percentual máximo é 100", path: ["value"] });

export const storeInfoSchema = z.object({
  storeName: text(2, 60),
  whatsappNumber: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .pipe(z.string().regex(/^(\d{10,13})?$/, "WhatsApp com DDD, só números (ex.: 62999998888)")),
  contactEmail: z.union([z.literal(""), z.string().trim().toLowerCase().pipe(z.email("E-mail inválido").max(160))]),
  instagram: z
    .string()
    .transform((v) => cleanText(v).replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/$/, ""))
    .pipe(z.string().regex(/^[A-Za-z0-9._]{0,30}$/, "Informe só o @ do Instagram")),
  announcement: optionalText(140),
  pickupAddress: optionalText(240),
});
