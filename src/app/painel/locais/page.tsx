import type { Metadata } from "next";
import { PainelPage } from "@/components/painel/shell";
import { VenuesManager } from "@/components/painel/venues-manager";
import { PageHeader } from "@/components/ui/misc";
import { getPlan } from "@/server/billing/plans";
import { requireCurrentOrg } from "@/server/organizations/current";
import { listVenues } from "@/server/organizations/venues";

export const metadata: Metadata = { title: "Locais" };

export default async function LocaisPage() {
  const { org } = await requireCurrentOrg();
  const [venues, plan] = await Promise.all([listVenues(org.id), getPlan(org.plan)]);
  return (
    <PainelPage>
      <PageHeader title="Locais" description="Endereços que sua organização usa com frequência, prontos para reutilizar no editor de eventos." />
      <div className="mt-6">
        <VenuesManager
          organizationId={org.id}
          venues={venues}
          limit={plan.maxVenues}
          planName={plan.name}
          defaults={{ city: org.city ?? "", state: org.state ?? "" }}
        />
      </div>
    </PainelPage>
  );
}
