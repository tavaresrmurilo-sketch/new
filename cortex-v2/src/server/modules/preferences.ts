import "server-only";
import type { Ctx } from "@/server/auth/context";

export async function savedViewsFor(ctx: Ctx, entity: string) {
  const views = await ctx.db.savedView.findMany({
    where: { entity, OR: [{ userId: ctx.user.id }, { isShared: true }] },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, filters: true, isShared: true, userId: true },
  });
  return views.map((v) => ({ id: v.id, name: v.name, query: new URLSearchParams(v.filters as Record<string, string>).toString(), shared: v.isShared, mine: v.userId === ctx.user.id }));
}

export async function isFavorite(ctx: Ctx, entityType: string, entityId: string) {
  return (await ctx.db.favorite.count({ where: { userId: ctx.user.id, entityType, entityId } })) > 0;
}
