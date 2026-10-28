import { beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "@/lib/dates";
import { createAppointment, deleteAppointment, getAppointment, listAppointments, updateAppointment } from "@/modules/appointments/service";
import { deleteService, getService, updateService } from "@/modules/catalog/service";
import {
  createCustomer,
  deleteCustomer,
  getCustomer,
  listCustomers,
  searchCustomers,
  updateCustomer,
  setCustomerConsent,
} from "@/modules/customers/service";
import { deleteTemplate, saveTemplate } from "@/modules/messaging/service";
import { exportCompanyData } from "@/modules/privacy/service";
import { getDashboard } from "@/modules/reports/service";
import { getContactContext, getReminderHistory, listReturns, markContacted, snoozeReminder } from "@/modules/returns/service";
import { db } from "@/server/db";
import { createTenant, daysAgo, nextPhone, resetDb, today } from "./helpers";
import { addDays } from "@/lib/dates";

beforeEach(resetDb);

async function setup() {
  const a = await createTenant("Empresa A");
  const b = await createTenant("Empresa B");
  const customerA = await createCustomer(a, { name: "Cliente da A", phone: nextPhone(), marketingConsent: true });
  const appointmentA = await createAppointment(a, {
    customerId: customerA.id,
    serviceId: a.serviceIds[0],
    date: daysAgo(200),
    amount: "150",
  });
  const reminderA = await db.returnReminder.findFirstOrThrow({ where: { appointmentId: appointmentA.id } });
  const templateA = await db.messageTemplate.findFirstOrThrow({ where: { companyId: a.companyId } });
  return { a, b, customerA, appointmentA, reminderA, templateA };
}

describe("isolamento entre empresas", () => {
  it("clientes de outra empresa são invisíveis e imutáveis", async () => {
    const { a, b, customerA } = await setup();
    await expect(getCustomer(b, customerA.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(updateCustomer(b, customerA.id, { name: "Hacker", phone: nextPhone() })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(setCustomerConsent(b, customerA.id, false)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(deleteCustomer(b, customerA.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await listCustomers(b, {})).total).toBe(0);
    expect(await searchCustomers(b, "Cliente")).toEqual([]);
    expect((await getCustomer(a, customerA.id)).name).toBe("Cliente da A");
  });

  it("o mesmo telefone pode existir em empresas diferentes, mas não duplicado na mesma", async () => {
    const a = await createTenant("Empresa A");
    const b = await createTenant("Empresa B");
    const phone = nextPhone();
    await createCustomer(a, { name: "Maria", phone });
    await expect(createCustomer(b, { name: "Maria", phone })).resolves.toBeTruthy();
    await expect(createCustomer(a, { name: "Maria 2", phone: phone.replace(/\D/g, "") })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("atendimentos não aceitam cliente ou serviço de outra empresa", async () => {
    const { a, b, customerA, appointmentA } = await setup();
    const customerB = await createCustomer(b, { name: "Cliente da B", phone: nextPhone() });
    await expect(createAppointment(b, { customerId: customerA.id, serviceId: b.serviceIds[0], date: today() })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(createAppointment(b, { customerId: customerB.id, serviceId: a.serviceIds[0], date: today() })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(getAppointment(b, appointmentA.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      updateAppointment(b, appointmentA.id, { customerId: customerA.id, serviceId: a.serviceIds[0], date: today() }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(deleteAppointment(b, appointmentA.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await listAppointments(b, {})).total).toBe(0);
  });

  it("o banco rejeita vínculos entre empresas mesmo se a aplicação falhar (FK composta)", async () => {
    const { b, customerA } = await setup();
    await expect(
      db.appointment.create({
        data: { companyId: b.companyId, customerId: customerA.id, serviceId: b.serviceIds[0], date: toDbDate(today()) },
      }),
    ).rejects.toThrow();
  });

  it("lembretes e contatos de outra empresa não podem ser lidos nem alterados", async () => {
    const { b, reminderA } = await setup();
    await expect(markContacted(b, reminderA.id, { channel: "WHATSAPP", outcome: "MESSAGE_SENT" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(snoozeReminder(b, reminderA.id, { until: addDays(today(), 5) })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getContactContext(b, reminderA.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getReminderHistory(b, reminderA.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    for (const tab of ["hoje", "atrasados", "proximos", "contatados", "convertidos", "encerrados"] as const) {
      expect((await listReturns(b, { tab })).total).toBe(0);
    }
    expect(await db.contactLog.count()).toBe(0);
  });

  it("serviços e modelos de mensagem são isolados", async () => {
    const { a, b, templateA } = await setup();
    await expect(getService(b, a.serviceIds[0])).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(updateService(b, a.serviceIds[0], { name: "Serviço invadido", returnIntervalDays: 10 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(deleteService(b, a.serviceIds[1])).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(saveTemplate(b, templateA.id, { name: "Invadido", body: "Olá {primeiro_nome}, tudo bem?" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      saveTemplate(b, null, { name: "Com serviço alheio", body: "Olá {primeiro_nome}, tudo bem?", serviceId: a.serviceIds[0] }),
    ).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(deleteTemplate(b, templateA.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("indicadores e exportação só consideram a própria empresa", async () => {
    const { b } = await setup();
    const dashboard = await getDashboard(b, "12m");
    expect(dashboard.kpis.totalCustomers).toBe(0);
    expect(dashboard.kpis.overdue).toBe(0);
    expect(dashboard.recent).toEqual([]);
    const exported = await exportCompanyData(b);
    expect(exported.customers).toEqual([]);
    expect(exported.appointments).toEqual([]);
    expect(exported.company.name).toBe("Empresa B");
  });
});
