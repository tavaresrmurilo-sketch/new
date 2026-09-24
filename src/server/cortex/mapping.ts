import type { ImportTarget } from "@prisma/client";
import { normalizeText } from "@/lib/utils";

export interface FieldDef {
  key: string;
  label: string;
  required: boolean;
  kind: "string" | "number" | "date";
  synonyms: string[];
}

const F = (key: string, label: string, kind: FieldDef["kind"], required: boolean, synonyms: string[]): FieldDef => ({ key, label, kind, required, synonyms });

export const TARGET_FIELDS: Record<ImportTarget, FieldDef[]> = {
  SALES: [
    F("externalId", "Nº do pedido / ID", "string", false, ["pedido", "numero pedido", "n pedido", "nº pedido", "id", "codigo", "numero", "nota", "nf", "nota fiscal", "documento", "id venda", "venda"]),
    F("date", "Data", "date", true, ["data", "data venda", "data da venda", "emissao", "data emissao", "dt", "competencia", "date"]),
    F("customer", "Cliente", "string", false, ["cliente", "nome cliente", "razao social", "comprador", "customer"]),
    F("seller", "Vendedor", "string", false, ["vendedor", "representante", "consultor", "seller", "responsavel"]),
    F("product", "Produto / Descrição", "string", false, ["produto", "descricao", "item", "servico", "mercadoria", "product", "descricao produto"]),
    F("category", "Categoria", "string", false, ["categoria", "grupo", "linha", "familia", "category", "segmento"]),
    F("quantity", "Quantidade", "number", false, ["quantidade", "qtd", "qtde", "quant", "volume", "unidades", "quantity"]),
    F("unitPrice", "Preço unitário", "number", false, ["preco unitario", "valor unitario", "preco", "unitario", "vl unit"]),
    F("grossAmount", "Receita / Valor total", "number", true, ["receita", "valor", "total", "valor total", "faturamento", "valor bruto", "receita bruta", "venda", "amount", "revenue"]),
    F("discount", "Desconto", "number", false, ["desconto", "descontos", "discount"]),
    F("tax", "Impostos sobre venda", "number", false, ["imposto", "impostos", "tributos", "icms", "tax"]),
    F("cost", "Custo", "number", false, ["custo", "cmv", "custo total", "cpv", "cost"]),
    F("region", "Região / UF", "string", false, ["regiao", "uf", "estado", "region", "praca"]),
    F("channel", "Canal", "string", false, ["canal", "origem", "channel"]),
    F("status", "Status", "string", false, ["status", "situacao"]),
  ],
  EXPENSES: [
    F("externalId", "ID / Documento", "string", false, ["id", "codigo", "documento", "lancamento", "numero"]),
    F("date", "Data (competência)", "date", true, ["data", "competencia", "data competencia", "emissao", "dt"]),
    F("description", "Descrição", "string", true, ["descricao", "historico", "despesa", "detalhe", "description"]),
    F("category", "Categoria", "string", true, ["categoria", "conta", "plano de contas", "natureza", "grupo", "category"]),
    F("amount", "Valor", "number", true, ["valor", "total", "montante", "amount", "despesa valor"]),
    F("supplier", "Fornecedor", "string", false, ["fornecedor", "favorecido", "credor", "supplier"]),
    F("costCenter", "Centro de custo", "string", false, ["centro de custo", "cc", "centro custo", "cost center"]),
    F("department", "Departamento", "string", false, ["departamento", "area", "setor", "department"]),
  ],
  REVENUES: [
    F("externalId", "ID / Documento", "string", false, ["id", "codigo", "documento", "numero"]),
    F("date", "Data", "date", true, ["data", "competencia", "emissao", "dt"]),
    F("description", "Descrição", "string", true, ["descricao", "historico", "receita", "description"]),
    F("category", "Categoria", "string", true, ["categoria", "conta", "natureza", "category"]),
    F("amount", "Valor", "number", true, ["valor", "total", "montante", "amount"]),
    F("customer", "Cliente", "string", false, ["cliente", "pagador", "customer"]),
  ],
  CUSTOMERS: [
    F("externalId", "Código", "string", false, ["codigo", "id", "cod", "codigo cliente"]),
    F("name", "Nome / Razão social", "string", true, ["nome", "cliente", "razao social", "nome fantasia", "name"]),
    F("document", "CNPJ / CPF", "string", false, ["cnpj", "cpf", "documento", "cnpj cpf"]),
    F("email", "E-mail", "string", false, ["email", "e-mail", "e mail"]),
    F("segment", "Segmento", "string", false, ["segmento", "ramo", "setor"]),
    F("region", "Região", "string", false, ["regiao"]),
    F("city", "Cidade", "string", false, ["cidade", "municipio"]),
    F("state", "UF", "string", false, ["uf", "estado"]),
  ],
  PRODUCTS: [
    F("externalId", "Código", "string", false, ["codigo", "id", "cod", "codigo produto"]),
    F("name", "Nome", "string", true, ["nome", "produto", "descricao", "servico", "name"]),
    F("sku", "SKU", "string", false, ["sku", "referencia", "ref", "ean"]),
    F("category", "Categoria", "string", false, ["categoria", "grupo", "linha", "familia"]),
    F("type", "Tipo (produto/serviço)", "string", false, ["tipo", "type"]),
    F("unitPrice", "Preço", "number", false, ["preco", "preco venda", "valor", "price"]),
    F("unitCost", "Custo", "number", false, ["custo", "custo unitario", "cost"]),
  ],
  ACCOUNTS_PAYABLE: [
    F("externalId", "ID / Documento", "string", false, ["id", "documento", "titulo", "numero", "codigo", "nf"]),
    F("description", "Descrição", "string", true, ["descricao", "historico", "detalhe"]),
    F("supplier", "Fornecedor", "string", false, ["fornecedor", "favorecido", "credor"]),
    F("category", "Categoria", "string", false, ["categoria", "conta", "natureza", "plano de contas"]),
    F("costCenter", "Centro de custo", "string", false, ["centro de custo", "cc"]),
    F("department", "Departamento", "string", false, ["departamento", "area", "setor"]),
    F("companyUnit", "Empresa / Unidade", "string", false, ["empresa", "unidade", "filial"]),
    F("issueDate", "Data de emissão", "date", false, ["emissao", "data emissao", "data", "lancamento"]),
    F("dueDate", "Vencimento", "date", true, ["vencimento", "data vencimento", "vence", "due"]),
    F("amount", "Valor", "number", true, ["valor", "valor titulo", "total", "montante"]),
    F("paidAmount", "Valor pago", "number", false, ["valor pago", "pago", "baixado"]),
    F("paidAt", "Data de pagamento", "date", false, ["data pagamento", "pagamento", "data baixa", "pago em"]),
  ],
  ACCOUNTS_RECEIVABLE: [
    F("externalId", "ID / Documento", "string", false, ["id", "documento", "titulo", "numero", "codigo", "nf", "boleto"]),
    F("description", "Descrição", "string", true, ["descricao", "historico", "detalhe", "referencia"]),
    F("customer", "Cliente", "string", false, ["cliente", "sacado", "pagador"]),
    F("issueDate", "Data de emissão", "date", false, ["emissao", "data emissao", "data"]),
    F("dueDate", "Vencimento", "date", true, ["vencimento", "data vencimento", "vence", "due"]),
    F("amount", "Valor", "number", true, ["valor", "valor titulo", "total", "montante"]),
    F("receivedAmount", "Valor recebido", "number", false, ["valor recebido", "recebido", "baixado"]),
    F("receivedAt", "Data de recebimento", "date", false, ["data recebimento", "recebimento", "data baixa", "recebido em"]),
  ],
};

