/**
 * Validação (zod) das entradas do /admin. Sem "server-only" para poder ser testada isoladamente.
 */
import { z } from "zod";
import { CATEGORY_ICON_NAMES } from "@/components/events/category-icon";

const bool = z.preprocess((v) => v === true || v === "on" || v === "true" || v === "1", z.boolean());

/** "59", "59,90", "R$ 1.299,00", "1299.5" → centavos. null quando vazio; NaN quando inválido. */
export function parseMoneyToCents(input: unknown): number | null {
  if (input == null) return null;
  const raw = String(input).replace(/R\$|\s/g, "");
  if (!raw) return null;
  let normalized = raw;
  if (raw.includes(",")) normalized = raw.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) normalized = raw.replace(/\./g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return Number.NaN;
  return Math.round(Number(normalized) * 100);
}

const moneyNumber = (label: string) =>
  z.number({ error: `${label}: informe um valor válido (ex.: 59,90).` }).int().min(0).max(10_000_000, { error: `${label}: valor alto demais.` });

const money = (label: string) => z.preprocess((v) => parseMoneyToCents(v), moneyNumber(label));
const optionalMoney = (label: string) => z.preprocess((v) => parseMoneyToCents(v), moneyNumber(label).nullable());

/** Inteiro opcional: vazio = sem limite (null). */
const limit = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === "" || v == null ? null : Number(v)),
    z.number({ error: "Use um número inteiro ou deixe vazio para ilimitado." }).int({ error: "Use um número inteiro." }).min(min, { error: `Mínimo: ${min}.` }).max(max, { error: `Máximo: ${max}.` }).nullable(),
  );

const int = (min: number, max: number) =>
  z.coerce.number({ error: "Use um número inteiro." }).int({ error: "Use um número inteiro." }).min(min, { error: `Mínimo: ${min}.` }).max(max, { error: `Máximo: ${max}.` });

const stripePrice = z.preprocess(
  (v) => (typeof v === "string" && v.trim() ? v.trim() : null),
  z.string().regex(/^price_[A-Za-z0-9]{6,80}$/, { error: "IDs de preço do Stripe começam com price_." }).nullable(),
);

export const categoryFields = z.object({
  name: z.string().trim().min(2, { error: "Use pelo menos 2 caracteres." }).max(40, { error: "Use no máximo 40 caracteres." }),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, { error: "Use uma cor no formato #RRGGBB." })
    .transform((v) => v.toUpperCase()),
  icon: z.string().refine((v) => CATEGORY_ICON_NAMES.includes(v), { error: "Escolha um dos ícones disponíveis." }),
  sortOrder: int(0, 999),
  active: bool,
});

export const categoryCreateSchema = categoryFields.extend({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, { error: "Use pelo menos 2 caracteres." })
    .max(40, { error: "Use no máximo 40 caracteres." })
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { error: "Use letras minúsculas, números e hífens (ex.: musica-ao-vivo)." }),
});

export type CategoryInput = z.infer<typeof categoryFields>;
export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;

export const planSchema = z.object({
  name: z.string().trim().min(2, { error: "Use pelo menos 2 caracteres." }).max(30, { error: "Use no máximo 30 caracteres." }),
  tagline: z.string().trim().max(120, { error: "Use no máximo 120 caracteres." }),
  priceMonthlyCents: money("Preço mensal"),
  priceYearlyCents: optionalMoney("Preço anual"),
  maxActiveEvents: limit(1, 100_000),
  maxMembers: int(1, 1000),
  maxVenues: limit(1, 100_000),
  boostsPerMonth: int(0, 1000),
  fullAnalytics: bool,
  csvExport: bool,
  highlightBadge: bool,
  stripePriceMonthly: stripePrice,
  stripePriceYearly: stripePrice,
  active: bool,
});

export type PlanInput = z.infer<typeof planSchema>;

export const settingsSchema = z.object({
  moderationMode: z.enum(["all", "new_orgs", "none"], { error: "Escolha um modo de moderação." }),
  requireVerifiedEmail: bool,
});

export type SettingsInput = z.infer<typeof settingsSchema>;

export const reasonSchema = (min: number, max = 600) =>
  z.string({ error: "Informe o motivo." }).trim().min(min, { error: `Use pelo menos ${min} caracteres.` }).max(max, { error: `Use no máximo ${max} caracteres.` });

export const idSchema = z.string().trim().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/);
