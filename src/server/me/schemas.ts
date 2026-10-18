import { z } from "zod";
import { nameSchema } from "@/lib/validation/auth";
import { isValidPushEndpoint } from "./helpers";

/** Validação das entradas da área do explorador (perfil, preferências, push, exclusão). */

export const MAX_FAVORITE_CATEGORIES = 15;

const coord = (min: number, max: number) => z.coerce.number().refine((n) => Number.isFinite(n) && n >= min && n <= max, "Coordenada inválida");

export const profileSchema = z
  .object({
    name: nameSchema,
    homeCity: z
      .string()
      .trim()
      .max(120, "Nome de cidade muito longo")
      .optional()
      .transform((v) => (v ? v : null)),
    homeLat: z.union([z.literal(""), coord(-90, 90)]).optional(),
    homeLng: z.union([z.literal(""), coord(-180, 180)]).optional(),
    favoriteCategories: z
      .array(z.string().trim().min(1).max(60).regex(/^[a-z0-9-]+$/))
      .max(MAX_FAVORITE_CATEGORIES, "Escolha no máximo 15 categorias")
      .default([]),
  })
  .transform((d) => {
    const hasCoords = typeof d.homeLat === "number" && typeof d.homeLng === "number";
    return {
      name: d.name,
      homeCity: d.homeCity && hasCoords ? d.homeCity : null,
      homeLat: d.homeCity && hasCoords ? (d.homeLat as number) : null,
      homeLng: d.homeCity && hasCoords ? (d.homeLng as number) : null,
      favoriteCategories: [...new Set(d.favoriteCategories)],
    };
  });

export type ProfileInput = z.output<typeof profileSchema>;

export const preferenceKeySchema = z.enum(["notifyEmail", "notifyPush", "marketingOptIn"]);
export type PreferenceKey = z.infer<typeof preferenceKeySchema>;

const b64url = z
  .string()
  .trim()
  .min(8)
  .max(256)
  .regex(/^[A-Za-z0-9_-]+={0,2}$/, "Chave inválida");

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().trim().max(1024).refine(isValidPushEndpoint, "Endpoint de push inválido"),
  keys: z.object({ p256dh: b64url, auth: b64url }),
});

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

export const pushUnsubscribeSchema = z.object({ endpoint: z.string().trim().min(1).max(1024) });

/** Confirmação da exclusão: senha (contas com senha) ou a palavra EXCLUIR (contas só-Google). */
export const deleteAccountSchema = z.object({
  password: z.string().max(128).optional().default(""),
  confirm: z.string().trim().max(20).optional().default(""),
});

export const DELETE_CONFIRM_WORD = "EXCLUIR";
