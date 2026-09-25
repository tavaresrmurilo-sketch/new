import { z } from "zod";
import { passwordSchema } from "@/server/auth/password";

export const knowledgeSchema = z.object({
  type: z.enum(["INDICATOR", "ACCOUNTING_RULE", "CHART_OF_ACCOUNTS", "GOAL", "DEFINITION", "POLICY", "SYSTEM", "COMPANY_CONTEXT"]),
  title: z.string().trim().min(2).max(120),
  content: z.string().trim().min(2).max(5000),
  tags: z.array(z.string().max(40)).max(20).default([]),
  active: z.boolean().default(true),
});

export const chartAccountSchema = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(2).max(120),
  dreGroup: z.enum(["GROSS_REVENUE", "DEDUCTIONS", "COGS", "OPERATING_EXPENSES", "DEPRECIATION", "FINANCIAL_INCOME", "FINANCIAL_EXPENSES", "NON_OPERATING", "INCOME_TAXES"]),
  categoryAliases: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
  isSensitive: z.boolean().default(false),
});

const common = {
  email: z.string().trim().toLowerCase().email("E-mail inválido").max(200),
  password: passwordSchema,
  acceptTerms: z.literal(true, { errorMap: () => ({ message: "É necessário aceitar os termos" }) }),
};

/** Cadastro público: somente PERSON ou COMPANY. Contas ADMIN nunca são criadas por esta rota. */
export const registerSchema = z.discriminatedUnion("accountType", [
  z.object({
    accountType: z.literal("PERSON"),
    firstName: z.string().trim().min(2, "Informe seu nome").max(60),
    lastName: z.string().trim().min(2, "Informe seu sobrenome").max(80),
    ...common,
  }),
  z.object({
    accountType: z.literal("COMPANY"),
    companyName: z.string().trim().min(2, "Informe o nome da empresa").max(120),
    name: z.string().trim().min(2, "Informe o nome do responsável").max(120),
    cnpj: z
      .string()
      .trim()
      .max(20)
      .regex(/^[\d./-]*$/, "CNPJ inválido")
      .optional()
      .transform((v) => v || undefined),
    ...common,
  }),
]);

