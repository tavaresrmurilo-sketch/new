import { beforeEach, describe, expect, it } from "vitest";
import { AuthError } from "@/server/auth/guards";
import { createOrganization, onboardingChecklist, setOrganizationLogo, uniqueOrgSlug, updateOrganization } from "@/server/organizations/service";
import { orgCreateSchema, orgUpdateSchema } from "@/lib/validation/organization";
import { createOrg, createUser, prisma, resetDb } from "../helpers";

beforeEach(resetDb);

const base = { name: "Casa do Som", city: "Recife", state: "PE" };

describe("onboarding da organização", () => {
  it("cria com slug a partir do nome e o criador vira OWNER", async () => {
    const u = await createUser();
    const org = await createOrganization(u.id, orgCreateSchema.parse({ ...base, bio: "Shows ao vivo toda sexta." }));
    expect(org.slug).toBe("casa-do-som");
    expect(org.plan).toBe("FREE");
    const m = await prisma.membership.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: org.id, userId: u.id } } });
    expect(m.role).toBe("OWNER");
    expect(await prisma.auditLog.count({ where: { action: "org.create", targetId: org.id } })).toBe(1);
  });

  it("gera sufixo quando o slug já existe e evita slugs reservados", async () => {
    const u = await createUser();
    const a = await createOrganization(u.id, orgCreateSchema.parse(base));
    const b = await createOrganization(u.id, orgCreateSchema.parse(base));
    expect(a.slug).toBe("casa-do-som");
    expect(b.slug).toBe("casa-do-som-2");
    expect(await uniqueOrgSlug("Admin")).toBe("admin-2");
    expect(await uniqueOrgSlug("!!!")).toBe("organizacao");
  });

  it("valida nome, cidade e UF", () => {
    expect(orgCreateSchema.safeParse({ name: "A", city: "Recife", state: "PE" }).success).toBe(false);
    expect(orgCreateSchema.safeParse({ ...base, state: "ZZ" }).success).toBe(false);
    expect(orgCreateSchema.safeParse({ ...base, bio: "x".repeat(281) }).success).toBe(false);
  });

  it("conta suspensa não cria organização", async () => {
    const u = await createUser({ status: "SUSPENDED" });
    await expect(createOrganization(u.id, orgCreateSchema.parse(base))).rejects.toThrow(/não pode criar/);
  });
});

describe("perfil da organização", () => {
  it("só ADMIN/OWNER editam; o slug não muda", async () => {
    const owner = await createUser();
    const org = await createOrg(owner.id, { slug: "casa-do-som", name: "Casa do Som" });
    const editor = await createUser();
    await prisma.membership.create({ data: { organizationId: org.id, userId: editor.id, role: "EDITOR" } });
    const outsider = await createUser();
    const input = orgUpdateSchema.parse({ ...base, name: "Casa do Som Recife", instagram: "@casadosom", whatsapp: "(81) 99999-0000", website: "casadosom.com.br" });

    await expect(updateOrganization(editor.id, org.id, input)).rejects.toBeInstanceOf(AuthError);
    await expect(updateOrganization(outsider.id, org.id, input)).rejects.toBeInstanceOf(AuthError);
    const updated = await updateOrganization(owner.id, org.id, input);
    expect(updated).toMatchObject({ name: "Casa do Som Recife", slug: "casa-do-som", instagram: "casadosom", whatsapp: "5581999990000", website: "https://casadosom.com.br" });
  });

  it("logo e capa só de uploads da própria organização", async () => {
    const owner = await createUser();
    const org = await createOrg(owner.id);
    const other = await createOrg(owner.id);
    await prisma.upload.create({ data: { key: "a", url: "/media/a.webp", mimeType: "image/webp", width: 1, height: 1, bytes: 1, purpose: "org-logo", organizationId: other.id } });
    await expect(setOrganizationLogo(owner.id, org.id, "/media/a.webp")).rejects.toThrow(/Envie a imagem/);
    await prisma.upload.create({ data: { key: "b", url: "/media/b.webp", mimeType: "image/webp", width: 1, height: 1, bytes: 1, purpose: "org-logo", organizationId: org.id } });
    await setOrganizationLogo(owner.id, org.id, "/media/b.webp");
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).logoUrl).toBe("/media/b.webp");
    // Logo enviado como capa não vale.
    await expect(updateOrganization(owner.id, org.id, orgUpdateSchema.parse({ ...base, logoUrl: "/media/b.webp", coverUrl: "/media/b.webp" }))).rejects.toThrow();
    await setOrganizationLogo(owner.id, org.id, null);
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).logoUrl).toBeNull();
  });

  it("checklist reflete o estado real", async () => {
    const owner = await createUser();
    const org = await createOrg(owner.id);
    let list = await onboardingChecklist(org.id, { emailVerified: false });
    expect(list.map((i) => i.done)).toEqual([false, false, false, false]);
    await prisma.organization.update({ where: { id: org.id }, data: { bio: "Bio", city: "Recife", instagram: "x", logoUrl: "/media/l.webp" } });
    await prisma.event.create({
      data: {
        organizationId: org.id,
        categoryId: (await prisma.category.findFirstOrThrow()).id,
        slug: "e-1",
        title: "E",
        status: "PUBLISHED",
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 3_600_000),
        venueName: "V",
        address: "A",
        city: "C",
        lat: 0,
        lng: 0,
      },
    });
    list = await onboardingChecklist(org.id, { emailVerified: true });
    expect(list.every((i) => i.done)).toBe(true);
  });
});
