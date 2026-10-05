import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido"),
  password: z.string().min(1, "Informe sua senha").max(200),
  next: z.string().optional(),
});

const passwordRule = z
  .string()
  .min(10, "Mínimo de 10 caracteres")
  .max(128)
  .regex(/[A-Za-z]/, "Inclua letras")
  .regex(/[0-9]/, "Inclua números");

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Informe seu nome").max(120),
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido"),
  password: passwordRule,
  companyName: z.string().trim().min(2, "Informe o nome da empresa").max(120),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: "É necessário aceitar os termos e a política de privacidade" }) }),
});

export const forgotSchema = z.object({ email: z.string().trim().toLowerCase().email("Informe um e-mail válido") });

export const resetSchema = z
  .object({ token: z.string().min(20), password: passwordRule, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "As senhas não conferem", path: ["confirm"] });

export const acceptInviteSchema = z.object({
  token: z.string().min(20),
  name: z.string().trim().min(2, "Informe seu nome").max(120).optional(),
  password: passwordRule.optional(),
  acceptTerms: z.boolean().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.input<typeof registerSchema>;
