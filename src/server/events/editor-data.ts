import "server-only";
import { prisma } from "@/server/db";
import { boostsUsedThisMonth, getPlan } from "@/server/billing/plans";
import { activeCategories } from "@/server/events/organizer-queries";
import { listVenues } from "@/server/organizations/venues";
import type { OrgContext } from "@/server/organizations/current";
import { getSetting } from "@/server/settings";

/** Dados comuns às páginas do editor (novo e edição). */
export async function editorContext(ctx: OrgContext) {
  const [categories, venues, mode, requireVerified, plan, boostsUsed, org] = await Promise.all([
    activeCategories(),
    listVenues(ctx.org.id),
    getSetting("moderation.mode"),
    getSetting("publishing.requireVerifiedEmail"),
    getPlan(ctx.org.plan),
    boostsUsedThisMonth(ctx.org.id),
    prisma.organization.findUniqueOrThrow({ where: { id: ctx.org.id }, select: { trustedPublisher: true } }),
  ]);
  return {
    categories,
    venues: venues.map(({ eventsCount: _count, ...v }) => v),
    needsReview: mode === "all" || (mode === "new_orgs" && !org.trustedPublisher),
    emailBlocked: requireVerified && !ctx.user.emailVerified,
    quota: { limit: plan.boostsPerMonth, used: boostsUsed },
    org: { name: ctx.org.name, slug: ctx.org.slug, verified: ctx.org.verified, logoUrl: ctx.org.logoUrl },
  };
}