export const TARGET_LABELS: Record<ImportTarget, string> = {
  SALES: "Vendas",
  EXPENSES: "Despesas",
  REVENUES: "Receitas (não vendas)",
  CUSTOMERS: "Clientes",
  PRODUCTS: "Produtos / Serviços",
  ACCOUNTS_PAYABLE: "Contas a pagar",
  ACCOUNTS_RECEIVABLE: "Contas a receber",
};

export type ColumnMapping = Record<string, string | null>; // fieldKey -> header

// ───────── Parsers de valores ─────────

export function parseNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/R\$|\s|%/gi, "");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  }
  if (!/^[\d.,]+$/.test(s)) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    s = (s.match(/,/g)?.length ?? 0) > 1 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (lastDot >= 0) {
    const dots = s.match(/\./g)?.length ?? 0;
    // padrão brasileiro: "1.234" ou "1.234.567" são milhares
    if (dots > 1 || /^\d{1,3}\.\d{3}$/.test(s)) s = s.replace(/\./g, "");
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

export function parseDate(v: unknown): Date | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
  }
  if (typeof v === "number") {
    if (v > 20000 && v < 80000) {
      // número serial do Excel
      const ms = Math.round((v - 25569) * 86_400_000);
      const d = new Date(ms);
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    }
    return null;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return valid(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    let y = Number(m[3]);
    if (y < 100) y += y < 70 ? 2000 : 1900;
    return valid(y, Number(m[2]), Number(m[1]));
  }
  m = s.match(/^(\d{1,2})[/.-](\d{4})$/); // mm/aaaa
  if (m) return valid(Number(m[2]), Number(m[1]), 1);
  return null;
}

