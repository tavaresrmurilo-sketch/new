import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { computeNextReturnDate, formatDate, fromDbDate, todayIn, toDbDate, type ISODate } from "@/lib/dates";
import { db, type Tx } from "@/server/db";
import { AppError, notFound } from "@/server/errors";
import type { TenantContext } from "@/server/session";
import { appointmentSchema, type AppointmentData, type AppointmentInput } from "./schema";

const OPEN_STATUSES = ["PENDING", "CONTACTED"] as const;
export const APPOINTMENTS_PAGE_SIZE = 20;

function resolveNextReturn(input: AppointmentData, intervalDays: number): ISODate | null {
  if (input.returnMode === "none") return null;
  if (input.returnMode === "manual") return input.nextReturnDate;
  return computeNextReturnDate(input.date, intervalDays);
}

async function loadContext(tx: Tx, ctx: TenantContext, input: AppointmentData, allowInactiveServiceId?: string) {
  const [customer, service, company] = await Promise.all([
    tx.customer.findFirst({ where: { id: input.customerId, companyId: ctx.companyId }, select: { id: true } }),
    tx.service.findFirst({
      where: { id: input.serviceId, companyId: ctx.companyId },
      select: { id: true, name: true, active: true, returnIntervalDays: true },
    }),
    tx.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { defaultReturnIntervalDays: true } }),
  ]);
  if (!customer) throw notFound("Cliente");
  if (!service) throw new AppError("VALIDATION", "Serviço não encontrado.", { serviceId: "Escolha um serviço válido." });
  if (!service.active && service.id !== allowInactiveServiceId) {
    throw new AppError("VALIDATION", "Este serviço está inativo.", { serviceId: "Serviço inativo. Ative-o em Serviços para usá-lo." });
  }
  const today = todayIn(ctx.timezone);
  if (input.date > today) {
    throw new AppError("VALIDATION", "A data do atendimento não pode estar no futuro.", {
      date: "Use a data em que o serviço foi realizado.",
    });
  }
  const interval = service.returnIntervalDays ?? company.defaultReturnIntervalDays;
  return { customer, service, nextReturn: resolveNextReturn(input, interval) };
}

async function createReminder(
  tx: Tx,
  ctx: TenantContext,
  data: { customerId: string; serviceId: string; appointmentId: string; dueDate: ISODate },
) {
  const reminder = await tx.returnReminder.create({
    data: {
      companyId: ctx.companyId,
      customerId: data.customerId,
      serviceId: data.serviceId,
      appointmentId: data.appointmentId,
      dueDate: toDbDate(data.dueDate),
      remindAt: toDbDate(data.dueDate),
    },
    select: { id: true },
  });
  await tx.reminderEvent.create({
    data: {
      companyId: ctx.companyId,
      reminderId: reminder.id,
      type: "CREATED",
      userId: ctx.userId,
      note: `Retorno previsto para ${formatDate(data.dueDate)}`,
    },
  });
  return reminder;
}

/** Existe atendimento posterior do mesmo cliente para o mesmo serviço? (lançamentos retroativos) */
async function hasLaterAppointment(tx: Tx, ctx: TenantContext, customerId: string, serviceId: string, date: ISODate, exceptId: string) {
  const count = await tx.appointment.count({
    where: { companyId: ctx.companyId, customerId, serviceId, date: { gt: toDbDate(date) }, id: { not: exceptId } },
  });
  return count > 0;
}

/**
 * Registra um atendimento e atualiza os lembretes:
 * - converte o lembrete de origem ("Registrar retorno") ou o lembrete aberto
 *   mais recente do mesmo serviço (o cliente voltou);
 * - encerra como substituídos outros lembretes abertos do mesmo serviço;
 * - cria o lembrete do próximo retorno, se este for o atendimento mais recente.
 */
