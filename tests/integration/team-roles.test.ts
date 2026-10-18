import { beforeEach, describe, expect, it } from "vitest";
import { AuthError } from "@/server/auth/guards";
import { changeMemberRole, leaveOrganization, listTeam, removeMember, TeamError, transferOwnership } from "@/server/team/service";
import { createOrg, createUser, prisma, resetDb, setPlan } from "../helpers";

beforeEach(async () => {
  await resetDb();
});

async function team() {
  const owner = await createUser({ name: "Olga Dona" });
  const admin = await createUser({ name: "Ari Admin" });
  const editor = await createUser({ name: "Edu Editor" });
  const org = await createOrg(owner.id, { name: "Coletivo Noturno" });
  await setPlan(org.id, "PRO");
  await prisma.membership.createMany({
    data: [
      { organizationId: org.id, userId: admin.id, role: "ADMIN" },
      { organizationId: org.id, userId: editor.id, role: "EDITOR" },
    ],
  });
  return { owner, admin, editor, org };
}

const roleOf = async (organizationId: string, userId: string) =>
  (await prisma.membership.findUnique({ where: { organizationId_userId: { organizationId, userId } } }))?.role ?? null;

describe("papéis", () => {
  it("lista a equipe com proprietários primeiro", async () => {
    const { org } = await team();
    const { members } = await listTeam(org.id);
    expect(members.map((m) => m.role)).toEqual(["OWNER", "ADMIN", "EDITOR"]);
  });

  it("só o OWNER promove e rebaixa; ADMIN e EDITOR não alteram papéis", async () => {
    const { owner, admin, editor, org } = await team();
    await expect(changeMemberRole(admin.id, org.id, editor.id, "ADMIN")).rejects.toBeInstanceOf(AuthError);
    await expect(changeMemberRole(editor.id, org.id, admin.id, "EDITOR")).rejects.toBeInstanceOf(AuthError);

    await changeMemberRole(owner.id, org.id, editor.id, "ADMIN");
    expect(await roleOf(org.id, editor.id)).toBe("ADMIN");
    await changeMemberRole(owner.id, org.id, admin.id, "EDITOR");
    expect(await roleOf(org.id, admin.id)).toBe("EDITOR");
    expect(await prisma.auditLog.count({ where: { action: "team.role_change" } })).toBe(2);
  });

  it("o OWNER não muda o próprio papel nem o de outro OWNER por aqui", async () => {
    const { owner, admin, org } = await team();
    await expect(changeMemberRole(owner.id, org.id, owner.id, "ADMIN")).rejects.toBeInstanceOf(TeamError);
    await prisma.membership.update({ where: { organizationId_userId: { organizationId: org.id, userId: admin.id } }, data: { role: "OWNER" } });
    await expect(changeMemberRole(owner.id, org.id, admin.id, "EDITOR")).rejects.toBeInstanceOf(TeamError);
  });
});

describe("transferência de propriedade", () => {
  it("OWNER transfere: o novo vira OWNER e o anterior vira ADMIN", async () => {
    const { owner, editor, org } = await team();
    await transferOwnership(owner.id, org.id, editor.id);
    expect(await roleOf(org.id, editor.id)).toBe("OWNER");
    expect(await roleOf(org.id, owner.id)).toBe("ADMIN");
    expect(await prisma.membership.count({ where: { organizationId: org.id, role: "OWNER" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "team.ownership_transfer", targetId: org.id } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: editor.id } })).toBe(1);
  });

  it("ADMIN não transfere; ninguém transfere para quem não é da equipe", async () => {
    const { owner, admin, editor, org } = await team();
    const outsider = await createUser();
    await expect(transferOwnership(admin.id, org.id, editor.id)).rejects.toBeInstanceOf(AuthError);
    await expect(transferOwnership(owner.id, org.id, outsider.id)).rejects.toBeInstanceOf(TeamError);
    await expect(transferOwnership(owner.id, org.id, owner.id)).rejects.toBeInstanceOf(TeamError);
    expect(await roleOf(org.id, owner.id)).toBe("OWNER");
  });
});

describe("remoção e saída", () => {
  it("ADMIN remove EDITOR, mas não remove OWNER; EDITOR não remove ninguém", async () => {
    const { owner, admin, editor, org } = await team();
    await expect(removeMember(editor.id, org.id, admin.id)).rejects.toBeInstanceOf(AuthError);
    await expect(removeMember(admin.id, org.id, owner.id)).rejects.toBeInstanceOf(AuthError);
    await removeMember(admin.id, org.id, editor.id);
    expect(await roleOf(org.id, editor.id)).toBeNull();
    expect(await prisma.auditLog.count({ where: { action: "team.member_remove" } })).toBe(1);
  });

  it("ninguém se remove pelo botão de remover (usa “sair”)", async () => {
    const { admin, org } = await team();
    await expect(removeMember(admin.id, org.id, admin.id)).rejects.toBeInstanceOf(TeamError);
  });

  it("com dois OWNERs, um pode remover o outro; o último OWNER nunca fica sem substituto", async () => {
    const { owner, admin, org } = await team();
    await prisma.membership.update({ where: { organizationId_userId: { organizationId: org.id, userId: admin.id } }, data: { role: "OWNER" } });
    await removeMember(owner.id, org.id, admin.id);
    expect(await roleOf(org.id, admin.id)).toBeNull();
    await expect(leaveOrganization(owner.id, org.id)).rejects.toThrow(/Transfira a propriedade/);
    expect(await roleOf(org.id, owner.id)).toBe("OWNER");
  });

  it("o último OWNER não sai; depois de transferir, sai normalmente", async () => {
    const { owner, admin, editor, org } = await team();
    await expect(leaveOrganization(owner.id, org.id)).rejects.toBeInstanceOf(TeamError);
    await leaveOrganization(editor.id, org.id);
    expect(await roleOf(org.id, editor.id)).toBeNull();

    await transferOwnership(owner.id, org.id, admin.id);
    await leaveOrganization(owner.id, org.id);
    expect(await roleOf(org.id, owner.id)).toBeNull();
    expect(await prisma.membership.count({ where: { organizationId: org.id, role: "OWNER" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "team.leave" } })).toBe(2);
  });

  it("quem não é da organização não consegue sair dela", async () => {
    const { org } = await team();
    const outsider = await createUser();
    await expect(leaveOrganization(outsider.id, org.id)).rejects.toBeInstanceOf(TeamError);
  });
});
