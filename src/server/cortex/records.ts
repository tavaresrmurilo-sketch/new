import { z } from "zod";

/**
 * Modelo canônico do Cortex. Todo conector (ERP, CRM, planilha, API...) converte seus dados
 * para estes formatos antes da ingestão. Referências entre entidades usam externalId da mesma fonte.
 */
const money = z.number().finite().min(-1e13).max(1e13);
const date = z.date();
const str = (max = 300) => z.string().trim().min(1).max(max);
const optStr = (max = 300) => z.string().trim().max(max).optional().nullable();

export const customerRecord = z.object({
  externalId: str(120),
  name: str(),
  document: optStr(40),
  email: optStr(200),
  segment: optStr(120),
  region: optStr(120),
  city: optStr(120),
  state: optStr(40),
});

export const supplierRecord = z.object({
  externalId: str(120),
  name: str(),
  document: optStr(40),
  category: optStr(120),
});

export const productRecord = z.object({
  externalId: str(120),
  name: str(),
  sku: optStr(80),
  category: optStr(120),
  type: z.enum(["PRODUCT", "SERVICE"]).default("PRODUCT"),
  unitPrice: money.optional().nullable(),
  unitCost: money.optional().nullable(),
});

export const sellerRecord = z.object({
  externalId: str(120),
  name: str(),
  email: optStr(200),
  region: optStr(120),
  team: optStr(120),
});

export const saleItemRecord = z.object({
  productExternalId: optStr(120),
  productName: optStr(),
  quantity: z.number().finite().positive().default(1),
  unitPrice: money,
  discount: money.default(0),
  total: money,
  totalCost: money.default(0),
});

export const saleRecord = z.object({
  externalId: str(120),
  number: optStr(60),
  date,
  customerExternalId: optStr(120),
  customerName: optStr(),
  sellerExternalId: optStr(120),
  sellerName: optStr(),
  status: z.enum(["COMPLETED", "CANCELLED"]).default("COMPLETED"),
  grossAmount: money,
  discountAmount: money.default(0),
  taxAmount: money.default(0),
  costAmount: money.default(0),
  region: optStr(120),
  channel: optStr(120),
  category: optStr(120),
  items: z.array(saleItemRecord).max(500).default([]),
});

export const expenseRecord = z.object({
  externalId: str(120),
  date,
  description: str(500),
  category: str(120),
  amount: money,
  supplierExternalId: optStr(120),
  supplierName: optStr(),
  costCenterCode: optStr(60),
  department: optStr(120),
});

export const revenueRecord = z.object({
  externalId: str(120),
  date,
  description: str(500),
  category: str(120),
  amount: money,
  customerExternalId: optStr(120),
  customerName: optStr(),
});

export const payableRecord = z.object({
  externalId: str(120),
  description: str(500),
  category: optStr(120),
  supplierExternalId: optStr(120),
  supplierName: optStr(),
  costCenterCode: optStr(60),
  department: optStr(120),
  companyUnit: optStr(120),
  issueDate: date,
  dueDate: date,
  amount: money,
  paidAmount: money.default(0),
  paidAt: date.optional().nullable(),
});

export const receivableRecord = z.object({
  externalId: str(120),
  description: str(500),
  customerExternalId: optStr(120),
  customerName: optStr(),
  saleExternalId: optStr(120),
  issueDate: date,
  dueDate: date,
  amount: money,
  receivedAmount: money.default(0),
  receivedAt: date.optional().nullable(),
});

export const financialAccountRecord = z.object({
  externalId: str(120),
  name: str(),
  bank: optStr(120),
  type: z.string().default("CHECKING"),
  openingBalance: money.default(0),
  openingDate: date,
});

export const paymentRecord = z.object({
  externalId: str(120),
  direction: z.enum(["IN", "OUT"]),
  date,
  amount: money,
  description: optStr(500),
  category: optStr(120),
  financialAccountExternalId: optStr(120),
  payableExternalId: optStr(120),
  receivableExternalId: optStr(120),
});

export const costCenterRecord = z.object({
  externalId: str(120),
  code: str(60),
  name: str(),
  department: optStr(120),
});

export type CustomerRecord = z.infer<typeof customerRecord>;
export type SupplierRecord = z.infer<typeof supplierRecord>;
export type ProductRecord = z.infer<typeof productRecord>;
export type SellerRecord = z.infer<typeof sellerRecord>;
export type SaleRecord = z.infer<typeof saleRecord>;
export type ExpenseRecord = z.infer<typeof expenseRecord>;
export type RevenueRecord = z.infer<typeof revenueRecord>;
export type PayableRecord = z.infer<typeof payableRecord>;
export type ReceivableRecord = z.infer<typeof receivableRecord>;
export type FinancialAccountRecord = z.infer<typeof financialAccountRecord>;
export type PaymentRecord = z.infer<typeof paymentRecord>;
export type CostCenterRecord = z.infer<typeof costCenterRecord>;

/** Lote canônico. A ordem de ingestão respeita dependências (cadastros antes de movimentos). */
export interface CanonicalBatch {
  costCenters?: unknown[];
  customers?: unknown[];
  suppliers?: unknown[];
  products?: unknown[];
  sellers?: unknown[];
  financialAccounts?: unknown[];
  sales?: unknown[];
  revenues?: unknown[];
  expenses?: unknown[];
  payables?: unknown[];
  receivables?: unknown[];
  payments?: unknown[];
}

export const BATCH_SCHEMAS = {
  costCenters: costCenterRecord,
  customers: customerRecord,
  suppliers: supplierRecord,
  products: productRecord,
  sellers: sellerRecord,
  financialAccounts: financialAccountRecord,
  sales: saleRecord,
  revenues: revenueRecord,
  expenses: expenseRecord,
  payables: payableRecord,
  receivables: receivableRecord,
  payments: paymentRecord,
} as const;

export type EntityKey = keyof typeof BATCH_SCHEMAS;
export const INGEST_ORDER: EntityKey[] = [
  "costCenters", "customers", "suppliers", "products", "sellers", "financialAccounts",
  "sales", "revenues", "expenses", "payables", "receivables", "payments",
];

export const ENTITY_LABELS: Record<EntityKey, string> = {
  costCenters: "Centros de custo",
  customers: "Clientes",
  suppliers: "Fornecedores",
  products: "Produtos/Serviços",
  sellers: "Vendedores",
  financialAccounts: "Contas financeiras",
  sales: "Vendas",
  revenues: "Receitas",
  expenses: "Despesas",
  payables: "Contas a pagar",
  receivables: "Contas a receber",
  payments: "Pagamentos/Recebimentos",
};
