"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { orgSettingsSchema } from "@/lib/org-settings";
import { defineAction } from "@/server/action";
import { audit } from "@/server/audit";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { revokeUserSessions } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { getPlatformSetting } from "@/server/platform";
import { isValidCnpj, isValidCpf } from "@/lib/br-docs";

const strongPassword = z
  .string()
  .min(10, "A senha deve ter ao menos 10 caracteres")
  .max(128)
  .regex(/[a-zA-Z]/, "Inclua letras")
  .regex(/\d/, "Inclua números");

export const updateProfileAction = defineAction(
  { schema: z.object({ name: z.string().trim().min(2, "Informe seu nome").max(120), avatarUrl: z.string().trim().url("URL inválida").max(500).startsWith("https://", "Use uma URL https").nullish().or(z.literal("")) }), mode: "read" },
  async ({ name, avatarUrl }, ctx) => {
    await prisma.user.update({ where: { id: ctx.user.id }, data: { name, avatarUrl: avatarUrl || null } });
    return { ok: true };
  },
);

export const changePasswordAction = defineAction(
  { schema: z.object({ current: z.string().min(1, "Informe a senha atual"), next: strongPassword }), mode: "read" },
  async ({ current, next }, ctx) => {
    if (ctx.support) throw new AppError("FORBIDDEN", "Indisponível em modo suporte.");
    const user = await prisma.user.findUnique({ where: { id: ctx.user.id }, select: { passwordHash: true } });
    if (!(await verifyPassword(current, user?.passwordHash))) throw new AppError("VALIDATION", "Senha atual incorreta.", { current: ["Senha atual incorreta"] });
    await prisma.user.update({ where: { id: ctx.user.id }, data: { passwordHash: await hashPassword(next), passwordChangedAt: new Date() } });
    await revokeUserSessions(ctx.user.id, ctx.sessionId ?? undefined);
    await audit(ctx, "user.password_changed", {});
    return { ok: true };
  },
);

export const revokeSessionAction = defineAction({ schema: z.object({ id: z.string().min(1).optional(), allOthers: z.boolean().optional() }), mode: "read" }, async ({ id, allOthers }, ctx) => {
  if (allOthers) await revokeUserSessions(ctx.user.id, ctx.sessionId ?? undefined);
  else if (id && id !== ctx.sessionId) await prisma.session.deleteMany({ where: { id, userId: ctx.user.id } });
  await audit(ctx, "user.sessions_revoked", { metadata: { allOthers: !!allOthers } });
  return { ok: true };
});

export const updateCompanyAction = defineAction(
  {
    schema: z.object({
      name: z.string().trim().min(2, "Informe o nome").max(120),
      legalName: z.string().trim().max(200).nullish(),
      document: z.string().trim().max(20).nullish(),
      segment: z.string().trim().max(60).nullish(),
      timezone: z.string().trim().min(3).max(60).refine((tz) => { try { new Intl.DateTimeFormat("pt-BR", { timeZone: tz }); return true; } catch { return false; } }, "Fuso horário inválido"),
      currency: z.enum(["BRL", "USD", "EUR"]),
      logoUrl: z.string().trim().url().startsWith("https://", "Use uma URL https").max(500).nullish().or(z.literal("")),
    }),
    permission: "settings.manage",
  },
  async (d, ctx) => {
    const doc = d.document?.replace(/\D/g, "") || null;
    if (doc && !(doc.length === 14 ? isValidCnpj(doc) : doc.length === 11 ? isValidCpf(doc) : false)) throw new AppError("VALIDATION", "CNPJ/CPF inválido.", { document: ["CNPJ/CPF inválido"] });
    await prisma.organization.update({ where: { id: ctx.org.id }, data: { name: d.name, legalName: d.legalName || null, document: doc, segment: d.segment || null, timezone: d.timezone, currency: d.currency, logoUrl: d.logoUrl || null } });
    await audit(ctx, "organization.updated", {});
    return { ok: true };
  },
);

export const updateOrgSettingsAction = defineAction({ schema: orgSettingsSchema.partial(), permission: "settings.manage" }, async (patch, ctx) => {
  const next = orgSettingsSchema.parse({ ...ctx.org.settings, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) });
  await prisma.organization.update({ where: { id: ctx.org.id }, data: { settings: next } });
  await audit(ctx, "organization.settings_updated", { metadata: { keys: Object.keys(patch) } });
  return { ok: true };
});

/** LGPD: solicitação de exclusão da conta da empresa, com período de carência e confirmação pelo nome. */
export const requestOrgDeletionAction = defineAction({ schema: z.object({ confirmName: z.string() }), permission: "organization.delete" }, async ({ confirmName }, ctx) => {
  if (confirmName.trim() !== ctx.org.name) throw new AppError("VALIDATION", "Digite exatamente o nome da empresa para confirmar.", { confirmName: ["Nome não confere"] });
  const grace = await getPlatformSetting("retention.deletionGraceDays");
  const when = new Date(Date.now() + grace * 86_400_000);
  await prisma.organization.update({ where: { id: ctx.org.id }, data: { deletionRequestedAt: new Date(), deletionScheduledFor: when } });
  await audit(ctx, "organization.deletion_requested", { metadata: { scheduledFor: when.toISOString() } });
  return { scheduledFor: when.toISOString() };
});

export const cancelOrgDeletionAction = defineAction({ schema: z.object({}), permission: "organization.delete", mode: "read" }, async (_i, ctx) => {
  await prisma.organization.update({ where: { id: ctx.org.id }, data: { deletionRequestedAt: null, deletionScheduledFor: null } });
  await audit(ctx, "organization.deletion_canceled", {});
  return { ok: true };
});
