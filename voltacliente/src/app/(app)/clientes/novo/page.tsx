import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { CustomerForm } from "@/components/customers/customer-form";
import { todayIn } from "@/lib/dates";
import { requireTenantPage } from "@/server/session";

export const metadata: Metadata = { title: "Novo cliente" };

export default async function NewCustomerPage() {
  const tenant = await requireTenantPage();
  return (
    <div className="mx-auto max-w-3xl animate-fade-up">
      <PageHeader title="Novo cliente" description="Telefone com DDD é obrigatório e evita cadastros duplicados." />
      <CustomerForm today={todayIn(tenant.timezone)} />
    </div>
  );
}
