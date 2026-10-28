import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { parseCustomersCsv, toCsv, type ImportIssue } from "@/lib/csv";
import { fromDbDate, todayIn, toDbDate } from "@/lib/dates";
import { formatPhone, normalizePhone } from "@/lib/phone";
import { assertCustomerCapacity } from "@/modules/billing/service";
import { db } from "@/server/db";
import { AppError, notFound } from "@/server/errors";
import { logger } from "@/server/logger";
import type { TenantContext } from "@/server/session";
import { CONTACT_PREFERENCE_LABEL } from "@/lib/contact-policy";
import { customerSchema, type CustomerFilter, type CustomerInput, type CustomerSort } from "./schema";

export const CUSTOMERS_PAGE_SIZE = 20;

function buildWhere(ctx: TenantContext, q: string, filter: CustomerFilter): Prisma.CustomerWhereInput {
  const where: Prisma.CustomerWhereInput = { companyId: ctx.companyId };
  const term = q.trim().slice(0, 100);
  if (term) {
    const digits = term.replace(/\D/g, "");
    where.OR = [
      { name: { contains: term, mode: "insensitive" } },
      { email: { contains: term, mode: "insensitive" } },
      ...(digits.length >= 3 ? [{ phoneNormalized: { contains: digits } }] : []),
    ];
  }
  switch (filter) {
    case "com-consentimento":
      where.marketingConsent = true;
      where.doNotContact = false;
      break;
    case "sem-consentimento":
      where.marketingConsent = false;
      break;
    case "nao-contatar":
      where.doNotContact = true;
      break;
    case "retorno-pendente":
      where.reminders = { some: { status: { in: ["PENDING", "CONTACTED"] } } };
      break;
  }
  return where;
}

const ORDER: Record<CustomerSort, Prisma.CustomerOrderByWithRelationInput[]> = {
  nome: [{ name: "asc" }, { id: "asc" }],
  recentes: [{ createdAt: "desc" }, { id: "asc" }],
  antigos: [{ registeredAt: "asc" }, { id: "asc" }],
};

export async function listCustomers(
  ctx: TenantContext,
  options: { q?: string; filter?: CustomerFilter; sort?: CustomerSort; page?: number },
) {
  const page = Math.max(1, Math.floor(options.page ?? 1));
  const where = buildWhere(ctx, options.q ?? "", options.filter ?? "todos");
  const [total, rows] = await Promise.all([
    db.customer.count({ where }),
    db.customer.findMany({
      where,
      orderBy: ORDER[options.sort ?? "nome"],
      skip: (page - 1) * CUSTOMERS_PAGE_SIZE,
      take: CUSTOMERS_PAGE_SIZE,
      select: {
        id: true,
        name: true,
        phone: true,
        phoneNormalized: true,
        email: true,
        contactPreference: true,
        marketingConsent: true,
        doNotContact: true,
        registeredAt: true,
        appointments: { orderBy: { date: "desc" }, take: 1, select: { date: true, service: { select: { name: true } } } },
        reminders: {
          where: { status: { in: ["PENDING", "CONTACTED"] } },
          orderBy: { remindAt: "asc" },
          take: 1,
          select: { remindAt: true, status: true },
        },
        _count: { select: { appointments: true } },
      },
    }),
  ]);
  return {
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / CUSTOMERS_PAGE_SIZE)),
    items: rows.map((c) => ({
      id: c.id,
      name: c.name,
      phone: formatPhone(c.phoneNormalized),
      email: c.email,
      contactPreference: c.contactPreference,
      marketingConsent: c.marketingConsent,
      doNotContact: c.doNotContact,
      registeredAt: fromDbDate(c.registeredAt),
      appointmentsCount: c._count.appointments,
      lastAppointment: c.appointments[0] ? { date: fromDbDate(c.appointments[0].date), serviceName: c.appointments[0].service.name } : null,
      nextReturn: c.reminders[0] ? { date: fromDbDate(c.reminders[0].remindAt), status: c.reminders[0].status } : null,
    })),
  };
}

/** Busca rápida (seleção de cliente em formulários). */
export async function searchCustomers(ctx: TenantContext, q: string) {
  const rows = await db.customer.findMany({
    where: buildWhere(ctx, q, "todos"),
    orderBy: { name: "asc" },
    take: 8,
    select: { id: true, name: true, phoneNormalized: true },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, phone: formatPhone(r.phoneNormalized) }));
}

