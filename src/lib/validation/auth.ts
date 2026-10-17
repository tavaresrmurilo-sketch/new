import { z } from "zod";

export const emailSchema = z
  .string({ error: "Informe seu e-mail" })
  .trim()
  .toLowerCase()
  .max(254, "E-mail muito longo")
  .pipe(z.email({ error: "E-mail inválido" }));

const COMMON = new Set(["12345678", "123456789", "1234567890", "password", "senha123", "qwerty123", "abc12345", "mixtour123", "senhasenha"]);

export const passwordSchema = z
  .string({ error: "Informe uma senha" })
  .min(8, "A senha precisa de pelo menos 8 caracteres")
  .max(128, "A senha pode ter no máximo 128 caracteres")
  .regex(/[A-Za-zÀ-ÿ]/, "Use pelo menos uma letra")
  .regex(/[0-9]/, "Use pelo menos um número")
  .refine((v) => !COMMON.has(v.toLowerCase()), "Essa senha é muito comum");

export const nameSchema = z
  .string({ error: "Informe seu nome" })
  .trim()
  .min(2, "Informe seu nome")
  .max(80, "Nome muito longo");

export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  acceptTerms: z.literal("on", { error: "Aceite os termos para continuar" }),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Informe sua senha").max(128),
});

export const resetSchema = z
  .object({ token: z.string().min(10), password: passwordSchema, confirm: z.string() })
  .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "As senhas não conferem" });
