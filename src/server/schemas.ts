import { z } from "zod";

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
