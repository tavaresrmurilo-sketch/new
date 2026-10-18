import "server-only";
import type { OrgInvite, OrgRole } from "@prisma/client";
import { audit } from "@/server/audit";
import { AuthError, assertOrgRole } from "@/server/auth/guards";
import { prisma } from "@/server/db";
import { genericMessage } from "@/server/email/templates";
import { sendEmail } from "@/server/email";
import { assertCanAddMember, getPlan, PlanLimitError } from "@/server/billing/plans";
import { notify } from "@/server/notifications";
import { hashToken, randomToken } from "@/server/security/crypto";

export const INVITE_TTL_DAYS = 7;
export const ROLE_LABEL: Record<OrgRole, string> = { OWNER: "Proprietário(a)", ADMIN: "Administrador(a)", EDITOR: "Editor(a)" };

export class TeamError extends Error {
  constructor(
    message: string,
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}

interface Ctx {
  ip?: string | null;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type InviteState = "valid" | "expired" | "revoked" | "accepted";

export function inviteState(inv: Pick<OrgInvite, "acceptedAt" | "revokedAt" | "expiresAt">, now = new Date()): InviteState {
  if (inv.acceptedAt) return "accepted";
  if (inv.revokedAt) return "revoked";
  if (inv.expiresAt.getTime() <= now.getTime()) return "expired";
  return "valid";
}

// ─────────────────────────────────────────────────────────────
// Consulta
// ─────────────────────────────────────────────────────────────

export async function listTeam(organizationId: string) {
  const [members, invites] = await Promise.all([
    prisma.membership.findMany({
      where: { organizationId },
      select: { id: true, role: true, createdAt: true, user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      orderBy: [{ createdAt: "asc" }],
    }),
    prisma.orgInvite.findMany({
      where: { organizationId, acceptedAt: null, revokedAt: null },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true, invitedBy: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  const rank: Record<OrgRole, number> = { OWNER: 0, ADMIN: 1, EDITOR: 2 };
  members.sort((a, b) => rank[a.role] - rank[b.role] || a.createdAt.getTime() - b.createdAt.getTime());
  return { members, invites };
}

// ─────────────────────────────────────────────────────────────
// Convites
// ─────────────────────────────────────────────────────────────

function newInviteToken() {
  const token = randomToken(32);
  return { token, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000) };
}

async function deliverInvite(invite: { email: string; role: OrgRole }, token: string, org: { name: string }, inviterName: string) {
  const path = `/convite/${encodeURIComponent(token)}`;
  await sendEmail(
    invite.email,
    genericMessage({
      template: "org-invite",
      subject: `${inviterName} convidou você para a equipe de ${org.name} no Mixtour`,
      heading: `Junte-se a ${org.name}`,
      paragraphs: [
        `${inviterName} convidou você para participar da equipe de ${org.name} no Mixtour como ${ROLE_LABEL[invite.role].toLowerCase()}.`,
        invite.role === "ADMIN"
          ? "Como administrador(a), você poderá publicar e editar eventos, gerenciar locais, a equipe e o plano da organização."
          : "Como editor(a), você poderá criar, publicar e editar os eventos da organização.",
      ],
      cta: { label: "Aceitar convite", path },
      footnote: `O convite vale por ${INVITE_TTL_DAYS} dias e só funciona com uma conta neste e-mail (${invite.email}). Se não esperava este convite, ignore a mensagem.`,
    }),
  );
  // Quem já tem conta também recebe o aviso no app.
  const existing = await prisma.user.findFirst({ where: { email: { equals: invite.email, mode: "insensitive" } }, select: { id: true, status: true } });
  if (existing?.status === "ACTIVE") {
    await notify(existing.id, { type: "ORG_INVITE", title: `Convite para a equipe de ${org.name}`, body: `${inviterName} convidou você para a equipe.`, url: path }, { push: true }).catch(
      () => null,
    );
  }
}

export async function inviteMember(actorId: string, organizationId: string, input: { email: string; role: "ADMIN" | "EDITOR" }, ctx: Ctx = {}) {
  const actor = await assertOrgRole(actorId, organizationId, "ADMIN");
  if (input.role === "ADMIN" && actor.role !== "OWNER") {
    throw new TeamError("Só quem é proprietário(a) da organização pode convidar administradores.", { role: "Escolha o papel Editor(a)." });
  }
  const email = normalizeEmail(input.email);

  const alreadyMember = await prisma.membership.findFirst({ where: { organizationId, user: { email: { equals: email, mode: "insensitive" } } }, select: { id: true } });
  if (alreadyMember) throw new TeamError("Esta pessoa já faz parte da equipe.", { email: "Já faz parte da equipe." });

  const now = new Date();
  const pending = await prisma.orgInvite.findMany({ where: { organizationId, email, acceptedAt: null, revokedAt: null }, select: { id: true, expiresAt: true } });
  if (pending.some((p) => p.expiresAt > now)) {
    throw new TeamError("Já existe um convite pendente para este e-mail. Use “Reenviar” na lista de convites.", { email: "Convite pendente para este e-mail." });
  }
  // Convites vencidos para o mesmo e-mail saem da lista.
  if (pending.length) await prisma.orgInvite.updateMany({ where: { id: { in: pending.map((p) => p.id) } }, data: { revokedAt: now } });

  await assertCanAddMember(organizationId);

  const { token, tokenHash, expiresAt } = newInviteToken();
  const invite = await prisma.orgInvite.create({ data: { organizationId, email, role: input.role, tokenHash, expiresAt, invitedById: actorId } });
  const inviter = await prisma.user.findUniqueOrThrow({ where: { id: actorId }, select: { name: true } });
  await deliverInvite(invite, token, actor.organization, inviter.name);
  await audit({ actorId, action: "team.invite", targetType: "Organization", targetId: organizationId, metadata: { inviteId: invite.id, role: input.role }, ip: ctx.ip });
  return { invite, token };
}

async function loadPendingInvite(inviteId: string) {
  const invite = await prisma.orgInvite.findUnique({ where: { id: inviteId } });
  if (!invite) throw new TeamError("Convite não encontrado.");
  if (invite.acceptedAt) throw new TeamError("Este convite já foi aceito.");
  if (invite.revokedAt) throw new TeamError("Este convite foi cancelado.");
  return invite;
}

/** Gera um novo link (o anterior deixa de valer) e renova o prazo. */
export async function resendInvite(actorId: string, inviteId: string, ctx: Ctx = {}) {
  const invite = await loadPendingInvite(inviteId);
  const actor = await assertOrgRole(actorId, invite.organizationId, "ADMIN");
  if (invite.role === "ADMIN" && actor.role !== "OWNER") throw new TeamError("Só quem é proprietário(a) pode reenviar convites de administrador.");
  if (invite.expiresAt <= new Date()) {
    // Convite vencido deixou de contar no limite: confere de novo antes de reativar.
    await assertCanAddMember(invite.organizationId);
  }
  const { token, tokenHash, expiresAt } = newInviteToken();
  const updated = await prisma.orgInvite.update({ where: { id: invite.id }, data: { tokenHash, expiresAt } });
  const inviter = await prisma.user.findUniqueOrThrow({ where: { id: actorId }, select: { name: true } });
  await deliverInvite(updated, token, actor.organization, inviter.name);
  await audit({ actorId, action: "team.invite_resend", targetType: "Organization", targetId: invite.organizationId, metadata: { inviteId }, ip: ctx.ip });
  return { invite: updated, token };
}

export async function revokeInvite(actorId: string, inviteId: string, ctx: Ctx = {}) {
  const invite = await loadPendingInvite(inviteId);
  await assertOrgRole(actorId, invite.organizationId, "ADMIN");
  await prisma.orgInvite.update({ where: { id: invite.id }, data: { revokedAt: new Date() } });
  await audit({ actorId, action: "team.invite_revoke", targetType: "Organization", targetId: invite.organizationId, metadata: { inviteId }, ip: ctx.ip });
}

/** Página pública do convite: estado + dados mínimos da organização (nunca o e-mail completo de outra pessoa). */
export async function findInviteByToken(token: string) {
  if (!token || token.length > 200) return null;
  const invite = await prisma.orgInvite.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      organization: { select: { id: true, name: true, slug: true, logoUrl: true, verified: true, status: true } },
      invitedBy: { select: { name: true } },
    },
  });
  if (!invite) return null;
  return { invite, state: inviteState(invite) };
}

export type FoundInvite = NonNullable<Awaited<ReturnType<typeof findInviteByToken>>>;

/** "ana.souza@gmail.com" → "an•••••@gmail.com" (para quem está logado com outro e-mail). */
export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return "•••";
  const visible = user.slice(0, Math.min(2, Math.max(1, user.length - 1)));
  return `${visible}${"•".repeat(Math.max(3, Math.min(6, user.length - visible.length)))}@${domain}`;
}

/**
 * Aceita o convite. Idempotente: aceitar de novo (ou já sendo membro) não duplica nada
 * nem rebaixa o papel atual.
 */
export async function acceptInvite(userId: string, token: string, ctx: Ctx = {}) {
  const found = await findInviteByToken(token);
  if (!found) throw new TeamError("Convite inválido. Peça um novo link a quem convidou você.");
  const { invite, state } = found;

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, name: true, email: true, status: true } });
  if (user.status !== "ACTIVE") throw new AuthError("Sua conta não pode entrar em equipes no momento.");
  if (normalizeEmail(user.email) !== normalizeEmail(invite.email)) {
    throw new TeamError("Este convite foi enviado para outro e-mail. Entre com a conta do e-mail convidado.");
  }

  const existing = await prisma.membership.findUnique({ where: { organizationId_userId: { organizationId: invite.organizationId, userId } } });
  if (state === "accepted") {
    if (existing) return { organizationId: invite.organizationId, alreadyMember: true };
    throw new TeamError("Este convite já foi usado.");
  }
  if (state === "revoked") throw new TeamError("Este convite foi cancelado pela organização.");
  if (state === "expired") throw new TeamError("Este convite expirou. Peça um novo a quem convidou você.");
  if (invite.organization.status === "SUSPENDED") throw new TeamError("Esta organização está suspensa no momento.");

  if (!existing) {
    // O convite pendente já ocupava a vaga; só bloqueia se o plano tiver diminuído desde então.
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: invite.organizationId }, select: { plan: true } });
    const [plan, members] = await Promise.all([getPlan(org.plan), prisma.membership.count({ where: { organizationId: invite.organizationId } })]);
    if (members >= plan.maxMembers) {
      throw new PlanLimitError(`A equipe de ${invite.organization.name} atingiu o limite do plano ${plan.name}. Peça para quem administra a organização fazer upgrade.`);
    }
  }

  const accepted = await prisma.$transaction(async (tx) => {
    const marked = await tx.orgInvite.updateMany({ where: { id: invite.id, acceptedAt: null, revokedAt: null }, data: { acceptedAt: new Date() } });
    if (!existing) {
      await tx.membership.upsert({
        where: { organizationId_userId: { organizationId: invite.organizationId, userId } },
        create: { organizationId: invite.organizationId, userId, role: invite.role },
        update: {},
      });
    }
    return marked.count > 0;
  });

  if (accepted) {
    await audit({ actorId: userId, action: "team.invite_accept", targetType: "Organization", targetId: invite.organizationId, metadata: { inviteId: invite.id, role: invite.role }, ip: ctx.ip });
    if (invite.invitedById && invite.invitedById !== userId) {
      await notify(
        invite.invitedById,
        { type: "ORG_INVITE", title: `${user.name} entrou na equipe`, body: `${user.name} aceitou o convite para ${invite.organization.name}.`, url: "/painel/equipe" },
        { push: true },
      ).catch(() => null);
    }
  }
  return { organizationId: invite.organizationId, alreadyMember: Boolean(existing) };
}

