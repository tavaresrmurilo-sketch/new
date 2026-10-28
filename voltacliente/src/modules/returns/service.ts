import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { whatsappDecision } from "@/lib/contact-policy";
import { addDays, formatDate, fromDbDate, todayIn, toDbDate, type ISODate } from "@/lib/dates";
import { formatPhone } from "@/lib/phone";
import { db } from "@/server/db";
import { AppError, notFound } from "@/server/errors";
import type { TenantContext } from "@/server/session";
import { contactSchema, dismissSchema, OUTCOME_LABEL, snoozeSchema, type ContactInput, type ReturnTab, type SnoozeInput } from "./schema";

export const RETURNS_PAGE_SIZE = 20;
export const UPCOMING_WINDOW_DAYS = 30;
const OPEN = ["PENDING", "CONTACTED"] as const;
const DUPLICATE_CONTACT_WINDOW_MS = 2 * 60 * 1000;

function tabWhere(ctx: TenantContext, tab: ReturnTab, today: ISODate): Prisma.ReturnReminderWhereInput {
  const base = { companyId: ctx.companyId };
  const todayDate = toDbDate(today);
  switch (tab) {
    case "hoje":
      return { ...base, status: "PENDING", remindAt: todayDate };
    case "atrasados":
      return { ...base, status: "PENDING", remindAt: { lt: todayDate } };
    case "proximos":
      return { ...base, status: "PENDING", remindAt: { gt: todayDate, lte: toDbDate(addDays(today, UPCOMING_WINDOW_DAYS)) } };
    case "contatados":
      return { ...base, status: "CONTACTED" };
    case "convertidos":
      return { ...base, status: "CONVERTED" };
    case "encerrados":
      return { ...base, status: "DISMISSED", closedReason: { not: "SUPERSEDED" } };
  }
}

const TAB_ORDER: Record<ReturnTab, Prisma.ReturnReminderOrderByWithRelationInput[]> = {
  hoje: [{ dueDate: "asc" }, { id: "asc" }],
  atrasados: [{ remindAt: "asc" }, { id: "asc" }],
  proximos: [{ remindAt: "asc" }, { id: "asc" }],
  contatados: [{ contactedAt: "desc" }, { id: "asc" }],
  convertidos: [{ convertedAt: "desc" }, { id: "asc" }],
  encerrados: [{ closedAt: "desc" }, { id: "asc" }],
};

/** Quantidade de retornos que pedem ação hoje (hoje + atrasados). */
export async function countActionable(ctx: TenantContext) {
  const today = todayIn(ctx.timezone);
  return db.returnReminder.count({ where: { companyId: ctx.companyId, status: "PENDING", remindAt: { lte: toDbDate(today) } } });
}

export async function getReturnCounts(ctx: TenantContext) {
  const today = todayIn(ctx.timezone);
  const tabs: ReturnTab[] = ["hoje", "atrasados", "proximos", "contatados", "convertidos", "encerrados"];
  const counts = await Promise.all(tabs.map((tab) => db.returnReminder.count({ where: tabWhere(ctx, tab, today) })));
  return Object.fromEntries(tabs.map((tab, i) => [tab, counts[i]])) as Record<ReturnTab, number>;
}

