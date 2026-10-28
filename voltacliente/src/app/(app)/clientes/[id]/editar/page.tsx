import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { CustomerForm } from "@/components/customers/customer-form";
import { fromDbDate, todayIn } from "@/lib/dates";
import { getCustomerBasic } from "@/modules/customers/service";
import { orNotFound } from "@/server/errors";
import { requireTenantPage } from "@/server/session";

export const metadata: Metadata = { title: "Editar cliente" };

export default async function EditCustomerPage({ params }: PageProps<"/clientes/[id]/editar">) {
  const tenant = await requireTenantPage();
  const { id } = await params;
  const customer = await orNotFound(getCustomerBasic(tenant, id));
  return (
    <div className="mx-auto max-w-3xl animate-fade-up">
      <PageHeader title="Editar cliente" description={customer.name} />
      <CustomerForm
        id={customer.id}
        today={todayIn(tenant.timezone)}
        initial={{
          name: customer.name,
          phone: customer.phone,
          email: customer.email ?? "",
          notes: customer.notes ?? "",
          registeredAt: fromDbDate(customer.registeredAt),
          contactPreference: customer.contactPreference,
          marketingConsent: customer.marketingConsent,
          doNotContact: customer.doNotContact,
        }}
      />
    </div>
  );
}
