/**
 * Chaveiro personalizado (/personalizar): tabela de preços editável pelo painel e
 * cálculo da estimativa. O servidor sempre recalcula com a tabela do banco.
 */

import { z } from "zod";
import { applyPercentOff, tierPercent } from "@/lib/pricing";

const cents = z.number().int().min(0).max(10_000_00);
const id = z.string().regex(/^[a-z0-9-]{1,32}$/, "Use letras minúsculas, números e hífen");

export const customBuilderConfigSchema = z.object({
  enabled: z.boolean(),
  basePriceCents: cents,
  productionDays: z.number().int().min(1).max(60),
  minQuantity: z.number().int().min(1).max(1000),
  maxQuantity: z.number().int().min(1).max(5000),
  text: z.object({
    maxLength: z.number().int().min(1).max(40),
    includedChars: z.number().int().min(0).max(40),
    extraCharCents: cents,
  }),
  /** Taxa única cobrada quando o cliente envia uma imagem de referência (modelagem) */
  referenceSetupFeeCents: cents,
  shapes: z
    .array(
      z.object({
        id,
        name: z.string().min(1).max(40),
        description: z.string().max(120),
        priceCents: cents,
        requiresReference: z.boolean(),
        active: z.boolean(),
      }),
    )
    .min(1)
    .max(30),
  colors: z
    .array(
      z.object({
        id,
        name: z.string().min(1).max(40),
        hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        priceCents: cents,
        active: z.boolean(),
      }),
    )
    .min(1)
    .max(40),
  quantityTiers: z
    .array(z.object({ minQuantity: z.number().int().min(2).max(5000), percentOff: z.number().int().min(1).max(60) }))
    .max(6),
});

export type CustomBuilderConfig = z.infer<typeof customBuilderConfigSchema>;

export const DEFAULT_CUSTOM_BUILDER: CustomBuilderConfig = {
  enabled: true,
  basePriceCents: 2490,
  productionDays: 5,
  minQuantity: 1,
  maxQuantity: 200,
  text: { maxLength: 18, includedChars: 10, extraCharCents: 50 },
  referenceSetupFeeCents: 1500,
  shapes: [
    { id: "tag", name: "Tag", description: "Retângulo de cantos suaves, 50 × 22 mm", priceCents: 0, requiresReference: false, active: true },
    { id: "circulo", name: "Círculo", description: "Disco de 38 mm com borda chanfrada", priceCents: 0, requiresReference: false, active: true },
    { id: "hexagono", name: "Hexágono", description: "Hexágono de 40 mm, relevo em duas alturas", priceCents: 200, requiresReference: false, active: true },
    { id: "coracao", name: "Coração", description: "Coração de 40 mm, ótimo para casais", priceCents: 200, requiresReference: false, active: true },
    { id: "letra", name: "Inicial vazada", description: "Uma letra grande com o nome por dentro", priceCents: 500, requiresReference: false, active: true },
    { id: "livre", name: "Formato livre", description: "Modelamos a partir da sua imagem de referência", priceCents: 1000, requiresReference: true, active: true },
  ],
  colors: [
    { id: "grafite", name: "Grafite", hex: "#23232b", priceCents: 0, active: true },
    { id: "branco", name: "Branco gelo", hex: "#f2f2ef", priceCents: 0, active: true },
    { id: "cinza", name: "Cinza concreto", hex: "#8b8b93", priceCents: 0, active: true },
    { id: "violeta", name: "Violeta elétrico", hex: "#6a4cff", priceCents: 0, active: true },
    { id: "azul", name: "Azul cobalto", hex: "#2d62d8", priceCents: 0, active: true },
    { id: "vermelho", name: "Vermelho", hex: "#d23b3b", priceCents: 0, active: true },
    { id: "verde", name: "Verde folha", hex: "#2f9a5b", priceCents: 0, active: true },
    { id: "amarelo", name: "Amarelo", hex: "#f1c232", priceCents: 0, active: true },
    { id: "rosa", name: "Rosa chiclete", hex: "#ec72a8", priceCents: 0, active: true },
    { id: "seda-dourada", name: "Seda dourada", hex: "#c9a14a", priceCents: 300, active: true },
  ],
  quantityTiers: [
    { minQuantity: 10, percentOff: 10 },
    { minQuantity: 30, percentOff: 15 },
  ],
};

