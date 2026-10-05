import "server-only";
import { prisma } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { audit } from "@/server/audit";
import type { Ctx } from "@/server/auth/context";
import { revokeUserSessions } from "@/server/auth/session";
import { assertLimit } from "@/server/billing/feature-gate";
import { AppError, notFound } from "@/server/errors";
import { hashToken, randomToken } from "@/server/security/crypto";
import { emailProvider, emailTemplates } from "@/services/email";

export interface InviteResult {
  email: string;
  status: "invited" | "already_member" | "error";
  /** link exibido apenas a quem convidou quando o envio de e-mail não está configurado */
  link?: string;
  emailed?: boolean;
  error?: string;
}

/** Convida pessoas (respeita o limite de usuários do plano). O token só existe no link enviado; guardamos o hash. */
export async function inviteMembers(ctx: Ctx, emails: string[], roleId: string): Promise<InviteResult[]> {
  const role = await ctx.db.role.findUnique({ where: { id: roleId } });
  if (!role) throw notFound("Papel");
  if (role.key === "OWNER" && ctx.member?.roleKey !== "OWNER") throw new AppError("FORBIDDEN", "Somente o proprietário pode convidar outro proprietário.");
  const unique = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const pending = await ctx.db.invitation.count({ where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } });
  await assertLimit(ctx, "users", unique.length + pending);
  const provider = emailProvider();
  const results: InviteResult[] = [];
  for (const email of unique) {
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      const member = await ctx.db.organizationMember.findFirst({ where: { userId: existing.id, status: "ACTIVE" } });
      if (member) {
        results.push({ email, status: "already_member" });
        continue;
      }
    }
    await ctx.db.invitation.updateMany({ where: { email, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
    const token = randomToken(32);
    await ctx.db.invitation.create({
      data: { organizationId: ctx.org.id, email, roleId, tokenHash: hashToken(token), invitedById: ctx.user.id, expiresAt: new Date(Date.now() + 7 * 86_400_000) },
    });
    const link = `${appUrl()}/invite?token=${encodeURIComponent(token)}`;
    const sent = await provider.send({ to: email, ...emailTemplates.invitation(ctx.org.name, ctx.user.name, link) });
    results.push({ email, status: "invited", emailed: sent.delivered, link: sent.delivered ? undefined : link });
  }
  await audit(ctx, "member.invited", { metadata: { emails: unique, role: role.key } });
  return results;
}

export async function revokeInvitation(ctx: Ctx, id: string) {
  const inv = await ctx.db.invitation.findUnique({ where: { id } });
  if (!inv) throw notFound("Convite");
  await ctx.db.invitation.update({ where: { id }, data: { revokedAt: new Date() } });
  await audit(ctx, "member.invite_revoked", { entityType: "invitation", entityId: id, metadata: { email: inv.email } });
  return { id };
}

export async function updateMember(ctx: Ctx, memberId: string, input: { roleId?: string; title?: string | null; department?: string | null; weeklyCapacityHours?: number; status?: "ACTIVE" | "DISABLED" }) {
  const member = await ctx.db.organizationMember.findUnique({ where: { id: memberId }, include: { role: true, user: { select: { id: true, email: true } } } });
  if (!member) throw notFound("Membro");
  const changingAccess = input.roleId !== undefined || input.status !== undefined;
  if (changingAccess && !ctx.permissions.has("users.manage")) throw new AppError("FORBIDDEN", "Você não pode alterar acessos.");
  if (input.roleId && input.roleId !== member.roleId) {
    if (!ctx.permissions.has("roles.manage") && !ctx.permissions.has("users.manage")) throw new AppError("FORBIDDEN", "Você não pode alterar papéis.");
    const role = await ctx.db.role.findUnique({ where: { id: input.roleId } });
    if (!role) throw notFound("Papel");
    if ((role.key === "OWNER" || member.role.key === "OWNER") && ctx.member?.roleKey !== "OWNER") throw new AppError("FORBIDDEN", "Somente o proprietário altera o papel de proprietário.");
  }
  const leavingOwner = member.role.key === "OWNER" && ((input.roleId && input.roleId !== member.roleId) || input.status === "DISABLED");
  if (leavingOwner) {
    const owners = await ctx.db.organizationMember.count({ where: { status: "ACTIVE", role: { key: "OWNER" } } });
    if (owners <= 1) throw new AppError("VALIDATION", "O workspace precisa de ao menos um proprietário ativo.");
  }
  if (member.userId === ctx.user.id && input.status === "DISABLED") throw new AppError("VALIDATION", "Você não pode desativar o próprio acesso.");
  if (input.status === "ACTIVE" && member.status !== "ACTIVE") await assertLimit(ctx, "users", 1);
  await ctx.db.organizationMember.update({ where: { id: memberId }, data: input });
  if (input.status === "DISABLED") {
    await prisma.session.deleteMany({ where: { userId: member.userId, organizationId: ctx.org.id } });
  }
  if (changingAccess) {
    await audit(ctx, "member.access_changed", {
      entityType: "member",
      entityId: memberId,
      metadata: { user: member.user.email, roleFrom: member.roleId, roleTo: input.roleId ?? member.roleId, status: input.status ?? member.status },
    });
  }
  return { id: memberId };
}

/** Atualiza a matriz de permissões de um papel (o papel Proprietário é imutável). */
export async function setRolePermissions(ctx: Ctx, roleId: string, keys: string[]) {
  const role = await ctx.db.role.findUnique({ where: { id: roleId }, include: { permissions: { include: { permission: true } } } });
  if (!role) throw notFound("Papel");
  if (role.key === "OWNER") throw new AppError("VALIDATION", "As permissões do Proprietário não podem ser alteradas.");
  const perms = await prisma.permission.findMany({ where: { key: { in: keys } } });
  const before = role.permissions.map((p) => p.permission.key).sort();
  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId } }),
    prisma.rolePermission.createMany({ data: perms.map((p) => ({ roleId, permissionId: p.id })) }),
  ]);
  await audit(ctx, "role.permissions_changed", { entityType: "role", entityId: roleId, metadata: { role: role.key, before, after: perms.map((p) => p.key).sort() } });
  return { id: roleId };
}

export async function createCustomRole(ctx: Ctx, name: string, baseRoleId?: string | null) {
  const key = `CUSTOM_${name.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").slice(0, 30)}`;
  const base = baseRoleId ? await ctx.db.role.findUnique({ where: { id: baseRoleId }, include: { permissions: true } }) : null;
  const role = await prisma.role.create({
    data: {
      organizationId: ctx.org.id,
      key,
      name,
      description: base ? `Baseado em ${base.name}` : null,
      permissions: base ? { create: base.permissions.map((p) => ({ permissionId: p.permissionId })) } : undefined,
    },
  });
  await audit(ctx, "role.created", { entityType: "role", entityId: role.id, metadata: { name } });
  return { id: role.id };
}

export async function deleteCustomRole(ctx: Ctx, roleId: string) {
  const role = await ctx.db.role.findUnique({ where: { id: roleId }, include: { _count: { select: { members: true } } } });
  if (!role) throw notFound("Papel");
  if (role.isSystem) throw new AppError("VALIDATION", "Papéis de sistema não podem ser removidos.");
  if (role._count.members > 0) throw new AppError("VALIDATION", "Mova os membros deste papel antes de removê-lo.");
  await prisma.role.delete({ where: { id: roleId } });
  await audit(ctx, "role.deleted", { entityType: "role", entityId: roleId, metadata: { name: role.name } });
  return { id: roleId };
}

export { revokeUserSessions };
