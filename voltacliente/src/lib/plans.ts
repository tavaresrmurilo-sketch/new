/**
 * Catálogo comercial dos planos (textos de marketing).
 *
 * Os limites efetivamente aplicados no app vêm da tabela `plans` do banco
 * (populada pela migração inicial). Um teste de integração garante que os
 * valores abaixo continuem iguais aos do banco.
 */
export type PlanCodeValue = "INICIAL" | "PROFISSIONAL" | "BUSINESS";

export type PlanCatalogItem = {
  code: PlanCodeValue;
  name: string;
  priceCents: number;
  customerLimit: number | null;
  advancedReports: boolean;
  tagline: string;
  features: string[];
  highlighted?: boolean;
};

export const PLAN_CATALOG: PlanCatalogItem[] = [
  {
    code: "INICIAL",
    name: "Inicial",
    priceCents: 3900,
    customerLimit: 100,
    advancedReports: false,
    tagline: "Para quem está começando a organizar os retornos.",
    features: ["Até 100 clientes", "Central de retornos", "Envio assistido pelo WhatsApp", "Modelos de mensagem", "Indicadores essenciais"],
  },
  {
    code: "PROFISSIONAL",
    name: "Profissional",
    priceCents: 7900,
    customerLimit: 500,
    advancedReports: true,
    tagline: "Para negócios com carteira ativa de clientes.",
    features: ["Até 500 clientes", "Tudo do plano Inicial", "Relatórios avançados", "Serviços com mais retornos", "Evolução por período"],
    highlighted: true,
  },
  {
    code: "BUSINESS",
    name: "Business",
    priceCents: 14900,
    customerLimit: null,
    advancedReports: true,
    tagline: "Para operações maiores e em crescimento.",
    features: ["Clientes ilimitados", "Tudo do plano Profissional", "Acesso antecipado a recursos avançados"],
  },
];
