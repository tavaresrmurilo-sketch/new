import { CompanyForm, OperationalSettingsForm } from "@/features/settings/components/settings-forms";
import { prisma } from "@/lib/db";
import { requireCtx } from "@/server/auth/context";

export const metadata = { title: "Empresa" };

export default async function CompanyPage() {
  const ctx = await requireCtx("settings.manage");
  const org = await prisma.organization.findUnique({ where: { id: ctx.org.id }, select: { name: true, legalName: true, document: true, segment: true, timezone: true, currency: true, logoUrl: true } });
  const canEdit = ctx.access.level === "FULL";
  return (
    <>
      <CompanyForm initial={org!} canEdit={canEdit} />
      <OperationalSettingsForm initial={ctx.org.settings} canEdit={canEdit} />
    </>
  );
}