function valid(y: number, m: number, d: number): Date | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCMonth() === m - 1 ? date : null;
}

// ───────── Detecção de colunas ─────────

function headerScore(header: string, field: FieldDef): number {
  const h = normalizeText(header);
  let best = 0;
  for (const syn of field.synonyms) {
    const s = normalizeText(syn);
    if (h === s) best = Math.max(best, 100);
    else if (h.startsWith(s + " ") || h.endsWith(" " + s)) best = Math.max(best, 70);
    else if (h.includes(s) && s.length >= 4) best = Math.max(best, 50);
  }
  return best;
}

function contentScore(values: unknown[], kind: FieldDef["kind"]): number {
  const sample = values.filter((v) => v !== null && v !== undefined && v !== "").slice(0, 30);
  if (!sample.length) return 0;
  const ok = sample.filter((v) => (kind === "date" ? parseDate(v) !== null : kind === "number" ? parseNumber(v) !== null : true)).length;
  return ok / sample.length;
}

/** Sugere o mapeamento campo→coluna combinando nome do cabeçalho e conteúdo das células. */
export function suggestMapping(target: ImportTarget, headers: string[], rows: Record<string, unknown>[]): { mapping: ColumnMapping; confidence: Record<string, number> } {
  const fields = TARGET_FIELDS[target];
  const candidates: { field: string; header: string; score: number }[] = [];
  for (const field of fields) {
    for (const header of headers) {
      const hs = headerScore(header, field);
      if (!hs) continue;
      const cs = field.kind === "string" ? 1 : contentScore(rows.map((r) => r[header]), field.kind);
      if (field.kind !== "string" && cs < 0.6) continue;
      candidates.push({ field: field.key, header, score: hs * (0.5 + cs / 2) });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const mapping: ColumnMapping = Object.fromEntries(fields.map((f) => [f.key, null]));
  const confidence: Record<string, number> = {};
  const usedHeaders = new Set<string>();
  for (const c of candidates) {
    if (mapping[c.field] || usedHeaders.has(c.header)) continue;
    mapping[c.field] = c.header;
    confidence[c.field] = Math.round(c.score);
    usedHeaders.add(c.header);
  }
  return { mapping, confidence };
}

/** Sugere o tipo de dado da planilha a partir dos cabeçalhos. */
export function suggestTarget(headers: string[]): ImportTarget {
  const h = headers.map(normalizeText).join(" | ");
  if (/vencimento/.test(h) && /(fornecedor|credor|favorecido|pagar|pago)/.test(h)) return "ACCOUNTS_PAYABLE";
  if (/vencimento/.test(h) && /(cliente|sacado|receber|recebido)/.test(h)) return "ACCOUNTS_RECEIVABLE";
  if (/(receita|faturamento|venda|pedido|quantidade|qtd)/.test(h) && /(data)/.test(h)) return "SALES";
  if (/(despesa|fornecedor|centro de custo)/.test(h)) return "EXPENSES";
  if (/(cnpj|cpf|razao social|e-?mail)/.test(h)) return "CUSTOMERS";
  if (/(sku|preco|produto)/.test(h)) return "PRODUCTS";
  return "SALES";
}

export function validateMapping(target: ImportTarget, mapping: ColumnMapping, headers: string[]): string[] {
  const errors: string[] = [];
  for (const f of TARGET_FIELDS[target]) {
    const h = mapping[f.key];
    if (f.required && !h) errors.push(`O campo obrigatório "${f.label}" não foi mapeado.`);
    if (h && !headers.includes(h)) errors.push(`A coluna "${h}" não existe no arquivo.`);
  }
  return errors;
}
