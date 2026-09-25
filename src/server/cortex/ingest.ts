import type { Prisma, TitleStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { errorMessage } from "@/lib/logger";
import { normalizeText, round } from "@/lib/utils";
import {
  BATCH_SCHEMAS, INGEST_ORDER, type CanonicalBatch, type CostCenterRecord, type CustomerRecord, type EntityKey,
  type ExpenseRecord, type FinancialAccountRecord, type InvoiceRecord, type OrderRecord, type PayableRecord, type PaymentRecord, type ProductRecord,
  type ReceivableRecord, type RevenueRecord, type SaleRecord, type SellerRecord, type SupplierRecord,
} from "./records";

export interface IngestError {
  entity: EntityKey;
  index: number;
  externalId?: string;
  message: string;
}

export interface IngestStats {
  total: number;
  processed: number;
  created: number;
  updated: number;
  rejected: number;
  errors: IngestError[];
}

export function emptyStats(): IngestStats {
  return { total: 0, processed: 0, created: 0, updated: 0, rejected: 0, errors: [] };
}

function titleStatus(amount: number, settled: number): TitleStatus {
  if (settled >= amount - 0.004) return "PAID";
  if (settled > 0) return "PARTIAL";
  return "OPEN";
}

type UniqueWhere = { tenantId_dataSourceId_externalId: { tenantId: string; dataSourceId: string; externalId: string } };

const nameKey = (name: string) => `name:${normalizeText(name).slice(0, 100)}`;

/**
 * Ingestão idempotente no Cortex. Chave natural: (tenantId, dataSourceId, externalId).
 * Reprocessar o mesmo lote nunca duplica registros — apenas atualiza.
 */
export class Ingestor {
  private cache = new Map<string, string | null>();
  readonly stats = emptyStats();

  constructor(
    private readonly tenantId: string,
    private readonly dataSourceId: string,
  ) {}

  private key(ds: { tenantId: string; dataSourceId: string; externalId: string }): UniqueWhere {
    return { tenantId_dataSourceId_externalId: ds };
  }

  private ids(externalId: string) {
    return { tenantId: this.tenantId, dataSourceId: this.dataSourceId, externalId };
  }

  async ingest(batch: CanonicalBatch): Promise<IngestStats> {
    for (const entity of INGEST_ORDER) {
      const rows = batch[entity];
      if (!rows?.length) continue;
      this.stats.total += rows.length;
      for (let i = 0; i < rows.length; i++) {
        const parsed = BATCH_SCHEMAS[entity].safeParse(rows[i]);
        if (!parsed.success) {
          this.reject(entity, i, (rows[i] as { externalId?: string })?.externalId, parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; "));
          continue;
        }
        try {
          const created = await this.upsert(entity, parsed.data);
          this.stats.processed++;
          if (created) this.stats.created++;
          else this.stats.updated++;
        } catch (err) {
          this.reject(entity, i, (parsed.data as { externalId?: string }).externalId, errorMessage(err));
        }
      }
    }
    await prisma.dataSource.update({ where: { id: this.dataSourceId }, data: { lastUpdatedAt: new Date() } });
    return this.stats;
  }

  private reject(entity: EntityKey, index: number, externalId: string | undefined, message: string) {
    this.stats.rejected++;
    if (this.stats.errors.length < 200) this.stats.errors.push({ entity, index, externalId, message: message.slice(0, 500) });
  }

  private async upsert(entity: EntityKey, data: unknown): Promise<boolean> {
    switch (entity) {
      case "costCenters": return this.costCenter(data as CostCenterRecord);
      case "customers": return this.customer(data as CustomerRecord);
      case "suppliers": return this.supplier(data as SupplierRecord);
      case "products": return this.product(data as ProductRecord);
      case "sellers": return this.seller(data as SellerRecord);
      case "financialAccounts": return this.financialAccount(data as FinancialAccountRecord);
      case "sales": return this.sale(data as SaleRecord);
      case "revenues": return this.revenue(data as RevenueRecord);
      case "expenses": return this.expense(data as ExpenseRecord);
      case "payables": return this.payable(data as PayableRecord);
      case "receivables": return this.receivable(data as ReceivableRecord);
      case "payments": return this.payment(data as PaymentRecord);
      case "invoices": return this.invoice(data as InvoiceRecord);
      case "orders": return this.order(data as OrderRecord);
    }
  }

  // ── referências ──

  private async ref(
    kind: "customer" | "supplier" | "seller" | "product" | "costCenter" | "sale" | "financialAccount" | "payable" | "receivable",
    externalId?: string | null,
    name?: string | null,
  ): Promise<string | null> {
    const ext = externalId || (name ? nameKey(name) : null);
    if (!ext) return null;
    const cacheKey = `${kind}:${ext}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey) ?? null;
    const where = { tenantId_dataSourceId_externalId: this.ids(ext) };
    let id: string | null = null;
    switch (kind) {
      case "customer":
        id = (await prisma.customer.findUnique({ where, select: { id: true } }))?.id ?? null;
        if (!id && name) id = (await prisma.customer.create({ data: { ...this.ids(ext), name } })).id;
        break;
      case "supplier":
        id = (await prisma.supplier.findUnique({ where, select: { id: true } }))?.id ?? null;
        if (!id && name) id = (await prisma.supplier.create({ data: { ...this.ids(ext), name } })).id;
        break;
      case "seller":
        id = (await prisma.seller.findUnique({ where, select: { id: true } }))?.id ?? null;
        if (!id && name) id = (await prisma.seller.create({ data: { ...this.ids(ext), name } })).id;
        break;
      case "product":
        id = (await prisma.product.findUnique({ where, select: { id: true } }))?.id ?? null;
        if (!id && name) id = (await prisma.product.create({ data: { ...this.ids(ext), name } })).id;
        break;
      case "costCenter":
        id = (await prisma.costCenter.findFirst({ where: { tenantId: this.tenantId, dataSourceId: this.dataSourceId, OR: [{ externalId: ext }, { code: ext }] }, select: { id: true } }))?.id ?? null;
        break;
      case "sale":
        id = (await prisma.sale.findUnique({ where, select: { id: true } }))?.id ?? null;
        break;
      case "financialAccount":
        id = (await prisma.financialAccount.findUnique({ where, select: { id: true } }))?.id ?? null;
        break;
      case "payable":
        id = (await prisma.accountPayable.findUnique({ where, select: { id: true } }))?.id ?? null;
        break;
      case "receivable":
        id = (await prisma.accountReceivable.findUnique({ where, select: { id: true } }))?.id ?? null;
        break;
    }
    this.cache.set(cacheKey, id);
    return id;
  }

  private async exists(find: (where: UniqueWhere) => Promise<unknown>, externalId: string) {
    return Boolean(await find(this.key(this.ids(externalId))));
  }

  // ── entidades ──

  private async costCenter(r: CostCenterRecord) {
    const existed = await this.exists((where) => prisma.costCenter.findUnique({ where, select: { id: true } }), r.externalId);
    const data = { code: r.code, name: r.name, department: r.department ?? null };
    await prisma.costCenter.upsert({ where: this.key(this.ids(r.externalId)), create: { ...this.ids(r.externalId), ...data }, update: data });
    return !existed;
  }

  private async customer(r: CustomerRecord) {
    const existed = await this.exists((where) => prisma.customer.findUnique({ where, select: { id: true } }), r.externalId);
    const data = { name: r.name, document: r.document ?? null, email: r.email ?? null, segment: r.segment ?? null, region: r.region ?? null, city: r.city ?? null, state: r.state ?? null };
    await prisma.customer.upsert({ where: this.key(this.ids(r.externalId)), create: { ...this.ids(r.externalId), ...data }, update: data });
    return !existed;
  }

  private async supplier(r: SupplierRecord) {
    const existed = await this.exists((where) => prisma.supplier.findUnique({ where, select: { id: true } }), r.externalId);
    const data = { name: r.name, document: r.document ?? null, category: r.category ?? null };
    await prisma.supplier.upsert({ where: this.key(this.ids(r.externalId)), create: { ...this.ids(r.externalId), ...data }, update: data });
    return !existed;
  }

  private async product(r: ProductRecord) {
    const existed = await this.exists((where) => prisma.product.findUnique({ where, select: { id: true } }), r.externalId);
    const data = { name: r.name, sku: r.sku ?? null, category: r.category ?? null, type: r.type, unitPrice: r.unitPrice ?? null, unitCost: r.unitCost ?? null };
    await prisma.product.upsert({ where: this.key(this.ids(r.externalId)), create: { ...this.ids(r.externalId), ...data }, update: data });
    return !existed;
  }

  private async seller(r: SellerRecord) {
    const existed = await this.exists((where) => prisma.seller.findUnique({ where, select: { id: true } }), r.externalId);
    const data = { name: r.name, email: r.email ?? null, region: r.region ?? null, team: r.team ?? null };
    await prisma.seller.upsert({ where: this.key(this.ids(r.externalId)), create: { ...this.ids(r.externalId), ...data }, update: data });
    return !existed;
  }

  private async financialAccount(r: FinancialAccountRecord) {
    const existed = await this.exists((where) => prisma.financialAccount.findUnique({ where, select: { id: true } }), r.externalId);
    const data = { name: r.name, bank: r.bank ?? null, type: r.type, openingBalance: r.openingBalance, openingDate: r.openingDate };
    await prisma.financialAccount.upsert({ where: this.key(this.ids(r.externalId)), create: { ...this.ids(r.externalId), ...data }, update: data });
    return !existed;
  }

  private async sale(r: SaleRecord) {
    const existing = await prisma.sale.findUnique({ where: this.key(this.ids(r.externalId)), select: { id: true } });
    const customerId = await this.ref("customer", r.customerExternalId, r.customerName);
    const sellerId = await this.ref("seller", r.sellerExternalId, r.sellerName);
    const itemsCost = r.items.reduce((a, i) => a + i.totalCost, 0);
    const costAmount = r.costAmount || round(itemsCost);
    const data = {
      number: r.number ?? null,
      date: r.date,
      customerId,
      sellerId,
      status: r.status,
      grossAmount: r.grossAmount,
      discountAmount: r.discountAmount,
      taxAmount: r.taxAmount,
      netAmount: round(r.grossAmount - r.discountAmount - r.taxAmount),
      costAmount,
      region: r.region ?? null,
      channel: r.channel ?? null,
      category: r.category ?? null,
    };
    const items: Omit<Prisma.SaleItemCreateManyInput, "saleId">[] = [];
    for (let i = 0; i < r.items.length; i++) {
      const it = r.items[i];
      items.push({
        tenantId: this.tenantId,
        lineNumber: i + 1,
        productId: await this.ref("product", it.productExternalId, it.productName),
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        discount: it.discount,
        total: it.total,
        totalCost: it.totalCost,
      });
    }
    await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.upsert({ where: this.key(this.ids(r.externalId)), create: { ...this.ids(r.externalId), ...data }, update: data });
      await tx.saleItem.deleteMany({ where: { saleId: sale.id, tenantId: this.tenantId } });
      if (items.length) await tx.saleItem.createMany({ data: items.map((i) => ({ ...i, saleId: sale.id })) });
    });
    return !existing;
  }

  private async revenue(r: RevenueRecord) {
    const existed = await this.exists((where) => prisma.revenue.findUnique({ where, select: { id: true } }), r.externalId);
    const data = { date: r.date, description: r.description, category: r.category, amount: r.amount, customerId: await this.ref("customer", r.customerExternalId, r.customerName) };
    await prisma.revenue.upsert({ where: this.key(this.ids(r.externalId)), create: { ...this.ids(r.externalId), ...data }, update: data });
    return !existed;
  }

  private async expense(r: ExpenseRecord) {
    const existed = await this.exists((where) => prisma.expense.findUnique({ where, select: { id: true } }), r.externalId);
    const data = {
      date: r.date,
      description: r.description,
      category: r.category,
      amount: r.amount,
      supplierId: await this.ref("supplier", r.supplierExternalId, r.supplierName),
      costCenterId: await this.ref("costCenter", r.costCenterCode),
      department: r.department ?? null,
    };
    await prisma.expense.upsert({ where: this.key(this.ids(r.externalId)), create: { ...this.ids(r.externalId), ...data }, update: data });
    return !existed;
  }

  private async payable(r: PayableRecord) {
    const existed = await this.exists((where) => prisma.accountPayable.findUnique({ where, select: { id: true } }), r.externalId);
    const data = {
      description: r.description,
      category: r.category ?? null,
      supplierId: await this.ref("supplier", r.supplierExternalId, r.supplierName),
      costCenterId: await this.ref("costCenter", r.costCenterCode),
      department: r.department ?? null,
      companyUnit: r.companyUnit ?? null,
      issueDate: r.issueDate,
      dueDate: r.dueDate,
      amount: r.amount,
      paidAmount: r.paidAmount,
      paidAt: r.paidAt ?? null,
      status: titleStatus(r.amount, r.paidAmount),
    };
    await prisma.accountPayable.upsert({ where: this.key(this.ids(r.externalId)), create: { ...this.ids(r.externalId), ...data }, update: data });
    return !existed;
  }

  private async receivable(r: ReceivableRecord) {
    const existed = await this.exists((where) => prisma.accountReceivable.findUnique({ where, select: { id: true } }), r.externalId);
    const data = {
      description: r.description,
      customerId: await this.ref("customer", r.customerExternalId, r.customerName),
      saleId: await this.ref("sale", r.saleExternalId),
      issueDate: r.issueDate,
      dueDate: r.dueDate,
      amount: r.amount,
      receivedAmount: r.receivedAmount,
      receivedAt: r.receivedAt ?? null,
      status: titleStatus(r.amount, r.receivedAmount),
    };
    await prisma.accountReceivable.upsert({ where: this.key(this.ids(r.externalId)), create: { ...this.ids(r.externalId), ...data }, update: data });
    return !existed;
  }

  private async invoice(r: InvoiceRecord) {
    const existed = await this.exists((where) => prisma.invoice.findUnique({ where, select: { id: true } }), r.externalId);
    const data = {
      number: r.number ?? null,
      customerId: await this.ref("customer", r.customerExternalId, r.customerName),
      issueDate: r.issueDate,
      dueDate: r.dueDate ?? null,
      amount: r.amount,
      paidAmount: r.paidAmount,
      status: titleStatus(r.amount, r.paidAmount),
    };
    await prisma.invoice.upsert({ where: this.key(this.ids(r.externalId)), create: { ...this.ids(r.externalId), ...data }, update: data });
    return !existed;
  }

  private async order(r: OrderRecord) {
    const existed = await this.exists((where) => prisma.order.findUnique({ where, select: { id: true } }), r.externalId);
    const data = {
      number: r.number ?? null,
      date: r.date,
      customerId: await this.ref("customer", r.customerExternalId, r.customerName),
      sellerName: r.sellerName ?? null,
      status: r.status ?? null,
      amount: r.amount,
    };
    await prisma.order.upsert({ where: this.key(this.ids(r.externalId)), create: { ...this.ids(r.externalId), ...data }, update: data });
    return !existed;
  }

  private async payment(r: PaymentRecord) {
    const existed = await this.exists((where) => prisma.payment.findUnique({ where, select: { id: true } }), r.externalId);
    const data = {
      direction: r.direction,
      date: r.date,
      amount: r.amount,
      description: r.description ?? null,
      category: r.category ?? null,
      financialAccountId: await this.ref("financialAccount", r.financialAccountExternalId),
      payableId: await this.ref("payable", r.payableExternalId),
      receivableId: await this.ref("receivable", r.receivableExternalId),
    };
    await prisma.payment.upsert({ where: this.key(this.ids(r.externalId)), create: { ...this.ids(r.externalId), ...data }, update: data });
    return !existed;
  }
}

export async function ensureDataSource(tenantId: string, name: string, kind: "INTEGRATION" | "IMPORT" | "MANUAL" | "DEMO", integrationId?: string, description?: string) {
  return prisma.dataSource.upsert({
    where: { tenantId_name: { tenantId, name } },
    create: { tenantId, name, kind, integrationId: integrationId ?? null, description },
    update: {},
  });
}
