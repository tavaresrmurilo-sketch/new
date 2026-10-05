"use server";

import { z } from "zod";
import { appUrl } from "@/lib/env";
import { defineAction } from "@/server/action";
import { audit } from "@/server/audit";
import { assertFeature } from "@/server/billing/feature-gate";
import { assertOwned } from "@/server/db/ownership";
import { AppError } from "@/server/errors";
import { hashToken, randomToken } from "@/server/security/crypto";

/** Gera um link de acesso ao Portal do Cliente. O token é exibido uma única vez; apenas o hash é salvo. */
export const createPortalAccessAction = defineAction(
  { schema: z.object({ clientId: z.string().min(1), label: z.string().trim().min(2).max(120), days: z.coerce.number().int().min(1).max(365).default(90) }), permission: "clients.write" },
  async ({ clientId, label, days }, ctx) => {
    assertFeature(ctx, "client_portal");
    await assertOwned(ctx, "client", clientId);
    const token = randomToken(24);
    const access = await ctx.db.portalAccess.create({
      data: { organizationId: ctx.org.id, clientId, label, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + days * 86_400_000), createdById: ctx.user.id },
    });
    await audit(ctx, "portal.access_created", { entityType: "client", entityId: clientId, metadata: { accessId: access.id, label, days } });
    return { id: access.id, url: `${appUrl()}/portal/${token}` };
  },
);

export const revokePortalAccessAction = defineAction({ schema: z.object({ id: z.string().min(1) }), permission: "clients.write" }, async ({ id }, ctx) => {
  const access = await ctx.db.portalAccess.findUnique({ where: { id } });
  if (!access) throw new AppError("NOT_FOUND", "Acesso não encontrado.");
  await ctx.db.portalAccess.update({ where: { id }, data: { revokedAt: new Date() } });
  await audit(ctx, "portal.access_revoked", { entityType: "client", entityId: access.clientId, metadata: { accessId: id } });
  return { id };
});

export const listPortalAccessAction = defineAction({ schema: z.object({ clientId: z.string().min(1) }), permission: "clients.read", mode: "read" }, async ({ clientId }, ctx) =>
  ctx.db.portalAccess.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    select: { id: true, label: true, expiresAt: true, revokedAt: true, lastAccessAt: true, accessCount: true, createdAt: true },
  }),
);
