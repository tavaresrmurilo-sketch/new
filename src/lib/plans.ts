/**
 * Definição comercial dos planos para organizadores.
 * Estes valores são o ponto de partida (seed) — preços e limites ficam no banco
 * (tabela Plan) e podem ser ajustados no /admin sem novo deploy.
 */
export type Tier = "FREE" | "PRO" | "BUSINESS";

export interface PlanDefinition {
  tier: Tier;
  name: string;
  tagline: string;
  priceMonthlyCents: number;
  priceYearlyCents: number | null;
  maxActiveEvents: number | null;
  maxMembers: number;
  maxVenues: number | null;
  boostsPerMonth: number;
  fullAnalytics: boolean;
  csvExport: boolean;
  highlightBadge: boolean;
}

export const PLAN_SEED: PlanDefinition[] = [
  {
    tier: "FREE",
    name: "Gratuito",
    tagline: "Para começar a aparecer no mapa",
    priceMonthlyCents: 0,
    priceYearlyCents: null,
    maxActiveEvents: 3,
    maxMembers: 1,
    maxVenues: 2,
    boostsPerMonth: 0,
    fullAnalytics: false,
    csvExport: false,
    highlightBadge: false,
  },
  {
    tier: "PRO",
    name: "Pro",
    tagline: "Para produtores e casas com agenda cheia",
    priceMonthlyCents: 5900,
    priceYearlyCents: 59000,
    maxActiveEvents: null,
    maxMembers: 3,
    maxVenues: 10,
    boostsPerMonth: 2,
    fullAnalytics: true,
    csvExport: true,
    highlightBadge: true,
  },
  {
    tier: "BUSINESS",
    name: "Business",
    tagline: "Para redes, festivais e agências",
    priceMonthlyCents: 19900,
    priceYearlyCents: 199000,
    maxActiveEvents: null,
    maxMembers: 15,
    maxVenues: null,
    boostsPerMonth: 10,
    fullAnalytics: true,
    csvExport: true,
    highlightBadge: true,
  },
];

export const BOOST_DURATION_DAYS = 7;

export function planFeatureList(p: Pick<PlanDefinition, "maxActiveEvents" | "maxMembers" | "maxVenues" | "boostsPerMonth" | "fullAnalytics" | "csvExport" | "highlightBadge">): string[] {
  const list = [
    p.maxActiveEvents == null ? "Eventos ativos ilimitados" : `Até ${p.maxActiveEvents} eventos ativos`,
    p.maxMembers === 1 ? "1 pessoa na equipe" : `Até ${p.maxMembers} pessoas na equipe`,
    p.maxVenues == null ? "Locais salvos ilimitados" : `Até ${p.maxVenues} locais salvos`,
    p.fullAnalytics ? "Estatísticas completas por dia" : "Estatísticas básicas",
  ];
  if (p.boostsPerMonth > 0) list.push(`${p.boostsPerMonth} destaques por mês no mapa (${BOOST_DURATION_DAYS} dias cada)`);
  if (p.highlightBadge) list.push("Selo de organizador profissional");
  if (p.csvExport) list.push("Exportação das métricas em CSV");
  return list;
}
