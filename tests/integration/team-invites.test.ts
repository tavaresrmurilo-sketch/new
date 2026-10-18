import { beforeEach, describe, expect, it } from "vitest";
import { AuthError } from "@/server/auth/guards";
import { PlanLimitError } from "@/server/billing/plans";
import { hashToken } from "@/server/security/crypto";
import { acceptInvite, findInviteByToken, INVITE_TTL_DAYS, inviteMember, inviteState, maskEmail, resendInvite, revokeInvite, TeamError } from "@/server/team/service";
import { createOrg, createUser, prisma, resetDb, setPlan } from "../helpers";

beforeEach(async () => {
  await resetDb();
});

async function proOrg() {
  const owner = await createUser({ name: "Rita Dona" });
  const org = await createOrg(owner.id, { name: "Casa Aberta" });
  await setPlan(org.id, "PRO");
  return { owner, org };
}

describe("convites — criação e limites do plano", () => {
  it("no plano Gratuito (individual) não é possível convidar", async () => {
    const owner = await createUser();
    const org = await createOrg(owner.id);
    await expect(inviteMember(owner.id, org.id, { email: "nova@teste.dev", role: "EDITOR" })).rejects.toBeInstanceOf(PlanLimitError);
    expect(await prisma.orgInvite.count()).toBe(0);
  });

  it("convites pendentes ocupam vaga: no Pro (3 pessoas) o terceiro convite é bloqueado", async () => {
    const { owner, org } = await proOrg();
    await inviteMember(owner.id, org.id, { email: "a@teste.dev", role: "EDITOR" });
    await inviteMember(owner.id, org.id, { email: "b@teste.dev", role: "ADMIN" });
    const err = await inviteMember(owner.id, org.id, { email: "c@teste.dev", role: "EDITOR" }).catch((e) => e);
    expect(err).toBeInstanceOf(PlanLimitError);
    expect((err as PlanLimitError).upgradeTo).toBe("BUSINESS");
  });

  it("grava só o hash do token, expira em 7 dias e envia e-mail com o link", async () => {
    const { owner, org } = await proOrg();
    const before = Date.now();
    const { invite, token } = await inviteMember(owner.id, org.id, { email: "  Pessoa@Teste.dev ", role: "EDITOR" });
    expect(invite.email).toBe("pessoa@teste.dev");
    expect(invite.tokenHash).not.toBe(token);
    expect(invite.tokenHash).toBe(hashToken(token));
    const ttl = invite.expiresAt.getTime() - before;
    expect(ttl).toBeGreaterThanOrEqual(INVITE_TTL_DAYS * 86_400_000 - 5_000);
    expect(ttl).toBeLessThanOrEqual(INVITE_TTL_DAYS * 86_400_000 + 5_000);

    const mail = await prisma.emailOutbox.findFirstOrThrow({ where: { to: "pessoa@teste.dev" } });
    expect(mail.template).toBe("org-invite");
    expect(mail.text).toContain(`/convite/${token}`);
    expect(await prisma.auditLog.count({ where: { action: "team.invite", targetId: org.id } })).toBe(1);
  });

  it("editor não convida; administrador não convida administradores", async () => {
    const { owner, org } = await proOrg();
    const editor = await createUser();
    const admin = await createUser();
    await prisma.membership.createMany({
      data: [
        { organizationId: org.id, userId: editor.id, role: "EDITOR" },
        { organizationId: org.id, userId: admin.id, role: "ADMIN" },
      ],
    });
    await setPlan(org.id, "BUSINESS");
    await expect(inviteMember(editor.id, org.id, { email: "x@teste.dev", role: "EDITOR" })).rejects.toBeInstanceOf(AuthError);
    await expect(inviteMember(admin.id, org.id, { email: "x@teste.dev", role: "ADMIN" })).rejects.toBeInstanceOf(TeamError);
    await expect(inviteMember(admin.id, org.id, { email: "x@teste.dev", role: "EDITOR" })).resolves.toBeTruthy();
    expect(owner).toBeTruthy();
  });

  it("recusa convite duplicado pendente e e-mail de quem já é membro", async () => {
    const { owner, org } = await proOrg();
    await inviteMember(owner.id, org.id, { email: "dup@teste.dev", role: "EDITOR" });
    await expect(inviteMember(owner.id, org.id, { email: "DUP@teste.dev", role: "EDITOR" })).rejects.toThrow(/pendente/);
    await expect(inviteMember(owner.id, org.id, { email: owner.email.toUpperCase(), role: "EDITOR" })).rejects.toThrow(/já faz parte/);
  });

  it("convite vencido para o mesmo e-mail é substituído por um novo", async () => {
    const { owner, org } = await proOrg();
    const first = await inviteMember(owner.id, org.id, { email: "volta@teste.dev", role: "EDITOR" });
    await prisma.orgInvite.update({ where: { id: first.invite.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const second = await inviteMember(owner.id, org.id, { email: "volta@teste.dev", role: "EDITOR" });
    expect(second.invite.id).not.toBe(first.invite.id);
    expect((await prisma.orgInvite.findUniqueOrThrow({ where: { id: first.invite.id } })).revokedAt).not.toBeNull();
  });
});

describe("convites — aceitação", () => {
  it("aceita: cria a participação com o papel do convite, marca aceito e avisa quem convidou", async () => {
    const { owner, org } = await proOrg();
    const guest = await createUser({ email: "convidada@teste.dev", name: "Bia Convidada" });
    const { token } = await inviteMember(owner.id, org.id, { email: "Convidada@teste.dev", role: "ADMIN" });

    const res = await acceptInvite(guest.id, token);
    expect(res).toEqual({ organizationId: org.id, alreadyMember: false });
    const m = await prisma.membership.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: org.id, userId: guest.id } } });
    expect(m.role).toBe("ADMIN");
    const inv = await prisma.orgInvite.findFirstOrThrow({ where: { organizationId: org.id } });
    expect(inv.acceptedAt).not.toBeNull();
    const n = await prisma.notification.findFirst({ where: { userId: owner.id, type: "ORG_INVITE" } });
    expect(n?.title).toContain("Bia Convidada");
  });

  it("é idempotente: aceitar de novo não duplica nem gera novos avisos", async () => {
    const { owner, org } = await proOrg();
    const guest = await createUser({ email: "dupla@teste.dev" });
    const { token } = await inviteMember(owner.id, org.id, { email: "dupla@teste.dev", role: "EDITOR" });
    await acceptInvite(guest.id, token);
    const again = await acceptInvite(guest.id, token);
    expect(again).toEqual({ organizationId: org.id, alreadyMember: true });
    expect(await prisma.membership.count({ where: { organizationId: org.id } })).toBe(2);
    expect(await prisma.notification.count({ where: { userId: owner.id, type: "ORG_INVITE" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "team.invite_accept" } })).toBe(1);
  });

  it("não aceita com outro e-mail (e não revela o e-mail completo na máscara)", async () => {
    const { owner, org } = await proOrg();
    const other = await createUser({ email: "outra@teste.dev" });
    const { token } = await inviteMember(owner.id, org.id, { email: "certa@teste.dev", role: "EDITOR" });
    await expect(acceptInvite(other.id, token)).rejects.toThrow(/outro e-mail/);
    expect(await prisma.membership.count({ where: { organizationId: org.id } })).toBe(1);
    expect(maskEmail("certa@teste.dev")).toBe("ce•••@teste.dev");
    expect(maskEmail("ab@x.com")).toBe("a•••@x.com");
  });

  it("convite expirado, cancelado ou com token inválido não funciona", async () => {
    const { owner, org } = await proOrg();
    const guest = await createUser({ email: "atrasada@teste.dev" });
    const { invite, token } = await inviteMember(owner.id, org.id, { email: "atrasada@teste.dev", role: "EDITOR" });

    await prisma.orgInvite.update({ where: { id: invite.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    expect((await findInviteByToken(token))?.state).toBe("expired");
    await expect(acceptInvite(guest.id, token)).rejects.toThrow(/expirou/);

    await prisma.orgInvite.update({ where: { id: invite.id }, data: { expiresAt: new Date(Date.now() + 86_400_000) } });
    await revokeInvite(owner.id, invite.id);
    expect((await findInviteByToken(token))?.state).toBe("revoked");
    await expect(acceptInvite(guest.id, token)).rejects.toThrow(/cancelado/);

    await expect(acceptInvite(guest.id, "token-que-nao-existe-123")).rejects.toThrow(/inválido/);
    expect(await findInviteByToken("")).toBeNull();
  });

  it("reenviar troca o link: o antigo deixa de valer e o novo funciona", async () => {
    const { owner, org } = await proOrg();
    const guest = await createUser({ email: "reenvio@teste.dev" });
    const first = await inviteMember(owner.id, org.id, { email: "reenvio@teste.dev", role: "EDITOR" });
    const second = await resendInvite(owner.id, first.invite.id);
    expect(second.token).not.toBe(first.token);
    expect(await findInviteByToken(first.token)).toBeNull();
    await expect(acceptInvite(guest.id, second.token)).resolves.toMatchObject({ organizationId: org.id });
  });

  it("bloqueia a aceitação se o plano diminuiu e a equipe já está cheia", async () => {
    const { owner, org } = await proOrg();
    const guest = await createUser({ email: "semvaga@teste.dev" });
    const { token } = await inviteMember(owner.id, org.id, { email: "semvaga@teste.dev", role: "EDITOR" });
    await setPlan(org.id, "FREE");
    await expect(acceptInvite(guest.id, token)).rejects.toBeInstanceOf(PlanLimitError);
    expect(await prisma.membership.count({ where: { organizationId: org.id } })).toBe(1);
  });

  it("inviteState segue a ordem aceito > cancelado > vencido > válido", () => {
    const now = new Date("2026-10-18T12:00:00Z");
    const future = new Date("2026-10-20T12:00:00Z");
    const past = new Date("2026-10-17T12:00:00Z");
    expect(inviteState({ acceptedAt: null, revokedAt: null, expiresAt: future }, now)).toBe("valid");
    expect(inviteState({ acceptedAt: null, revokedAt: null, expiresAt: past }, now)).toBe("expired");
    expect(inviteState({ acceptedAt: null, revokedAt: now, expiresAt: past }, now)).toBe("revoked");
    expect(inviteState({ acceptedAt: now, revokedAt: null, expiresAt: past }, now)).toBe("accepted");
  });
});
