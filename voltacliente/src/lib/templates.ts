import { formatDate, humanizeElapsed, type ISODate } from "./dates";

export const TEMPLATE_MAX_LENGTH = 1000;

export const TEMPLATE_VARIABLES = [
  { key: "primeiro_nome", label: "Primeiro nome do cliente", example: "João" },
  { key: "nome", label: "Nome completo do cliente", example: "João Silva" },
  { key: "empresa", label: "Nome da sua empresa", example: "ClimaTech" },
  { key: "servico", label: "Serviço anterior", example: "limpeza de ar-condicionado" },
  { key: "data_ultimo_atendimento", label: "Data do último atendimento", example: "12/04/2026" },
  { key: "tempo_desde", label: "Tempo desde o último atendimento", example: "6 meses" },
  { key: "data_recomendada", label: "Data recomendada de retorno", example: "12/10/2026" },
  { key: "telefone_empresa", label: "Telefone da empresa", example: "(11) 3333-4444" },
] as const;

export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number]["key"];
export type TemplateValues = Record<TemplateVariable, string>;

const VARIABLE_RE = /\{([a-z_]+)\}/g;
const KNOWN = new Set<string>(TEMPLATE_VARIABLES.map((v) => v.key));

/** Primeira letra minúscula, preservando siglas ("SPA", "AC"). */
function lowerFirst(value: string): string {
  if (/^[A-ZÀ-Ý]{2,}/.test(value)) return value;
  return value.charAt(0).toLocaleLowerCase("pt-BR") + value.slice(1);
}

export function firstName(fullName: string): string {
  const name = fullName.trim().split(/\s+/)[0] ?? "";
  return name.charAt(0).toLocaleUpperCase("pt-BR") + name.slice(1);
}

export type TemplateContext = {
  customerName: string;
  companyName: string;
  companyPhone?: string | null;
  serviceName: string;
  lastServiceDate: ISODate;
  recommendedDate: ISODate;
  today: ISODate;
};

export function buildTemplateValues(ctx: TemplateContext): TemplateValues {
  return {
    primeiro_nome: firstName(ctx.customerName),
    nome: ctx.customerName.trim(),
    empresa: ctx.companyName.trim(),
    servico: lowerFirst(ctx.serviceName.trim()),
    data_ultimo_atendimento: formatDate(ctx.lastServiceDate),
    tempo_desde: humanizeElapsed(ctx.lastServiceDate, ctx.today),
    data_recomendada: formatDate(ctx.recommendedDate),
    telefone_empresa: ctx.companyPhone?.trim() ?? "",
  };
}

export function exampleTemplateValues(companyName = "ClimaTech"): TemplateValues {
  const values = Object.fromEntries(TEMPLATE_VARIABLES.map((v) => [v.key, v.example])) as TemplateValues;
  values.empresa = companyName;
  return values;
}

/** Substitui as variáveis conhecidas; variáveis desconhecidas permanecem no texto. */
export function renderTemplate(body: string, values: Partial<TemplateValues>): string {
  return body.replace(VARIABLE_RE, (match, key: string) => {
    if (!KNOWN.has(key)) return match;
    const value = values[key as TemplateVariable];
    return value === undefined ? match : value;
  });
}

/** Lista variáveis usadas no texto que não existem (ex.: erro de digitação). */
export function findUnknownVariables(body: string): string[] {
  const unknown = new Set<string>();
  for (const match of body.matchAll(VARIABLE_RE)) {
    if (!KNOWN.has(match[1])) unknown.add(match[1]);
  }
  return [...unknown];
}