export async function getCustomer(ctx: TenantContext, id: string) {
  const customer = await db.customer.findFirst({
    where: { id, companyId: ctx.companyId },
    include: {
      appointments: {
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        take: 100,
        include: { service: { select: { id: true, name: true } } },
      },
      reminders: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { service: { select: { name: true } } },
      },
      contactLogs: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { user: { select: { name: true } } },
      },
    },
  });
  if (!customer) throw notFound("Cliente");
  return customer;
}

export async function getCustomerBasic(ctx: TenantContext, id: string) {
  const customer = await db.customer.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!customer) throw notFound("Cliente");
  return customer;
}

function toData(input: ReturnType<typeof customerSchema.parse>, phoneNormalized: string, timezone: string) {
  return {
    name: input.name,
    phone: formatPhone(phoneNormalized),
    phoneNormalized,
    email: input.email,
    notes: input.notes,
    registeredAt: toDbDate(input.registeredAt ?? todayIn(timezone)),
    contactPreference: input.contactPreference,
  };
}

async function assertNoDuplicate(ctx: TenantContext, phoneNormalized: string, email: string | null, exceptId?: string) {
  const sameScope = exceptId ? { id: { not: exceptId } } : {};
  const byPhone = await db.customer.findFirst({
    where: { companyId: ctx.companyId, phoneNormalized, ...sameScope },
    select: { name: true },
  });
  if (byPhone) {
    const message = `Já existe um cliente com este telefone: ${byPhone.name}.`;
    throw new AppError("CONFLICT", message, { phone: message });
  }
  if (email) {
    const byEmail = await db.customer.findFirst({
      where: { companyId: ctx.companyId, email: { equals: email, mode: "insensitive" }, ...sameScope },
      select: { name: true },
    });
    if (byEmail) {
      const message = `Já existe um cliente com este e-mail: ${byEmail.name}.`;
      throw new AppError("CONFLICT", message, { email: message });
    }
  }
}

export async function createCustomer(ctx: TenantContext, raw: CustomerInput) {
  const input = customerSchema.parse(raw);
  const phoneNormalized = normalizePhone(input.phone)!;
  await assertNoDuplicate(ctx, phoneNormalized, input.email);
  const now = new Date();
  return db.$transaction(async (tx) => {
    await assertCustomerCapacity(ctx, 1, tx);
    return tx.customer.create({
      data: {
        companyId: ctx.companyId,
        ...toData(input, phoneNormalized, ctx.timezone),
        marketingConsent: input.marketingConsent && !input.doNotContact,
        consentUpdatedAt: input.marketingConsent ? now : null,
        doNotContact: input.doNotContact,
        doNotContactAt: input.doNotContact ? now : null,
      },
      select: { id: true, name: true },
    });
  });
}

export async function updateCustomer(ctx: TenantContext, id: string, raw: CustomerInput) {
  const input = customerSchema.parse(raw);
  const current = await db.customer.findFirst({
    where: { id, companyId: ctx.companyId },
    select: { marketingConsent: true, doNotContact: true },
  });
  if (!current) throw notFound("Cliente");
  const phoneNormalized = normalizePhone(input.phone)!;
  await assertNoDuplicate(ctx, phoneNormalized, input.email, id);
  const now = new Date();
  const consent = input.marketingConsent && !input.doNotContact;
  return db.customer.update({
    where: { id, companyId: ctx.companyId },
    data: {
      ...toData(input, phoneNormalized, ctx.timezone),
      marketingConsent: consent,
      ...(consent !== current.marketingConsent ? { consentUpdatedAt: now } : {}),
      doNotContact: input.doNotContact,
      ...(input.doNotContact !== current.doNotContact ? { doNotContactAt: input.doNotContact ? now : null } : {}),
    },
    select: { id: true, name: true },
  });
}

