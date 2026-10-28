import { beforeEach, describe, expect, it } from "vitest";
import { addDays, fromDbDate } from "@/lib/dates";
import { createAppointment, deleteAppointment, updateAppointment } from "@/modules/appointments/service";
import { setServiceActive } from "@/modules/catalog/service";
import { createCustomer, deleteCustomer, importCustomers } from "@/modules/customers/service";
import { deleteCompany } from "@/modules/privacy/service";
import { getReport } from "@/modules/reports/service";
import {
  countActionable,
  dismissReminder,
  getReturnCounts,
  listReturns,
  logWhatsAppOpened,
  markContacted,
  reopenReminder,
  snoozeReminder,
} from "@/modules/returns/service";
import { db } from "@/server/db";
import { createTenant, daysAgo, nextPhone, resetDb, today } from "./helpers";

beforeEach(resetDb);

async function base() {
  const t = await createTenant("ClimaTech");
  const [cleaning, install] = await db.service.findMany({ where: { companyId: t.companyId }, orderBy: { name: "desc" } }); // Limpeza (180), Instalação (365)
  const customer = await createCustomer(t, { name: "João Silva", phone: nextPhone(), marketingConsent: true });
  return { t, cleaning, install, customer };
}

const reminderOf = (appointmentId: string) => db.returnReminder.findFirst({ where: { appointmentId } });

describe("cálculo do retorno", () => {
  it("automático usa o intervalo do serviço; manual respeita a data; 'sem retorno' não cria lembrete", async () => {
    const { t, cleaning, customer } = await base();
    const auto = await createAppointment(t, { customerId: customer.id, serviceId: cleaning.id, date: daysAgo(10) });
    expect(auto.nextReturn).toBe(addDays(daysAgo(10), 180));
    const reminder = await reminderOf(auto.id);
    expect(reminder && fromDbDate(reminder.dueDate)).toBe(addDays(daysAgo(10), 180));

    const other = await createCustomer(t, { name: "Ana", phone: nextPhone() });
    const manual = await createAppointment(t, {
      customerId: other.id,
      serviceId: cleaning.id,
      date: daysAgo(5),
      returnMode: "manual",
      nextReturnDate: addDays(today(), 20),
    });
    expect(manual.nextReturn).toBe(addDays(today(), 20));

    const third = await createCustomer(t, { name: "Bia", phone: nextPhone() });
    const none = await createAppointment(t, { customerId: third.id, serviceId: cleaning.id, date: today(), returnMode: "none" });
    expect(await reminderOf(none.id)).toBeNull();
  });

  it("usa o intervalo padrão da empresa quando o serviço não tem intervalo", async () => {
    const { t, customer } = await base();
    const service = await db.service.create({ data: { companyId: t.companyId, name: "Avulso" } });
    const result = await createAppointment(t, { customerId: customer.id, serviceId: service.id, date: daysAgo(1) });
    expect(result.nextReturn).toBe(addDays(daysAgo(1), 90));
  });

  it("rejeita data futura e serviço inativo", async () => {
    const { t, cleaning, customer } = await base();
    await expect(
      createAppointment(t, { customerId: customer.id, serviceId: cleaning.id, date: addDays(today(), 2) }),
    ).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await setServiceActive(t, cleaning.id, false);
    await expect(createAppointment(t, { customerId: customer.id, serviceId: cleaning.id, date: today() })).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });
});