// ─────────────────────────────────────────────────────────────
// Papéis e saída
// ─────────────────────────────────────────────────────────────

async function targetMembership(organizationId: string, userId: string) {
  const m = await prisma.membership.findUnique({ where: { organizationId_userId: { organizationId, userId } }, include: { user: { select: { name: true } } } });
  if (!m) throw new TeamError("Esta pessoa não faz parte da equipe.");
  return m;
}

/** Só OWNER altera papéis (promove a ADMIN ou rebaixa para EDITOR). Propriedade muda só por transferência. */
export async function changeMemberRole(actorId: string, organizationId: string, memberUserId: string, role: "ADMIN" | "EDITOR", ctx: Ctx = {}) {
  const actor = await assertOrgRole(actorId, organizationId, "ADMIN");
  if (actor.role !== "OWNER") throw new AuthError("Só quem é proprietário(a) da organização pode alterar papéis.");
  if (memberUserId === actorId) throw new TeamError("Para deixar de ser proprietário(a), transfira a propriedade para outra pessoa.");
  const target = await targetMembership(organizationId, memberUserId);
  if (target.role === "OWNER") throw new TeamError("Esta pessoa também é proprietária. Ela precisa transferir ou sair por conta própria.");
  if (target.role === role) return target;
  const updated = await prisma.membership.update({ where: { id: target.id }, data: { role } });
  await audit({ actorId, action: "team.role_change", targetType: "Organization", targetId: organizationId, metadata: { userId: memberUserId, from: target.role, to: role }, ip: ctx.ip });
  await notify(
    memberUserId,
    { type: "SYSTEM", title: `Seu papel em ${actor.organization.name} mudou`, body: `Agora você é ${ROLE_LABEL[role].toLowerCase()} da equipe.`, url: "/painel" },
    { push: false },
  ).catch(() => null);
  return updated;
}

