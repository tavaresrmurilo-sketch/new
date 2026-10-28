import type { Metadata } from "next";
import Link from "next/link";
import { WrenchIcon } from "lucide-react";
import { AppointmentForm } from "@/components/appointments/appointment-form";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { stringParam } from "@/components/app/pagination";
import { Button } from "@/components/ui/button";
import { formatPhone } from "@/lib/phone";
import { getAppointmentFormData } from "@/modules/appointments/service";
import { getCustomerBasic } from "@/modules/customers/service";
import { getReminderForReturn } from "@/modules/returns/service";
import { AppError } from "@/server/errors";
import { requireTenantPage } from "@/server/session";

export const metadata: Metadata = { title: "Registrar atendimento" };

async function optional<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") return null;
    throw error;
  }
}

export default async function NewAppointmentPage({ searchParams }: PageProps<"/atendimentos/novo">) {
  const tenant = await requireTenantPage();
  const params = await searchParams;
  const form = await getAppointmentFormData(tenant);
  const reminderId = stringParam(params.retorno);
  const customerId = stringParam(params.cliente);
  const reminder = reminderId ? await optional(getReminderForReturn(tenant, reminderId)) : null;
  const customer = !reminder && customerId ? await optional(getCustomerBasic(tenant, customerId)) : null;

  if (form.services.length === 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Registrar atendimento" />
        <EmptyState
          icon={WrenchIcon}
          title="Cadastre um serviço primeiro"
          description="Os atendimentos usam o intervalo de retorno de cada serviço."
          action={
            <Button asChild>
              <Link href="/servicos">Ir para Serviços</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const openReminder = reminder?.open ? reminder : null;
  return (
    <div className="mx-auto max-w-3xl animate-fade-up">
      <PageHeader
        title={openReminder ? "Registrar retorno" : "Registrar atendimento"}
        description="Informe o serviço realizado. O próximo retorno é calculado automaticamente e pode ser ajustado."
      />
      <AppointmentForm
        services={form.services}
        defaultIntervalDays={form.defaultIntervalDays}
        today={form.today}
        fromReminder={
          openReminder
            ? { id: openReminder.id, serviceName: openReminder.serviceName, lastAppointmentDate: openReminder.lastAppointmentDate }
            : undefined
        }
        initial={{
          customer: openReminder
            ? openReminder.customer
            : customer
              ? { id: customer.id, name: customer.name, phone: formatPhone(customer.phoneNormalized) }
              : null,
          serviceId: openReminder?.serviceId ?? "",
          date: form.today,
          amount: "",
          notes: "",
          returnMode: "auto",
          nextReturnDate: "",
        }}
      />
    </div>
  );
}
