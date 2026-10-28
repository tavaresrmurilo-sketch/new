import { z } from "zod";
import { isISODate } from "./dates";
import { normalizePhone } from "./phone";
import { parseMoneyToCents } from "./money";

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

/** Retorna a mensagem de erro da política de senha, ou null se for válida. */
export function passwordPolicyError(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `A senha precisa ter pelo menos ${PASSWORD_MIN} caracteres.`;
  if (password.length > PASSWORD_MAX) return `A senha pode ter no máximo ${PASSWORD_MAX} caracteres.`;
  if (!/[A-Za-zÀ-ÿ]/.test(password) || !/\d/.test(password)) return "A senha precisa conter letras e números.";
  return null;
}

export const passwordSchema = z.string().superRefine((value, ctx) => {
  const error = passwordPolicyError(value);
  if (error) ctx.addIssue({ code: "custom", message: error });
});

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Informe o e-mail.")
  .max(254, "E-mail muito longo.")
  .pipe(z.email("E-mail inválido."));

export const personNameSchema = z.string().trim().min(2, "Informe pelo menos 2 caracteres.").max(80, "Use no máximo 80 caracteres.");

export const signUpSchema = z.object({
  name: personNameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Informe a senha."),
});

/** Campo de texto opcional: string vazia vira null. */
export const optionalText = (max: number, label = "Texto") =>
  z
    .string()
    .trim()
    .max(max, `${label} deve ter no máximo ${max} caracteres.`)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const isoDateSchema = z.string().refine(isISODate, "Data inválida.");

export const optionalIsoDate = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || isISODate(v), "Data inválida.");

export const phoneSchema = z
  .string()
  .trim()
  .min(1, "Informe o telefone/WhatsApp.")
  .refine((v) => normalizePhone(v) !== null, "Telefone inválido. Use DDD + número, ex.: (11) 98765-4321.");

/** Valor monetário em texto ("150,00") → centavos | null. */
export const moneySchema = z
  .union([z.string(), z.number()])
  .optional()
  .nullable()
  .transform((v, ctx) => {
    const cents = parseMoneyToCents(v ?? null);
    if (cents === undefined) {
      ctx.addIssue({ code: "custom", message: "Valor inválido. Ex.: 150,00" });
      return z.NEVER;
    }
    if (cents !== null && cents > 100_000_000) {
      ctx.addIssue({ code: "custom", message: "Valor muito alto." });
      return z.NEVER;
    }
    return cents;
  });

export const intervalDaysSchema = z.coerce
  .number({ error: "Informe um número de dias." })
  .int("Use um número inteiro de dias.")
  .min(1, "Mínimo de 1 dia.")
  .max(3650, "Máximo de 3650 dias (10 anos).");

export const idSchema = z.string().trim().min(1).max(64);

/** Booleano vindo de formulário ("on", "true", "1") ou JSON. */
export const booleanField = (defaultValue = false) =>
  z
    .union([z.boolean(), z.string()])
    .optional()
    .nullable()
    .transform((v) => (v === undefined || v === null ? defaultValue : v === true || v === "true" || v === "on" || v === "1"));
