import type { Plan } from "@prisma/client";

/** Estrutura de planos comerciais. Cobrança (Stripe/Mercado Pago/Asaas) será plugada via BillingProvider. */
export const PLANS: Record<Plan, { label: string; priceBRL: number | null; users: number; integrations: number; aiQuestionsMonth: number; historyMonths: number; features: string[] }> = {
  STARTER: { label: "Starter", priceBRL: 490, users: 3, integrations: 2, aiQuestionsMonth: 300, historyMonths: 24, features: ["Dashboards", "DRE", "Importação de planilhas", "Pergunte ao Cortex"] },
  PROFESSIONAL: { label: "Professional", priceBRL: 1290, users: 10, integrations: 5, aiQuestionsMonth: 1500, historyMonths: 60, features: ["Tudo do Starter", "Projeções e cenários", "Relatório executivo", "Integrações API"] },
  BUSINESS: { label: "Business", priceBRL: 2890, users: 30, integrations: 15, aiQuestionsMonth: 6000, historyMonths: 120, features: ["Tudo do Professional", "Multiempresa", "Auditoria avançada", "Suporte prioritário"] },
  ENTERPRISE: { label: "Enterprise", priceBRL: null, users: 1000, integrations: 100, aiQuestionsMonth: 100000, historyMonths: 240, features: ["Tudo do Business", "SSO", "SLA dedicado", "Conectores sob medida"] },
};
