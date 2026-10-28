import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { getPlanUsage } from "@/modules/billing/service";
import { requireTenantPage } from "@/server/session";
import { ImportClient } from "./import-client";

export const metadata: Metadata = { title: "Importar clientes" };

export default async function ImportCustomersPage() {
  const tenant = await requireTenantPage();
  const usage = await getPlanUsage(tenant);
  return (
    <div className="mx-auto max-w-3xl animate-fade-up">
      <PageHeader
        title="Importar clientes"
        description="Envie uma planilha CSV. Validamos cada linha antes de importar e ignoramos telefones já cadastrados."
      />
      <ImportClient
        planName={usage.subscription.plan.name}
        remaining={usage.limit === null ? null : Math.max(0, usage.limit - usage.customers)}
      />
    </div>
  );
}
