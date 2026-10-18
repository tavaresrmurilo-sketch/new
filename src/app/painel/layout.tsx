import type { Metadata } from "next";
import { OnboardingShell, PainelShell, type ShellOrg } from "@/components/painel/shell";
import { requireUser } from "@/server/auth/guards";
import { getPlan } from "@/server/billing/plans";
import { getCurrentMembership, getUserMemberships } from "@/server/organizations/current";

export const metadata: Metadata = {
  title: { default: "Painel do organizador", template: "%s · Painel Mixtour" },
  robots: { index: false, follow: false },
};

/** Painel do organizador: layout próprio (sem a barra inferior do app). */
export default async function PainelLayout({ children }: LayoutProps<"/painel">) {
  const user = await requireUser("/painel");
  const memberships = await getUserMemberships(user.id);
  const current = memberships.length ? await getCurrentMembership(user.id) : null;
  if (!current) return <OnboardingShell>{children}</OnboardingShell>;

  const plan = await getPlan(current.organization.plan);
  const toShell = (m: (typeof memberships)[number]): ShellOrg => ({
    id: m.organizationId,
    name: m.organization.name,
    slug: m.organization.slug,
    logoUrl: m.organization.logoUrl,
    verified: m.organization.verified,
    role: m.role,
    plan: m.organization.plan,
  });

  return (
    <PainelShell
      user={{
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        isAdmin: user.isAdmin,
        hasOrganization: true,
        emailVerified: user.emailVerified,
      }}
      orgs={memberships.map(toShell)}
      current={toShell(current)}
      planName={plan.name}
    >
      {children}
    </PainelShell>
  );
}
