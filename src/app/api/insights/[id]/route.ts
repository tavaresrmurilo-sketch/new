import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiRoute, requireApi } from "@/server/auth/guard";
import { NotFoundError } from "@/server/errors";

const schema = z.object({ status: z.enum(["NEW", "READ", "DISMISSED"]) });

export const PATCH = apiRoute<{ id: string }>(async (req, { id }) => {
  const ctx = await requireApi("insights:view");
  const { status } = schema.parse(await req.json());
  const r = await prisma.insight.updateMany({ where: { id, tenantId: ctx.tenantId }, data: { status } });
  if (!r.count) throw new NotFoundError();
  return NextResponse.json({ ok: true });
});