export async function listReturns(ctx: TenantContext, options: { tab: ReturnTab; q?: string; page?: number }) {
  const today = todayIn(ctx.timezone);
  const page = Math.max(1, Math.floor(options.page ?? 1));
  const where = tabWhere(ctx, options.tab, today);
  const term = options.q?.trim().slice(0, 100);
  if (term) where.customer = { name: { contains: term, mode: "insensitive" } };

  const [total, rows] = await Promise.all([
    db.returnReminder.count({ where }),
    db.returnReminder.findMany({
      where,
      orderBy: TAB_ORDER[options.tab],
      skip: (page - 1) * RETURNS_PAGE_SIZE,
      take: RETURNS_PAGE_SIZE,
      select: {
        id: true,
        status: true,
        dueDate: true,
        remindAt: true,
        contactCount: true,
        contactedAt: true,
        convertedAt: true,
        closedAt: true,
        closedReason: true,
        customer: {
          select: {
            id: true,
            name: true,
            phoneNormalized: true,
            email: true,
            contactPreference: true,
            marketingConsent: true,
            doNotContact: true,
          },
        },
        service: { select: { id: true, name: true } },
        appointment: { select: { date: true } },
        conversion: { select: { date: true, amountCents: true, service: { select: { name: true } } } },
        contactLogs: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true, outcome: true, channel: true } },
      },
    }),
  ]);

  return {
    today,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / RETURNS_PAGE_SIZE)),
    items: rows.map((r) => ({
      id: r.id,
      status: r.status,
      dueDate: fromDbDate(r.dueDate),
      remindAt: fromDbDate(r.remindAt),
      snoozed: r.remindAt.getTime() !== r.dueDate.getTime(),
      contactCount: r.contactCount,
      contactedAt: r.contactedAt?.toISOString() ?? null,
      convertedAt: r.convertedAt?.toISOString() ?? null,
      closedReason: r.closedReason,
      lastAppointmentDate: fromDbDate(r.appointment.date),
      customer: {
        id: r.customer.id,
        name: r.customer.name,
        phone: formatPhone(r.customer.phoneNormalized),
        phoneNormalized: r.customer.phoneNormalized,
        email: r.customer.email,
        contactPreference: r.customer.contactPreference,
        marketingConsent: r.customer.marketingConsent,
        doNotContact: r.customer.doNotContact,
      },
      service: r.service,
      conversion: r.conversion
        ? { date: fromDbDate(r.conversion.date), amountCents: r.conversion.amountCents, serviceName: r.conversion.service.name }
        : null,
      lastContact: r.contactLogs[0]
        ? { at: r.contactLogs[0].createdAt.toISOString(), outcome: r.contactLogs[0].outcome, channel: r.contactLogs[0].channel }
        : null,
    })),
  };
}

export type ReturnListItem = Awaited<ReturnType<typeof listReturns>>["items"][number];

async function findReminder(ctx: TenantContext, id: string) {
  const reminder = await db.returnReminder.findFirst({
    where: { id, companyId: ctx.companyId },
    select: {
      id: true,
      status: true,
      customerId: true,
      serviceId: true,
      contactedAt: true,
      remindAt: true,
      customer: { select: { doNotContact: true, marketingConsent: true, contactPreference: true, email: true } },
    },
  });
  if (!reminder) throw notFound("Lembrete de retorno");
  return reminder;
}

function assertOpen(status: string) {
  if (!OPEN.includes(status as (typeof OPEN)[number])) {
    throw new AppError("CONFLICT", "Este retorno já foi encerrado. Atualize a página.");
  }
}

/** Dados para montar a mensagem de contato (modelos, variáveis, telefone). */
export async function getContactContext(ctx: TenantContext, id: string) {
  const reminder = await db.returnReminder.findFirst({
    where: { id, companyId: ctx.companyId },
    select: {
      id: true,
      status: true,
      dueDate: true,
      serviceId: true,
      appointment: { select: { date: true } },
      service: { select: { name: true } },
      customer: {
        select: {
          id: true,
          name: true,
          phoneNormalized: true,
          email: true,
          contactPreference: true,
          marketingConsent: true,
          doNotContact: true,
        },
      },
    },
  });
  if (!reminder) throw notFound("Lembrete de retorno");
  const [company, templates] = await Promise.all([
    db.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { name: true, phone: true } }),
    db.messageTemplate.findMany({
      where: { companyId: ctx.companyId },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      select: { id: true, name: true, body: true, isDefault: true, serviceId: true },
    }),
  ]);
  const suggested = templates.find((t) => t.serviceId === reminder.serviceId) ?? templates.find((t) => t.isDefault) ?? templates[0] ?? null;
  return {
    reminderId: reminder.id,
    status: reminder.status,
    today: todayIn(ctx.timezone),
    company,
    customer: { ...reminder.customer, phone: formatPhone(reminder.customer.phoneNormalized) },
    serviceName: reminder.service.name,
    lastAppointmentDate: fromDbDate(reminder.appointment.date),
    recommendedDate: fromDbDate(reminder.dueDate),
    templates,
    suggestedTemplateId: suggested?.id ?? null,
  };
}

/**
 * Registra que o WhatsApp foi ABERTO com a mensagem preenchida. Isso não
 * significa que a mensagem foi enviada — o status do lembrete não muda.
 */