/** Registra rapidamente o consentimento informado pelo cliente. */
export async function setCustomerConsent(ctx: TenantContext, id: string, consent: boolean) {
  const current = await db.customer.findFirst({ where: { id, companyId: ctx.companyId }, select: { doNotContact: true } });
  if (!current) throw notFound("Cliente");
  if (consent && current.doNotContact) {
    throw new AppError("CONFLICT", "Este cliente pediu para não ser contatado. Edite o cadastro se ele mudou de ideia.");
  }
  return db.customer.update({
    where: { id, companyId: ctx.companyId },
    data: { marketingConsent: consent, consentUpdatedAt: new Date() },
    select: { id: true },
  });
}

/** Exclusão definitiva (LGPD): remove atendimentos, lembretes e histórico do cliente. */
export async function deleteCustomer(ctx: TenantContext, id: string) {
  const result = await db.customer.deleteMany({ where: { id, companyId: ctx.companyId } });
  if (result.count === 0) throw notFound("Cliente");
  logger.info("customer_deleted", { companyId: ctx.companyId, customerId: id });
}

export type ImportSummary = {
  totalLines: number;
  toCreate: number;
  created: number;
  errors: ImportIssue[];
  duplicatesInFile: ImportIssue[];
  existing: ImportIssue[];
  missingColumns: string[];
};

/**
 * Importa clientes de um CSV. Com `dryRun`, apenas valida e retorna o resumo.
 * Linhas inválidas e duplicadas são ignoradas e listadas no resumo.
 */
export async function importCustomers(ctx: TenantContext, csvText: string, options: { dryRun: boolean }): Promise<ImportSummary> {
  const parsed = parseCustomersCsv(csvText);
  const summary: ImportSummary = {
    totalLines: parsed.totalLines,
    toCreate: 0,
    created: 0,
    errors: parsed.errors,
    duplicatesInFile: parsed.duplicatesInFile,
    existing: [],
    missingColumns: parsed.missingColumns,
  };
  if (parsed.missingColumns.length > 0 || parsed.rows.length === 0) return summary;

  const existingPhones = new Set(
    (
      await db.customer.findMany({
        where: { companyId: ctx.companyId, phoneNormalized: { in: parsed.rows.map((r) => r.phoneNormalized) } },
        select: { phoneNormalized: true },
      })
    ).map((c) => c.phoneNormalized),
  );
  const rows = parsed.rows.filter((row) => {
    if (existingPhones.has(row.phoneNormalized)) {
      summary.existing.push({ line: row.line, message: "telefone já cadastrado" });
      return false;
    }
    return true;
  });
  summary.toCreate = rows.length;
  if (options.dryRun || rows.length === 0) return summary;

  const today = todayIn(ctx.timezone);
  const now = new Date();
  summary.created = await db.$transaction(async (tx) => {
    await assertCustomerCapacity(ctx, rows.length, tx);
    const result = await tx.customer.createMany({
      data: rows.map((row) => ({
        companyId: ctx.companyId,
        name: row.name,
        phone: formatPhone(row.phoneNormalized),
        phoneNormalized: row.phoneNormalized,
        email: row.email,
        notes: row.notes,
        registeredAt: toDbDate(row.registeredAt ?? today),
        contactPreference: row.contactPreference,
        marketingConsent: row.marketingConsent,
        consentUpdatedAt: row.marketingConsent ? now : null,
      })),
      skipDuplicates: true,
    });
    return result.count;
  });
  logger.info("customers_imported", { companyId: ctx.companyId, created: summary.created });
  return summary;
}

export async function exportCustomersCsv(ctx: TenantContext): Promise<string> {
  const customers = await db.customer.findMany({
    where: { companyId: ctx.companyId },
    orderBy: { name: "asc" },
    select: {
      name: true,
      phoneNormalized: true,
      email: true,
      notes: true,
      registeredAt: true,
      contactPreference: true,
      marketingConsent: true,
      doNotContact: true,
    },
  });
  return toCsv(
    ["nome", "telefone", "email", "observacoes", "data_cadastro", "preferencia_contato", "consentimento", "nao_contatar"],
    customers.map((c) => [
      c.name,
      formatPhone(c.phoneNormalized),
      c.email ?? "",
      c.notes ?? "",
      fromDbDate(c.registeredAt).split("-").reverse().join("/"),
      CONTACT_PREFERENCE_LABEL[c.contactPreference].toLowerCase(),
      c.marketingConsent ? "sim" : "não",
      c.doNotContact ? "sim" : "não",
    ]),
  );
}
