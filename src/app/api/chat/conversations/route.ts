import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiRoute, requireApi } from "@/server/auth/guard";

export const GET = apiRoute(async () => {
  const ctx = await requireApi("chat:use");
  const conversations = await prisma.conversation.findMany({
    where: { tenantId: ctx.tenantId, userId: ctx.userId },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: { id: true, title: true, updatedAt: true },
  });
  return NextResponse.json({ conversations });
});