export async function logWhatsAppOpened(ctx: TenantContext, id: string) {
  const reminder = await findReminder(ctx, id);
  assertOpen(reminder.status);
  const decision = whatsappDecision(reminder.customer);
  if (!decision.allowed) throw new AppError("FORBIDDEN", decision.reason);
  const recent = await db.reminderEvent.findFirst({
    where: { companyId: ctx.companyId, reminderId: id, type: "WHATSAPP_OPENED", createdAt: { gte: new Date(Date.now() - 60_000) } },
    select: { id: true },
  });
  if (recent) return;
  await db.reminderEvent.create({
    data: {
      companyId: ctx.companyId,
      reminderId: id,
      type: "WHATSAPP_OPENED",
      userId: ctx.userId,
      note: "WhatsApp aberto (envio não confirmado)",
    },
  });
}

/** Registro manual de contato realizado. */
export async function markContacted(ctx: TenantContext, id: string, raw: ContactInput) {
  const input = contactSchema.parse(raw);
  return db.$transaction(async (tx) => {
    const reminder = await tx.returnReminder.findFirst({
      where: { id, companyId: ctx.companyId },
      select: { id: true, status: true, customerId: true, contactedAt: true, customer: { select: { doNotContact: true } } },
    });
    if (!reminder) throw notFound("Lembrete de retorno");
    assertOpen(reminder.status);
    if (reminder.customer.doNotContact) {
      throw new AppError("FORBIDDEN", "Este cliente pediu para não ser contatado.");
    }
    const duplicate = await tx.contactLog.findFirst({
      where: { companyId: ctx.companyId, reminderId: id, createdAt: { gte: new Date(Date.now() - DUPLICATE_CONTACT_WINDOW_MS) } },
      select: { id: true },
    });
    if (duplicate) throw new AppError("CONFLICT", "Este contato já foi registrado há instantes.");

    const now = new Date();
    await tx.contactLog.create({
      data: {
        companyId: ctx.companyId,
        customerId: reminder.customerId,
        reminderId: id,
        userId: ctx.userId,
        channel: input.channel,
        outcome: input.outcome,
        note: input.note,
        message: input.message,
      },
    });

    const closes = input.outcome === "DECLINED" || input.outcome === "OPTED_OUT";
    await tx.returnReminder.update({
      where: { id, companyId: ctx.companyId },
      data: {
        contactCount: { increment: 1 },
        contactedAt: reminder.contactedAt ?? now,
        ...(closes ? { status: "DISMISSED", closedAt: now, closedReason: input.outcome } : { status: "CONTACTED" }),
      },
    });
    await tx.reminderEvent.create({
      data: {
        companyId: ctx.companyId,
        reminderId: id,
        type: closes ? "DISMISSED" : "CONTACTED",
        userId: ctx.userId,
        note: [OUTCOME_LABEL[input.outcome], input.note].filter(Boolean).join(" — "),
      },
    });

    if (input.outcome === "OPTED_OUT") {
      await tx.customer.update({
        where: { id: reminder.customerId, companyId: ctx.companyId },
        data: { doNotContact: true, doNotContactAt: now, marketingConsent: false, consentUpdatedAt: now },
      });
    }
    return { closed: closes };
  });
}

/** Adia o lembrete para uma nova data (volta para a fila de contato nessa data). */
export async function snoozeReminder(ctx: TenantContext, id: string, raw: SnoozeInput) {
  const input = snoozeSchema.parse(raw);
  const today = todayIn(ctx.timezone);
  if (input.until <= today) throw new AppError("VALIDATION", "Escolha uma data a partir de amanhã.", { until: "Escolha uma data futura." });
  if (input.until > addDays(today, 730)) throw new AppError("VALIDATION", "Adie por no máximo 2 anos.", { until: "Data muito distante." });
  const reminder = await findReminder(ctx, id);
  assertOpen(reminder.status);
  await db.$transaction([
    db.returnReminder.update({ where: { id, companyId: ctx.companyId }, data: { remindAt: toDbDate(input.until), status: "PENDING" } }),
    db.reminderEvent.create({
      data: {
        companyId: ctx.companyId,
        reminderId: id,
        type: "SNOOZED",
        userId: ctx.userId,
        note: [`Adiado para ${formatDate(input.until)}`, input.note].filter(Boolean).join(" — "),
      },
    }),
  ]);
}

