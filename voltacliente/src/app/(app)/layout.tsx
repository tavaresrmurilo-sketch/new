import { AppShell } from "@/components/app/app-shell";
import { getSubscription } from "@/modules/billing/service";
import { countActionable } from "@/modules/returns/service";
import { requireTenantPage } from "@/server/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const tenant = await requireTenantPage();
  const [subscription, returnsBadge] = await Promise.all([getSubscription(tenant), countActionable(tenant)]);
  const planLabel = `Plano ${subscription.plan.name}${subscription.status === "TRIAL" ? " · lançamento" : ""}`;
  return (
    <AppShell
      user={{ name: tenant.user.name, email: tenant.user.email }}
      companyName={tenant.company.name}
      planLabel={planLabel}
      returnsBadge={returnsBadge}
    >
      {children}
    </AppShell>
  );
}
