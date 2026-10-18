import "server-only";
import type { Organization } from "@prisma/client";
import { prisma } from "@/server/db";
import { audit } from "@/server/audit";
import { assertOrgRole } from "@/server/auth/guards";
import { shortId, slugify } from "@/lib/slug";
import type { OrgCreateData, OrgUpdateData } from "@/lib/validation/organization";

/** Erros esperados do domínio de organizações (viram mensagem no formulário). */
export class OrgError extends Error {
  constructor(
    message: string,
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}

/** Caminhos do app que não podem virar slug público (evita confusão em links). */
const RESERVED_SLUGS = new Set(["admin", "painel", "mixtour", "novo", "nova", "api", "suporte", "ajuda", "entrar", "cadastrar"]);

/** Slug único a partir do nome: "Casa do Som" → "casa-do-som", "casa-do-som-2"... */
export async function uniqueOrgSlug(name: string): Promise<string> {
  const base = slugify(name, 48) || "organizacao";
  const candidates = [base, ...Array.from({ length: 8 }, (_, i) => `${base}-${i + 2}`)].filter((s) => !RESERVED_SLUGS.has(s));
  const taken = new Set(
    (await prisma.organization.findMany({ where: { slug: { in: candidates } }, select: { slug: true } })).map((o) => o.slug),
  );
  const free = candidates.find((s) => !taken.has(s));
  if (free) return free;
  for (let i = 0; i < 5; i++) {
    const s = `${base}-${shortId(4)}`;
    if (!(await prisma.organization.findUnique({ where: { slug: s }, select: { id: true } }))) return s;
  }
  return `${base}-${shortId(8)}`;
}

/** Confere que a URL de imagem foi enviada por esta organização (ou já é a atual). */
export async function resolveOrgUpload(
  organizationId: string,
  url: string | null,
  purposes: string[],
  current?: string | null,
): Promise<{ url: string; thumbUrl: string | null; dominantColor: string | null } | null> {
  if (!url) return null;
  if (current && url === current) return { url, thumbUrl: null, dominantColor: null };
  const upload = await prisma.upload.findFirst({
    where: { url, organizationId, purpose: { in: purposes } },
    select: { url: true, thumbUrl: true, dominantColor: true },
  });
  if (!upload) throw new OrgError("Envie a imagem novamente.", { image: "Imagem não encontrada. Envie de novo." });
  return upload;
}

/** Onboarding: cria a organização e torna o criador OWNER. */
export async function createOrganization(userId: string, data: OrgCreateData): Promise<Organization> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { status: true } });
  if (!user || user.status !== "ACTIVE") throw new OrgError("Sua conta não pode criar organizações agora.");

  const owned = await prisma.membership.count({ where: { userId, role: "OWNER" } });
  if (owned >= 10) throw new OrgError("Você já criou o máximo de 10 organizações. Fale com o suporte se precisar de mais.");

  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = await uniqueOrgSlug(data.name);
    try {
      const org = await prisma.$transaction(async (tx) => {
        const created = await tx.organization.create({
          data: { name: data.name, slug, city: data.city, state: data.state, bio: data.bio },
        });
        await tx.membership.create({ data: { organizationId: created.id, userId, role: "OWNER" } });
        return created;
      });
      await audit({ actorId: userId, action: "org.create", targetType: "Organization", targetId: org.id, metadata: { slug } });
      return org;
    } catch (err) {
      // Corrida no slug (P2002): tenta outro.
      if ((err as { code?: string }).code === "P2002" && attempt < 2) continue;
      throw err;
    }
  }
  throw new OrgError("Não foi possível criar a organização agora. Tente de novo.");
}

/** Perfil público da organização — somente ADMIN/OWNER. O slug nunca muda. */
export async function updateOrganization(userId: string, organizationId: string, data: OrgUpdateData): Promise<Organization> {
  await assertOrgRole(userId, organizationId, "ADMIN");
  const current = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { logoUrl: true, coverUrl: true } });
  const [logo, cover] = await Promise.all([
    resolveOrgUpload(organizationId, data.logoUrl, ["org-logo"], current.logoUrl),
    resolveOrgUpload(organizationId, data.coverUrl, ["org-cover"], current.coverUrl),
  ]);
  const org = await prisma.organization.update({
    where: { id: organizationId },
    data: {
      name: data.name,
      bio: data.bio,
      city: data.city,
      state: data.state,
      website: data.website,
      instagram: data.instagram,
      whatsapp: data.whatsapp,
      contactEmail: data.contactEmail,
      logoUrl: logo?.url ?? null,
      coverUrl: cover?.url ?? null,
    },
  });
  await audit({ actorId: userId, action: "org.update", targetType: "Organization", targetId: organizationId });
  return org;
}

/** Atualiza só o logo (passo opcional do onboarding). */
export async function setOrganizationLogo(userId: string, organizationId: string, logoUrl: string | null): Promise<void> {
  await assertOrgRole(userId, organizationId, "ADMIN");
  const current = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { logoUrl: true } });
  const logo = await resolveOrgUpload(organizationId, logoUrl, ["org-logo"], current.logoUrl);
  await prisma.organization.update({ where: { id: organizationId }, data: { logoUrl: logo?.url ?? null } });
}

/** Checklist de primeiros passos do painel. */
export async function onboardingChecklist(organizationId: string, user: { emailVerified: boolean }) {
  const [org, events, published] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { bio: true, city: true, logoUrl: true, coverUrl: true, instagram: true, website: true, whatsapp: true, contactEmail: true } }),
    prisma.event.count({ where: { organizationId } }),
    prisma.event.count({ where: { organizationId, status: { in: ["PUBLISHED", "PENDING_REVIEW", "ARCHIVED", "CANCELED"] } } }),
  ]);
  const hasContact = Boolean(org.instagram || org.website || org.whatsapp || org.contactEmail);
  return [
    { id: "email", label: "Confirme seu e-mail", done: user.emailVerified, href: null },
    { id: "profile", label: "Complete o perfil (bio, cidade e um contato)", done: Boolean(org.bio && org.city && hasContact), href: "/painel/organizacao" },
    { id: "logo", label: "Adicione o logo da organização", done: Boolean(org.logoUrl), href: "/painel/organizacao" },
    { id: "event", label: events > 0 ? "Publique seu primeiro evento" : "Crie seu primeiro evento", done: published > 0, href: events > 0 ? "/painel/eventos?status=rascunho" : "/painel/eventos/novo" },
  ] as const;
}
