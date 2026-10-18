import type { Metadata } from "next";
import { PainelPage } from "@/components/painel/shell";
import { formatFullDate, nextTierFor } from "@/components/pricing/pricing";
import { PageHeader } from "@/components/ui/misc";
import { getPlan, getPlans } from "@/server/billing/plans";
import { requireCurrentOrg } from "@/server/organizations/current";
import { listTeam } from "@/server/team/service";
import { TeamManager, type TeamInvite, type TeamMember } from "./team-manager";

export const metadata: Metadata = { title: "Equipe" };

export default async function EquipePage() {
  const { org, user, membership, canManage } = await requireCurrentOrg();
  const [{ members, invites }, plan, plans] = await Promise.all([listTeam(org.id), getPlan(org.plan), getPlans()]);

  const pendingValid = invites.filter((i) => !i.expired).length;
  const upgrade = nextTierFor(
    plans.filter((p) => p.active),
    org.plan,
    (p) => p.maxMembers > plan.maxMembers,
  );

  const memberRows: TeamMember[] = members.map((m) => ({
    userId: m.user.id,
    name: m.user.name,
    email: m.user.email,
    avatarUrl: m.user.avatarUrl,
    role: m.role,
    since: formatFullDate(m.createdAt),
  }));
  const inviteRows: TeamInvite[] = canManage
    ? invites.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        expired: i.expired,
        expiresLabel: formatFullDate(i.expiresAt),
        invitedBy: i.invitedBy?.name ?? null,
      }))
    : [];

  return (
    <PainelPage>
      <PageHeader title="Equipe" description={`Quem publica e cuida dos eventos de ${org.name}.`} />
      <div className="mt-6">
        <TeamManager
          organizationId={org.id}
          orgName={org.name}
          me={{ userId: user.id, role: membership.role }}
          members={memberRows}
          invites={inviteRows}
          canManage={canManage}
          limit={{
            used: members.length + pendingValid,
            max: plan.maxMembers,
            planName: plan.name,
            upgrade: upgrade ? { name: upgrade.name, maxMembers: upgrade.maxMembers } : null,
          }}
        />
      </div>
    </PainelPage>
  );
}