/** OWNER passa a propriedade para outro membro e vira ADMIN. */
export async function transferOwnership(actorId: string, organizationId: string, newOwnerUserId: string, ctx: Ctx = {}) {
  const actor = await assertOrgRole(actorId, organizationId, "OWNER");
  if (newOwnerUserId === actorId) throw new TeamError("Você já é proprietário(a) desta organização.");
  const target = await targetMembership(organizationId, newOwnerUserId);
  await prisma.$transaction([
    prisma.membership.update({ where: { id: target.id }, data: { role: "OWNER" } }),
    prisma.membership.update({ where: { id: actor.id }, data: { role: "ADMIN" } }),
  ]);
  await audit({ actorId, action: "team.ownership_transfer", targetType: "Organization", targetId: organizationId, metadata: { from: actorId, to: newOwnerUserId }, ip: ctx.ip });
  await notify(
    newOwnerUserId,
    { type: "SYSTEM", title: `Você agora é proprietário(a) de ${actor.organization.name}`, body: "A propriedade da organização foi transferida para você.", url: "/painel/equipe" },
    { push: true },
  ).catch(() => null);
}

/** ADMIN+ remove membros; ADMIN não remove OWNER; ninguém remove o último OWNER. */
export async function removeMember(actorId: string, organizationId: string, memberUserId: string, ctx: Ctx = {}) {
  const actor = await assertOrgRole(actorId, organizationId, "ADMIN");
  if (memberUserId === actorId) throw new TeamError("Para sair da organização, use “Sair da organização”.");
  const target = await targetMembership(organizationId, memberUserId);
  if (target.role === "OWNER") {
    if (actor.role !== "OWNER") throw new AuthError("Administradores não podem remover quem é proprietário(a).");
    const owners = await prisma.membership.count({ where: { organizationId, role: "OWNER" } });
    if (owners <= 1) throw new TeamError("A organização precisa de pelo menos um(a) proprietário(a).");
  }
  await prisma.membership.delete({ where: { id: target.id } });
  await audit({ actorId, action: "team.member_remove", targetType: "Organization", targetId: organizationId, metadata: { userId: memberUserId, role: target.role }, ip: ctx.ip });
  await notify(memberUserId, { type: "SYSTEM", title: `Você saiu da equipe de ${actor.organization.name}`, body: "Seu acesso ao painel desta organização foi removido." }, { push: false }).catch(
    () => null,
  );
}

/** Sair da organização (o último OWNER precisa transferir antes). */
export async function leaveOrganization(userId: string, organizationId: string, ctx: Ctx = {}) {
  const m = await prisma.membership.findUnique({ where: { organizationId_userId: { organizationId, userId } } });
  if (!m) throw new TeamError("Você não faz parte desta organização.");
  if (m.role === "OWNER") {
    const owners = await prisma.membership.count({ where: { organizationId, role: "OWNER" } });
    if (owners <= 1) throw new TeamError("Você é a única pessoa proprietária. Transfira a propriedade antes de sair.");
  }
  await prisma.membership.delete({ where: { id: m.id } });
  await audit({ actorId: userId, action: "team.leave", targetType: "Organization", targetId: organizationId, metadata: { role: m.role }, ip: ctx.ip });
}
