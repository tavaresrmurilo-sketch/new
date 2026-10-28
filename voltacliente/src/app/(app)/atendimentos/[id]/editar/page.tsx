import type { Metadata } from "next";
import { AppointmentForm } from "@/components/appointments/appointment-form";
import { PageHeader } from "@/components/app/page-header";
import { fromDbDate } from "@/lib/dates";
import { centsToInput } from "@/lib/money";
import { getAppointment, getAppointmentFormData } from "@/modules/appointments/service";
import { orNotFound } from "@/server/errors";
import { requireTenantPage } from "@/server/session";

export const metadata: Metadata = { title: "Editar atendimento" };

export default async function EditAppointmentPage({ params }: PageProps<"/atendimentos/[id]/editar">) {
  const tenant = await requireTenantPage();
  const { id } = await params;
  const [appointment, form] = await Promise.all([orNotFound(getAppointment(tenant, id)), getAppointmentFormData(tenant)]);
  const services = form.services.some((s) => s.id === appointment.service.id)
    ? form.services
    : [
        ...form.services,
        { id: appointment.service.id, name: `${appointment.service.name} (inativo)`, returnIntervalDays: null, defaultPriceCents: null },
      ];
  const reminderClosed = appointment.reminder && appointment.reminder.status !== "PENDING" && appointment.reminder.status !== "CONTACTED";

  return (
    <div className="mx-auto max-w-3xl animate-fade-up">
      <PageHeader
        title="Editar atendimento"
        description={
          reminderClosed
            ? "O retorno deste atendimento já foi encerrado; alterar a data de retorno não reabre o lembrete."
            : "Alterações na data de retorno atualizam o lembrete correspondente."
        }
      />
      <AppointmentForm
        id={appointment.id}
        services={services}
        defaultIntervalDays={form.defaultIntervalDays}
        today={form.today}
        initial={{
          customer: { id: appointment.customer.id, name: appointment.customer.name, phone: appointment.customer.phone },
          serviceId: appointment.service.id,
          date: fromDbDate(appointment.date),
          amount: centsToInput(appointment.amountCents),
          notes: appointment.notes ?? "",
          returnMode: appointment.nextReturnDate ? (appointment.nextReturnManual ? "manual" : "auto") : "none",
          nextReturnDate: appointment.nextReturnDate ? fromDbDate(appointment.nextReturnDate) : "",
        }}
      />
    </div>
  );
}
