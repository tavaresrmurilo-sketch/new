import { normalizeText } from "@/lib/utils";
import { parseHorizonDays, parsePeriodFromText, parseUntilMonth } from "./period-parse";
import type { ToolCall } from "./types";

/**
 * Planejador determinístico (sem LLM): identifica a intenção da pergunta e define quais ferramentas
 * internas executar. Também é o fallback quando o provedor de IA externo falha ou não está autorizado.
 */
export function planFromRules(question: string, today: Date): ToolCall[] {
  const t = normalizeText(question);
  const { input: period, compareLastYear } = parsePeriodFromText(question, today);
  const withP = (extra: Record<string, unknown> = {}) => ({ ...(period ? { period } : {}), ...extra });
  const has = (re: RegExp) => re.test(t);
  const calls: ToolCall[] = [];
  const push = (name: string, input: Record<string, unknown> = {}) => {
    if (!calls.some((c) => c.name === name)) calls.push({ name, input });
  };

  if (has(/(o que (e|significa)|defin(a|icao)|como (e|eh) calculad|conceito de)/)) {
    push("getKnowledge", { query: question });
    return calls;
  }
  if (has(/(como (esta|vai|anda)[a-z ]*(empresa|negocio|resultado geral)|como estamos|visao geral|panorama|resumo geral|dashboard|painel da operacao|situacao da empresa)/)) {
    push("getCompanyOverview");
    return calls;
  }
  if (has(/(analise critica|analise (o|do|meu) resultado|analise do dre|explique (o|meu) resultado|por que (o )?(lucro|resultado|margem)|o que (aconteceu|explica))/)) {
    push("analyzeVariance", withP());
    return calls;
  }
  if (has(/\bdre\b|demonstra(tivo|cao) (de|do) resultado/)) push("getDRE", withP());

  if (has(/compar|versus|\bvs\b|em relacao ao/)) {
    push("comparePeriods", withP({ compare: compareLastYear ? "last_year" : "previous" }));
  }

  if (has(/(proje|previs|sera|vai ficar|proxim|semana que vem|risco de faltar|faltar caixa|falta de caixa)/) && has(/caixa|saldo/)) {
    push("forecastCashFlow", { days: parseHorizonDays(question, has(/risco|faltar|falta/) ? 30 : 7) });
  } else if (has(/fluxo de caixa|\bcaixa\b|saldo (bancario|em conta|atual)/)) {
    push("getCashFlow");
  }

  if (has(/(proje|previs|forecast|estim)/) && !has(/caixa|saldo/)) {
    const target = has(/(resultado|lucro)/) ? "result" : has(/(despesa|custo|gasto)/) ? "expenses" : "revenue";
    push("forecastRevenue", { target, untilMonth: parseUntilMonth(question, today) });
  }

  if (has(/(a pagar|vence(m|ndo)?|vencimento|pagar|fornecedor(es)? a pagar|boletos)/) && !has(/a receber/)) {
    push("getAccountsPayable", { days: parseHorizonDays(question, 7) });
  }
  if (has(/(a receber|receber|recebimento|inadimpl|atrasad|devendo)/)) push("getAccountsReceivable");

  if (has(/client/)) {
    const mode = has(/(reduz|diminu|cai(u|ram)|queda|perde)/)
      ? "decreased"
      : has(/(aument|cresce|subi)/)
        ? "increased"
        : has(/(sem comprar|inativ|parad|nao compra|deixaram de comprar)/)
          ? "inactive"
          : has(/(atencao|risco|cuidado|preocup)/)
            ? "attention"
            : has(/concentra/)
              ? "concentration"
              : has(/margem|rentab|lucrativ/)
                ? "margin"
                : has(/(menor|pior|menos compr)/)
                  ? "bottom"
                  : "top";
    push("getCustomers", withP({ mode }));
  } else if (has(/concentra/)) {
    push("getCustomers", withP({ mode: "concentration" }));
  }

  if (has(/(produto|servico|item|mix|sku)/)) {
    const mode = has(/(margem baixa|menor margem|baixa margem|pior margem)/)
      ? "low_margin"
      : has(/(maior margem|mais rentave|margem|rentab|lucrativ)/)
        ? "margin"
        : has(/(cresce|aument)/)
          ? "growth"
          : has(/(queda|cai|reduz)/)
            ? "decline"
            : "top";
    push("getSalesByProduct", withP({ mode, ...(has(/servico/) && !has(/produto/) ? { type: "SERVICE" } : {}) }));
  }
  if (has(/vendedor|representante|equipe comercial/)) push("getSalesBySeller", withP());
  if (has(/estoque|inventario/)) push("getInventory");

  if (has(/(despesa|gasto|custo)/) && !calls.some((c) => c.name === "forecastRevenue")) {
    push("getExpenses", has(/(aument|cresce|subi|mais (au|cres))/) ? { mode: "trend" } : withP({ mode: "category" }));
  }
  if (has(/margem|margens|rentabilidade/) && !calls.some((c) => ["getSalesByProduct", "getCustomers"].includes(c.name))) push("getMargins", withP());
  if (has(/(ebitda|lucro|resultado|indicador|kpi)/) && !calls.some((c) => ["getDRE", "analyzeVariance", "comparePeriods", "forecastRevenue", "getMargins"].includes(c.name))) {
    push("getFinancialIndicators", withP());
  }
  if (has(/(pontos de atencao|precisam? de atencao|alerta|insight|risco|oportunidade)/) && !calls.length) push("getInsights");
  if (has(/(vend|fatur|receita)/) && !calls.some((c) => ["comparePeriods", "getDRE", "forecastRevenue", "getCustomers", "getSalesByProduct", "getSalesBySeller"].includes(c.name))) {
    push(has(/receita liquida|receita bruta/) ? "getRevenue" : "getSales", withP());
  }
  return calls.slice(0, 4);
}