export async function createAppointment(ctx: TenantContext, raw: AppointmentInput) {
  const input = appointmentSchema.parse(raw);
  return db.$transaction(async (tx) => {
    const { customer, service, nextReturn } = await loadContext(tx, ctx, input);
    const now = new Date();
    const appointmentDate = toDbDate(input.date);

    let source: { id: string } | null = null;
    if (input.fromReminderId) {
      const reminder = await tx.returnReminder.findFirst({
        where: { id: input.fromReminderId, companyId: ctx.companyId, customerId: customer.id },
        select: { id: true, status: true, appointment: { select: { date: true } } },
      });
      if (!reminder) throw notFound("Lembrete de retorno");
      if (!OPEN_STATUSES.includes(reminder.status as (typeof OPEN_STATUSES)[number])) {
        throw new AppError("CONFLICT", "Este retorno já foi encerrado.");
      }
      if (input.date <= fromDbDate(reminder.appointment.date)) {
        throw new AppError("VALIDATION", "A data do retorno deve ser posterior ao atendimento anterior.", {
          date: "Deve ser posterior ao atendimento anterior.",
        });
      }
      source = reminder;
    }

    const openSameService = await tx.returnReminder.findMany({
      where: {
        companyId: ctx.companyId,
        customerId: customer.id,
        serviceId: service.id,
        status: { in: [...OPEN_STATUSES] },
        appointment: { date: { lte: appointmentDate } },
        ...(source ? { id: { not: source.id } } : {}),
      },
      orderBy: { dueDate: "desc" },
      select: { id: true, appointment: { select: { date: true } } },
    });

    const converted = source ?? openSameService.find((r) => r.appointment.date < appointmentDate) ?? null;
    const superseded = openSameService.filter((r) => r.id !== converted?.id);

    const appointment = await tx.appointment.create({
      data: {
        companyId: ctx.companyId,
        customerId: customer.id,
        serviceId: service.id,
        date: appointmentDate,
        amountCents: input.amount,
        notes: input.notes,
        nextReturnDate: nextReturn ? toDbDate(nextReturn) : null,
        nextReturnManual: input.returnMode === "manual",
        returnOfReminderId: converted?.id ?? null,
        createdById: ctx.userId,
      },
      select: { id: true },
    });

    if (converted) {
      await tx.returnReminder.update({
        where: { id: converted.id, companyId: ctx.companyId },
        data: { status: "CONVERTED", convertedAt: now, closedAt: now, closedReason: null },
      });
      await tx.reminderEvent.create({
        data: {
          companyId: ctx.companyId,
          reminderId: converted.id,
          type: "CONVERTED",
          userId: ctx.userId,
          note: `Cliente retornou: ${service.name} em ${formatDate(input.date)}`,
        },
      });
    }
    if (superseded.length > 0) {
      await tx.returnReminder.updateMany({
        where: { id: { in: superseded.map((r) => r.id) }, companyId: ctx.companyId },
        data: { status: "DISMISSED", closedAt: now, closedReason: "SUPERSEDED" },
      });
      await tx.reminderEvent.createMany({
        data: superseded.map((r) => ({
          companyId: ctx.companyId,
          reminderId: r.id,
          type: "SUPERSEDED" as const,
          userId: ctx.userId,
          note: `Substituído pelo atendimento de ${formatDate(input.date)}`,
        })),
      });
    }

    if (nextReturn && !(await hasLaterAppointment(tx, ctx, customer.id, service.id, input.date, appointment.id))) {
      await createReminder(tx, ctx, { customerId: customer.id, serviceId: service.id, appointmentId: appointment.id, dueDate: nextReturn });
    }

    return { id: appointment.id, converted: Boolean(converted), nextReturn };
  });
}

export async function updateAppointment(ctx: TenantContext, id: string, raw: AppointmentInput) {
  const input = appointmentSchema.parse({ ...(raw as object), fromReminderId: null });
  return db.$transaction(async (tx) => {
    const current = await tx.appointment.findFirst({
      where: { id, companyId: ctx.companyId },
      select: {
        id: true,
        customerId: true,
        serviceId: true,
        reminder: { select: { id: true, status: true, dueDate: true, serviceId: true } },
      },
    });
    if (!current) throw notFound("Atendimento");
    if (current.customerId !== input.customerId) {
      throw new AppError("VALIDATION", "Não é possível trocar o cliente de um atendimento. Exclua e registre novamente.");
    }
    const { service, nextReturn } = await loadContext(tx, ctx, input, current.serviceId);

    await tx.appointment.update({
      where: { id, companyId: ctx.companyId },
      data: {
        serviceId: service.id,
        date: toDbDate(input.date),
        amountCents: input.amount,
        notes: input.notes,
        nextReturnDate: nextReturn ? toDbDate(nextReturn) : null,
        nextReturnManual: input.returnMode === "manual",
      },
    });

    const reminder = current.reminder;
    const now = new Date();
    if (reminder && OPEN_STATUSES.includes(reminder.status as (typeof OPEN_STATUSES)[number])) {
      if (!nextReturn) {
        await tx.returnReminder.update({
          where: { id: reminder.id, companyId: ctx.companyId },
          data: { status: "DISMISSED", closedAt: now, closedReason: "NO_RETURN" },
        });
        await tx.reminderEvent.create({
          data: {
            companyId: ctx.companyId,
            reminderId: reminder.id,
            type: "DISMISSED",
            userId: ctx.userId,
            note: "Retorno removido do atendimento",
          },
        });
      } else if (fromDbDate(reminder.dueDate) !== nextReturn || reminder.serviceId !== service.id) {
        await tx.returnReminder.update({
          where: { id: reminder.id, companyId: ctx.companyId },
          data: { dueDate: toDbDate(nextReturn), remindAt: toDbDate(nextReturn), serviceId: service.id },
        });
        await tx.reminderEvent.create({
          data: {
            companyId: ctx.companyId,
            reminderId: reminder.id,
            type: "RESCHEDULED",
            userId: ctx.userId,
            note: `Retorno alterado para ${formatDate(nextReturn)}`,
          },
        });
      }
    } else if (!reminder && nextReturn && !(await hasLaterAppointment(tx, ctx, current.customerId, service.id, input.date, id))) {
      await createReminder(tx, ctx, { customerId: current.customerId, serviceId: service.id, appointmentId: id, dueDate: nextReturn });
    }
    return { id };
  });
}

