"use server";

import { z } from "zod";
import { defineAction } from "@/server/action";

export const listNotificationsAction = defineAction(
  { schema: z.object({ limit: z.number().int().min(1).max(50).default(20) }), mode: "read" },
  async ({ limit }, ctx) => {
    const items = await ctx.db.notification.findMany({
      where: { userId: ctx.user.id, archivedAt: null },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, type: true, title: true, body: true, link: true, readAt: true, createdAt: true },
    });
    const unread = await ctx.db.notification.count({ where: { userId: ctx.user.id, readAt: null, archivedAt: null } });
    return { items, unread };
  },
);

export const markNotificationAction = defineAction(
  { schema: z.object({ id: z.string().min(1), read: z.boolean() }), mode: "read" },
  async ({ id, read }, ctx) => {
    await ctx.db.notification.updateMany({ where: { id, userId: ctx.user.id }, data: { readAt: read ? new Date() : null } });
    return null;
  },
);

export const markAllNotificationsReadAction = defineAction({ schema: z.object({}), mode: "read" }, async (_input, ctx) => {
  await ctx.db.notification.updateMany({ where: { userId: ctx.user.id, readAt: null }, data: { readAt: new Date() } });
  return null;
});

export const archiveNotificationsAction = defineAction(
  { schema: z.object({ ids: z.array(z.string()).max(500).optional(), all: z.boolean().optional() }), mode: "read" },
  async ({ ids, all }, ctx) => {
    const now = new Date();
    await ctx.db.notification.updateMany({
      where: { userId: ctx.user.id, archivedAt: null, ...(all ? {} : { id: { in: ids ?? [] } }) },
      data: { archivedAt: now, readAt: now },
    });
    return null;
  },
);
