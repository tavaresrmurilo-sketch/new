import type { Metadata } from "next";
import { OnboardingLogo } from "@/components/painel/onboarding-form";
import { requireCurrentOrg } from "@/server/organizations/current";

export const metadata: Metadata = { title: "Logo da organização" };

/** Passo opcional do onboarding (logo). */
export default async function ComecarLogoPage() {
  const { org } = await requireCurrentOrg("ADMIN");
  return (
    <main className="mx-auto w-full max-w-xl px-4 pt-6 pb-16 sm:px-6 lg:pt-14">
      <p className="text-sm font-semibold text-primary">Passo 2 de 2</p>
      <section aria-label="Logo da organização" className="mt-3 rounded-3xl border border-border bg-surface p-5 shadow-card sm:p-7">
        <OnboardingLogo organizationId={org.id} slug={org.slug} logoUrl={org.logoUrl} />
      </section>
    </main>
  );
}
