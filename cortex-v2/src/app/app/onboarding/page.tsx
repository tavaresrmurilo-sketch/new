import { redirect } from "next/navigation";
import { OnboardingWizard } from "@/features/onboarding/components/onboarding-wizard";
import { requireCtx } from "@/server/auth/context";

export const metadata = { title: "Primeiros passos" };

export default async function OnboardingPage() {
  const ctx = await requireCtx();
  if (!ctx.permissions.has("settings.manage")) redirect("/app/dashboard");
  const [pipeline, roles, clientCount] = await Promise.all([
    ctx.db.pipeline.findFirst({
      where: { isDefault: true },
      include: { stages: { orderBy: { order: "asc" }, include: { _count: { select: { opportunities: { where: { deletedAt: null } } } } } } },
    }),
    ctx.db.role.findMany({ where: { key: { not: "OWNER" } }, select: { id: true, key: true, name: true }, orderBy: { createdAt: "asc" } }),
    ctx.db.client.count(),
  ]);
  const org = await ctx.db.organizationMember.findFirst({ where: { userId: ctx.user.id }, select: { organization: { select: { name: true, segment: true, employeeRange: true, mainGoal: true } } } });
  return (
    <OnboardingWizard
      initialStep={ctx.org.onboardingCompletedAt ? 1 : Math.min(ctx.org.onboardingStep, 7)}
      org={{ name: ctx.org.name, segment: org?.organization.segment ?? "", employeeRange: org?.organization.employeeRange ?? "", mainGoal: org?.organization.mainGoal ?? "" }}
      pipeline={pipeline ? { id: pipeline.id, stages: pipeline.stages.map((s) => ({ id: s.id, name: s.name, probability: s.probability, kind: s.kind, opportunities: s._count.opportunities })) } : null}
      roles={roles}
      clientCount={clientCount}
      userName={ctx.user.name.split(" ")[0] ?? ctx.user.name}
    />
  );
}