export function parseCustomBuilderConfig(value: unknown): CustomBuilderConfig {
  const parsed = customBuilderConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_CUSTOM_BUILDER;
}

/** Escolhas do cliente. Nada de preço aqui: só ids e textos. */
export const customSelectionSchema = z.object({
  shapeId: z.string().min(1).max(32),
  colorId: z.string().min(1).max(32),
  text: z.string().max(80).default(""),
  notes: z.string().max(600).default(""),
  quantity: z.number().int().min(1).max(5000),
});

export type CustomSelection = z.infer<typeof customSelectionSchema>;

export interface CustomQuoteLine {
  label: string;
  cents: number;
}

export type CustomQuote =
  | {
      ok: true;
      unitPriceCents: number;
      setupFeeCents: number;
      totalCents: number;
      percentOff: number;
      breakdown: CustomQuoteLine[];
      shapeName: string;
      colorName: string;
      text: string;
      notes: string;
    }
  | { ok: false; error: string };

/** Remove caracteres de controle e espaços repetidos. */
export function cleanCustomText(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function quoteCustomKeychain(
  config: CustomBuilderConfig,
  selection: CustomSelection,
  hasReference: boolean,
): CustomQuote {
  if (!config.enabled) return { ok: false, error: "Pedidos personalizados estão pausados no momento" };

  const shape = config.shapes.find((s) => s.id === selection.shapeId && s.active);
  if (!shape) return { ok: false, error: "Escolha um formato disponível" };
  const color = config.colors.find((c) => c.id === selection.colorId && c.active);
  if (!color) return { ok: false, error: "Escolha uma cor disponível" };

  const text = cleanCustomText(selection.text);
  const notes = cleanCustomText(selection.notes);
  if (text.length > config.text.maxLength) {
    return { ok: false, error: `O texto aceita até ${config.text.maxLength} caracteres` };
  }
  if (shape.requiresReference && !hasReference) {
    return { ok: false, error: `O formato "${shape.name}" precisa de uma imagem de referência` };
  }
  if (!text && !hasReference) return { ok: false, error: "Escreva o nome/texto ou envie uma imagem de referência" };

  const qty = selection.quantity;
  if (qty < config.minQuantity || qty > config.maxQuantity) {
    return { ok: false, error: `Quantidade entre ${config.minQuantity} e ${config.maxQuantity}` };
  }

  const extraChars = Math.max(0, text.replace(/\s/g, "").length - config.text.includedChars);
  const breakdown: CustomQuoteLine[] = [{ label: "Chaveiro personalizado", cents: config.basePriceCents }];
  if (shape.priceCents) breakdown.push({ label: `Formato ${shape.name}`, cents: shape.priceCents });
  if (color.priceCents) breakdown.push({ label: `Cor ${color.name}`, cents: color.priceCents });
  if (extraChars > 0 && config.text.extraCharCents > 0) {
    breakdown.push({ label: `${extraChars} caractere(s) extra`, cents: extraChars * config.text.extraCharCents });
  }

  const unitBeforeTier = breakdown.reduce((sum, line) => sum + line.cents, 0);
  const percentOff = tierPercent(config.quantityTiers, qty);
  const unitPriceCents = applyPercentOff(unitBeforeTier, percentOff);
  const setupFeeCents = hasReference ? config.referenceSetupFeeCents : 0;

  return {
    ok: true,
    unitPriceCents,
    setupFeeCents,
    totalCents: unitPriceCents * qty + setupFeeCents,
    percentOff,
    breakdown,
    shapeName: shape.name,
    colorName: color.name,
    text,
    notes,
  };
}
