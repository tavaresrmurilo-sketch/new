import type { Metadata } from "next";
import { requireTenantPage } from "@/server/session";
import { AccountForms } from "./account-forms";

export const metadata: Metadata = { title: "Minha conta" };

export default async function AccountPage() {
  const tenant = await requireTenantPage();
  return (
    <AccountForms name={tenant.user.name} email={tenant.user.email} isOwner={tenant.role === "OWNER"} companyName={tenant.company.name} />
  );
}