/** Exclui um atendimento. Se ele havia convertido um lembrete, o lembrete é reaberto. */
export async function deleteAppointment(ctx: TenantContext, id: string) {
  return db.$transaction(async (tx) => {
    const appointment = await tx.appointment.findFirst({
      where: { id, companyId: ctx.companyId },
      select: { id: true, customerId: true, returnOfReminderId: true },
    });
    if (!appointment) throw notFound("Atendimento");
    if (appointment.returnOfReminderId) {
      const reminder = await tx.returnReminder.findFirst({
        where: { id: appointment.returnOfReminderId, companyId: ctx.companyId },
        select: { id: true, status: true, contactedAt: true },
      });
      if (reminder?.status === "CONVERTED") {
        await tx.returnReminder.update({
          where: { id: reminder.id, companyId: ctx.companyId },
          data: { status: reminder.contactedAt ? "CONTACTED" : "PENDING", convertedAt: null, closedAt: null },
        });
        await tx.reminderEvent.create({
          data: {
            companyId: ctx.companyId,
            reminderId: reminder.id,
            type: "REOPENED",
            userId: ctx.userId,
            note: "Atendimento de retorno excluído",
          },
        });
      }
    }
    await tx.appointment.delete({ where: { id, companyId: ctx.companyId } });
    return { customerId: appointment.customerId };
  });
}

export async function getAppointment(ctx: TenantContext, id: string) {
  const appointment = await db.appointment.findFirst({
    where: { id, companyId: ctx.companyId },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      service: { select: { id: true, name: true, active: true } },
      reminder: { select: { status: true } },
    },
  });
  if (!appointment) throw notFound("Atendimento");
  return appointment;
}

export async function listAppointments(
  ctx: TenantContext,
  options: { q?: string; serviceId?: string; from?: ISODate; to?: ISODate; onlyReturns?: boolean; page?: number },
) {
  const page = Math.max(1, Math.floor(options.page ?? 1));
  const where: Prisma.AppointmentWhereInput = { companyId: ctx.companyId };
  const term = options.q?.trim().slice(0, 100);
  if (term) where.customer = { name: { contains: term, mode: "insensitive" } };
  if (options.serviceId) where.serviceId = options.serviceId;
  if (options.from || options.to) {
    where.date = {
      ...(options.from ? { gte: toDbDate(options.from) } : {}),
      ...(options.to ? { lte: toDbDate(options.to) } : {}),
    };
  }
  if (options.onlyReturns) where.returnOfReminderId = { not: null };

  const [total, rows, sum] = await Promise.all([
    db.appointment.count({ where }),
    db.appointment.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * APPOINTMENTS_PAGE_SIZE,
      take: APPOINTMENTS_PAGE_SIZE,
      select: {
        id: true,
        date: true,
        amountCents: true,
        notes: true,
        nextReturnDate: true,
        returnOfReminderId: true,
        customer: { select: { id: true, name: true } },
        service: { select: { id: true, name: true } },
        reminder: { select: { status: true } },
      },
    }),
    db.appointment.aggregate({ where, _sum: { amountCents: true } }),
  ]);

  return {
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / APPOINTMENTS_PAGE_SIZE)),
    totalAmountCents: sum._sum.amountCents ?? 0,
    items: rows.map((a) => ({
      id: a.id,
      date: fromDbDate(a.date),
      amountCents: a.amountCents,
      notes: a.notes,
      nextReturnDate: a.nextReturnDate ? fromDbDate(a.nextReturnDate) : null,
      isReturn: a.returnOfReminderId !== null,
      reminderStatus: a.reminder?.status ?? null,
      customer: a.customer,
      service: a.service,
    })),
  };
}

/** Dados para o formulário de atendimento (serviços ativos e intervalos). */
export async function getAppointmentFormData(ctx: TenantContext) {
  const [services, company] = await Promise.all([
    db.service.findMany({
      where: { companyId: ctx.companyId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, returnIntervalDays: true, defaultPriceCents: true },
    }),
    db.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { defaultReturnIntervalDays: true } }),
  ]);
  return { services, defaultIntervalDays: company.defaultReturnIntervalDays, today: todayIn(ctx.timezone) };
}