/** Encerra o lembrete sem retorno. */
export async function dismissReminder(ctx: TenantContext, id: string, raw: { note?: string | null }) {
  const input = dismissSchema.parse(raw);
  const reminder = await findReminder(ctx, id);
  assertOpen(reminder.status);
  const now = new Date();
  await db.$transaction([
    db.returnReminder.update({
      where: { id, companyId: ctx.companyId },
      data: { status: "DISMISSED", closedAt: now, closedReason: "MANUAL" },
    }),
    db.reminderEvent.create({
      data: {
        companyId: ctx.companyId,
        reminderId: id,
        type: "DISMISSED",
        userId: ctx.userId,
        note: input.note ?? "Encerrado manualmente",
      },
    }),
  ]);
}

/** Reabre um lembrete encerrado manualmente (se não houver outro aberto para o mesmo serviço). */
export async function reopenReminder(ctx: TenantContext, id: string) {
  const reminder = await findReminder(ctx, id);
  if (reminder.status !== "DISMISSED") throw new AppError("CONFLICT", "Apenas retornos encerrados podem ser reabertos.");
  if (reminder.customer.doNotContact) throw new AppError("CONFLICT", "Este cliente pediu para não ser contatado.");
  const otherOpen = await db.returnReminder.count({
    where: {
      companyId: ctx.companyId,
      customerId: reminder.customerId,
      serviceId: reminder.serviceId,
      status: { in: [...OPEN] },
      id: { not: id },
    },
  });
  if (otherOpen > 0) throw new AppError("CONFLICT", "Já existe um retorno em aberto para este cliente e serviço.");
  const today = todayIn(ctx.timezone);
  const remindAt = fromDbDate(reminder.remindAt) < today ? today : fromDbDate(reminder.remindAt);
  await db.$transaction([
    db.returnReminder.update({
      where: { id, companyId: ctx.companyId },
      data: { status: reminder.contactedAt ? "CONTACTED" : "PENDING", closedAt: null, closedReason: null, remindAt: toDbDate(remindAt) },
    }),
    db.reminderEvent.create({
      data: { companyId: ctx.companyId, reminderId: id, type: "REOPENED", userId: ctx.userId, note: "Retorno reaberto" },
    }),
  ]);
}

export async function getReminderHistory(ctx: TenantContext, id: string) {
  await findReminder(ctx, id);
  const [events, contacts] = await Promise.all([
    db.reminderEvent.findMany({
      where: { companyId: ctx.companyId, reminderId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, type: true, note: true, createdAt: true, user: { select: { name: true } } },
    }),
    db.contactLog.findMany({
      where: { companyId: ctx.companyId, reminderId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, channel: true, outcome: true, note: true, message: true, createdAt: true, user: { select: { name: true } } },
    }),
  ]);
  return {
    events: events.map((e) => ({ ...e, createdAt: e.createdAt.toISOString(), userName: e.user?.name ?? null })),
    contacts: contacts.map((c) => ({ ...c, createdAt: c.createdAt.toISOString(), userName: c.user?.name ?? null })),
  };
}

/** Dados do lembrete para pré-preencher "Registrar retorno". */
export async function getReminderForReturn(ctx: TenantContext, id: string) {
  const reminder = await db.returnReminder.findFirst({
    where: { id, companyId: ctx.companyId },
    select: {
      id: true,
      status: true,
      serviceId: true,
      dueDate: true,
      appointment: { select: { date: true } },
      service: { select: { name: true, active: true } },
      customer: { select: { id: true, name: true, phoneNormalized: true } },
    },
  });
  if (!reminder) throw notFound("Lembrete de retorno");
  return {
    id: reminder.id,
    open: reminder.status === "PENDING" || reminder.status === "CONTACTED",
    serviceId: reminder.service.active ? reminder.serviceId : null,
    serviceName: reminder.service.name,
    lastAppointmentDate: fromDbDate(reminder.appointment.date),
    customer: { id: reminder.customer.id, name: reminder.customer.name, phone: formatPhone(reminder.customer.phoneNormalized) },
  };
}
