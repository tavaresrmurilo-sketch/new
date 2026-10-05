import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { AppBanners } from "@/components/shell/banners";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { isDemoModeEnabled } from "@/lib/env";
import { requireCtx } from "@/server/auth/context";
import { logoutAction } from "@/features/auth/actions";

export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCtx();
  if (!ctx.org.onboardingCompletedAt && !ctx.support && ctx.member?.roleKey === "OWNER") redirect("/app/onboarding");

  if (ctx.access.level === "BLOCKED") {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <div className="max-w-md text-center">
          <Lock className="mx-auto size-8 text-muted-foreground" />
          <h1 className="mt-4 text-lg font-semibold">Workspace indisponível</h1>
          <p className="mt-2 text-sm text-muted-foreground">{ctx.access.message} Seus dados continuam preservados.</p>
          <form action={logoutAction} className="mt-6">
            <Button variant="outline">Sair</Button>
          </form>
        </div>
      </div>
    );
  }

  const [workspaces, unread, inboxDecisions, orgDecisions] = await Promise.all([
    ctx.support
      ? Promise.resolve([])
      : prisma.organizationMember.findMany({
          where: { userId: ctx.user.id, status: "ACTIVE" },
          select: { organization: { select: { id: true, name: true, isDemo: true } } },
          orderBy: { joinedAt: "asc" },
        }),
    ctx.db.notification.count({ where: { userId: ctx.user.id, readAt: null, archivedAt: null } }),
    ctx.db.decision.count({ where: { status: "PENDING", OR: [{ assigneeId: ctx.user.id }, { assigneeId: null }] } }),
    ctx.db.decision.count({ where: { status: "PENDING" } }),
  ]);
  const unarchived = await ctx.db.notification.count({ where: { userId: ctx.user.id, archivedAt: null } });
  const sub = ctx.subscription;
  const trialDaysLeft = sub?.status === "TRIALING" && sub.trialEndsAt ? Math.max(0, Math.ceil((sub.trialEndsAt.getTime() - Date.now()) / 86_400_000)) : null;

  return (
    <AppShell
      banners={<AppBanners ctx={ctx} />}
      data={{
        user: ctx.user,
        org: { id: ctx.org.id, name: ctx.org.name, isDemo: ctx.org.isDemo, logoUrl: ctx.org.logoUrl, timezone: ctx.org.timezone, currency: ctx.org.currency },
        workspaces: ctx.support ? [{ id: ctx.org.id, name: ctx.org.name, isDemo: ctx.org.isDemo }] : workspaces.map((w) => w.organization),
        permissions: [...ctx.permissions],
        counts: { inbox: unarchived + inboxDecisions, decisions: orgDecisions, unread },
        plan: sub ? { name: sub.plan.name, status: sub.status, trialDaysLeft } : null,
        readOnly: ctx.access.level !== "FULL",
        supportMode: Boolean(ctx.support),
        demoModeAvailable: isDemoModeEnabled(),
      }}
    >
      {children}
    </AppShell>
  );
}