describe("ciclo de vida dos lembretes", () => {
  it("novo atendimento do mesmo serviço converte o lembrete e cria o próximo (sem duplicar)", async () => {
    const { t, cleaning, customer } = await base();
    const first = await createAppointment(t, { customerId: customer.id, serviceId: cleaning.id, date: daysAgo(200), amount: "150" });
    const r1 = (await reminderOf(first.id))!;
    expect(r1.status).toBe("PENDING");
    expect(await countActionable(t)).toBe(1); // atrasado há 20 dias

    const second = await createAppointment(t, { customerId: customer.id, serviceId: cleaning.id, date: today(), amount: "180,00" });
    expect(second.converted).toBe(true);
    expect((await db.returnReminder.findUniqueOrThrow({ where: { id: r1.id } })).status).toBe("CONVERTED");
    expect((await db.appointment.findUniqueOrThrow({ where: { id: second.id } })).returnOfReminderId).toBe(r1.id);
    const open = await db.returnReminder.findMany({ where: { customerId: customer.id, status: { in: ["PENDING", "CONTACTED"] } } });
    expect(open).toHaveLength(1);
    expect(fromDbDate(open[0].dueDate)).toBe(addDays(today(), 180));

    const report = await getReport(t, { from: daysAgo(30), to: today() }, true);
    expect(report.returnAppointments).toBe(1);
    expect(report.returnedCustomers).toBe(1);
    expect(report.returnRevenueCents).toBe(18000);
    expect(report.totalRevenueCents).toBe(18000);
    expect(report.topServices[0]).toMatchObject({ name: "Limpeza", returns: 1, revenueCents: 18000 });
  });

  it("lançamento retroativo não cria lembrete nem converte o lembrete mais recente", async () => {
    const { t, cleaning, customer } = await base();
    const recent = await createAppointment(t, { customerId: customer.id, serviceId: cleaning.id, date: daysAgo(30) });
    const old = await createAppointment(t, { customerId: customer.id, serviceId: cleaning.id, date: daysAgo(400) });
    expect(old.converted).toBe(false);
    expect(await reminderOf(old.id)).toBeNull();
    expect((await reminderOf(recent.id))!.status).toBe("PENDING");
  });

  it("'Registrar retorno' converte o lembrete de origem mesmo com outro serviço", async () => {
    const { t, cleaning, install, customer } = await base();
    const first = await createAppointment(t, { customerId: customer.id, serviceId: cleaning.id, date: daysAgo(190) });
    const r1 = (await reminderOf(first.id))!;
    const back = await createAppointment(t, { customerId: customer.id, serviceId: install.id, date: today(), fromReminderId: r1.id });
    expect(back.converted).toBe(true);
    expect((await db.returnReminder.findUniqueOrThrow({ where: { id: r1.id } })).status).toBe("CONVERTED");
    await expect(
      createAppointment(t, { customerId: customer.id, serviceId: install.id, date: today(), fromReminderId: r1.id }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("excluir o atendimento de retorno reabre o lembrete", async () => {
    const { t, cleaning, customer } = await base();
    const first = await createAppointment(t, { customerId: customer.id, serviceId: cleaning.id, date: daysAgo(200) });
    const r1 = (await reminderOf(first.id))!;
    await markContacted(t, r1.id, { channel: "WHATSAPP", outcome: "MESSAGE_SENT" });
    const back = await createAppointment(t, { customerId: customer.id, serviceId: cleaning.id, date: today() });
    await deleteAppointment(t, back.id);
    const reopened = await db.returnReminder.findUniqueOrThrow({ where: { id: r1.id } });
    expect(reopened.status).toBe("CONTACTED");
    expect(reopened.convertedAt).toBeNull();
  });

  it("editar o atendimento reagenda ou encerra o lembrete", async () => {
    const { t, cleaning, customer } = await base();
    const a = await createAppointment(t, { customerId: customer.id, serviceId: cleaning.id, date: daysAgo(10) });
    const target = addDays(today(), 45);
    await updateAppointment(t, a.id, {
      customerId: customer.id,
      serviceId: cleaning.id,
      date: daysAgo(10),
      returnMode: "manual",
      nextReturnDate: target,
    });
    const r = (await reminderOf(a.id))!;
    expect(fromDbDate(r.dueDate)).toBe(target);
    expect(fromDbDate(r.remindAt)).toBe(target);
    await updateAppointment(t, a.id, { customerId: customer.id, serviceId: cleaning.id, date: daysAgo(10), returnMode: "none" });
    expect((await reminderOf(a.id))!.status).toBe("DISMISSED");
  });
});

describe("central de retornos", () => {
  async function overdue() {
    const ctx = await base();
    const a = await createAppointment(ctx.t, { customerId: ctx.customer.id, serviceId: ctx.cleaning.id, date: daysAgo(181) });
    return { ...ctx, reminder: (await reminderOf(a.id))! };
  }

  it("separa hoje, atrasados e próximos", async () => {
    const { t, cleaning, customer } = await base();
    const c2 = await createCustomer(t, { name: "Hoje", phone: nextPhone() });
    const c3 = await createCustomer(t, { name: "Próximo", phone: nextPhone() });
    await createAppointment(t, { customerId: customer.id, serviceId: cleaning.id, date: daysAgo(190) });
    await createAppointment(t, { customerId: c2.id, serviceId: cleaning.id, date: daysAgo(180) });
    await createAppointment(t, { customerId: c3.id, serviceId: cleaning.id, date: daysAgo(175) });
    const counts = await getReturnCounts(t);
    expect(counts).toMatchObject({ hoje: 1, atrasados: 1, proximos: 1, contatados: 0 });
    expect((await listReturns(t, { tab: "hoje" })).items[0].customer.name).toBe("Hoje");
  });

  it("abrir o WhatsApp NÃO marca como contatado; o registro é manual e não duplica", async () => {
    const { t, reminder } = await overdue();
    await logWhatsAppOpened(t, reminder.id);
    await logWhatsAppOpened(t, reminder.id);
    let current = await db.returnReminder.findUniqueOrThrow({ where: { id: reminder.id } });
    expect(current.status).toBe("PENDING");
    expect(current.contactCount).toBe(0);
    expect(await db.reminderEvent.count({ where: { reminderId: reminder.id, type: "WHATSAPP_OPENED" } })).toBe(1);

    await markContacted(t, reminder.id, { channel: "WHATSAPP", outcome: "MESSAGE_SENT", message: "Olá!" });
    current = await db.returnReminder.findUniqueOrThrow({ where: { id: reminder.id } });
    expect(current.status).toBe("CONTACTED");
    expect(current.contactCount).toBe(1);
    await expect(markContacted(t, reminder.id, { channel: "WHATSAPP", outcome: "MESSAGE_SENT" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(await db.contactLog.count({ where: { reminderId: reminder.id } })).toBe(1);
  });

  it("bloqueia WhatsApp sem consentimento e respeita o pedido de não contato", async () => {
    const { t, cleaning } = await base();
    const noConsent = await createCustomer(t, { name: "Sem consentimento", phone: nextPhone() });
    const a = await createAppointment(t, { customerId: noConsent.id, serviceId: cleaning.id, date: daysAgo(181) });
    const r = (await reminderOf(a.id))!;
    await expect(logWhatsAppOpened(t, r.id)).rejects.toMatchObject({ code: "FORBIDDEN" });

    const { t: t2, reminder, customer } = await overdue();
    await markContacted(t2, reminder.id, { channel: "PHONE", outcome: "OPTED_OUT" });
    const updated = await db.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(updated.doNotContact).toBe(true);
    expect(updated.marketingConsent).toBe(false);
    expect((await db.returnReminder.findUniqueOrThrow({ where: { id: reminder.id } })).status).toBe("DISMISSED");
    await expect(reopenReminder(t2, reminder.id)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(markContacted(t2, reminder.id, { channel: "PHONE", outcome: "TALKED" })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("adiar muda a data do lembrete e mantém o histórico", async () => {
    const { t, reminder } = await overdue();
    await expect(snoozeReminder(t, reminder.id, { until: today() })).rejects.toMatchObject({ code: "VALIDATION" });
    await snoozeReminder(t, reminder.id, { until: addDays(today(), 7) });
    const current = await db.returnReminder.findUniqueOrThrow({ where: { id: reminder.id } });
    expect(fromDbDate(current.remindAt)).toBe(addDays(today(), 7));
    expect(fromDbDate(current.dueDate)).toBe(addDays(daysAgo(181), 180));
    expect(await countActionable(t)).toBe(0);
    expect(await db.reminderEvent.count({ where: { reminderId: reminder.id, type: "SNOOZED" } })).toBe(1);
  });

  it("encerrar e reabrir", async () => {
    const { t, reminder } = await overdue();
    await dismissReminder(t, reminder.id, { note: "Mudou de cidade" });
    expect((await getReturnCounts(t)).encerrados).toBe(1);
    await reopenReminder(t, reminder.id);
    expect((await db.returnReminder.findUniqueOrThrow({ where: { id: reminder.id } })).status).toBe("PENDING");
  });

  it("taxa de conversão considera apenas contatos registrados", async () => {
    const { t, cleaning } = await base();
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const c = await createCustomer(t, { name: `Cliente ${i}`, phone: nextPhone(), marketingConsent: true });
      const a = await createAppointment(t, { customerId: c.id, serviceId: cleaning.id, date: daysAgo(185) });
      const r = (await reminderOf(a.id))!;
      await markContacted(t, r.id, { channel: "WHATSAPP", outcome: "MESSAGE_SENT" });
      ids.push(c.id);
    }
    await createAppointment(t, { customerId: ids[0], serviceId: cleaning.id, date: today(), amount: "200" });
    const report = await getReport(t, { from: daysAgo(7), to: today() }, false);
    expect(report.contactedReminders).toBe(4);
    expect(report.convertedAfterContact).toBe(1);
    expect(report.conversionRate).toBeCloseTo(0.25);
    expect(report.contacts).toBe(4);
  });
});

describe("importação e exclusão (LGPD)", () => {
  it("importa CSV ignorando inválidos e telefones já cadastrados", async () => {
    const { t, customer } = await base();
    const existing = await db.customer.findUniqueOrThrow({ where: { id: customer.id } });
    const csv = `nome;telefone;consentimento\nNova;(21) 98888-7777;sim\nInválido;123;\nRepetido;${existing.phoneNormalized};\n`;
    const preview = await importCustomers(t, csv, { dryRun: true });
    expect(preview).toMatchObject({ toCreate: 1, created: 0 });
    expect(preview.errors).toHaveLength(1);
    expect(preview.existing).toHaveLength(1);
    const result = await importCustomers(t, csv, { dryRun: false });
    expect(result.created).toBe(1);
    expect(await db.customer.count({ where: { companyId: t.companyId } })).toBe(2);
  });

  it("excluir cliente remove atendimentos, lembretes e contatos", async () => {
    const { t, cleaning, customer } = await base();
    const a = await createAppointment(t, { customerId: customer.id, serviceId: cleaning.id, date: daysAgo(200) });
    const r = (await reminderOf(a.id))!;
    await markContacted(t, r.id, { channel: "WHATSAPP", outcome: "MESSAGE_SENT" });
    await createAppointment(t, { customerId: customer.id, serviceId: cleaning.id, date: today() });
    await deleteCustomer(t, customer.id);
    expect(await db.appointment.count({ where: { customerId: customer.id } })).toBe(0);
    expect(await db.returnReminder.count({ where: { customerId: customer.id } })).toBe(0);
    expect(await db.contactLog.count({ where: { customerId: customer.id } })).toBe(0);
  });

  it("excluir a empresa apaga todos os dados dela e exige confirmação", async () => {
    const { t, cleaning, customer } = await base();
    const other = await createTenant("Outra");
    await createAppointment(t, { customerId: customer.id, serviceId: cleaning.id, date: daysAgo(200) });
    await expect(deleteCompany(t, "nome errado")).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(deleteCompany({ ...t, role: "MEMBER" }, "ClimaTech")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await deleteCompany(t, "ClimaTech");
    for (const count of [
      db.customer.count({ where: { companyId: t.companyId } }),
      db.appointment.count({ where: { companyId: t.companyId } }),
      db.returnReminder.count({ where: { companyId: t.companyId } }),
      db.service.count({ where: { companyId: t.companyId } }),
      db.messageTemplate.count({ where: { companyId: t.companyId } }),
      db.subscription.count({ where: { companyId: t.companyId } }),
    ]) {
      expect(await count).toBe(0);
    }
    expect(await db.company.count({ where: { id: other.companyId } })).toBe(1);
  });
});
