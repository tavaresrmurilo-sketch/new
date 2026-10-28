import type { Metadata } from "next";
import { getCompany } from "@/modules/company/service";
import { requireTenantPage } from "@/server/session";
import { CompanyForm } from "./company-form";

export const metadata: Metadata = { title: "Empresa" };

export default async function CompanySettingsPage() {
  const tenant = await requireTenantPage();
  const company = await getCompany(tenant);
  return (
    <CompanyForm
      canEdit={tenant.role !== "MEMBER"}
      initial={{
        name: company.name,
        segment: company.segment,
        phone: company.phone ?? "",
        timezone: company.timezone,
        defaultReturnIntervalDays: String(company.defaultReturnIntervalDays),
      }}
    />
  );
}
