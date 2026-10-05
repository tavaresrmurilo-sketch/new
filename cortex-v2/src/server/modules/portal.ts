import "server-only";
import { prisma } from "@/lib/db";
import { tenantDb } from "@/server/db/tenant";
import { hashToken } from "@/server/security/crypto";

/**
 * Dados do Portal do Cliente: somente itens explicitamente compartilhados com aquele cliente.
 * O acesso é por token (hash no banco), com validade e revogação.
 */
export async function loadPortal(token: string) {
  if (!token || token.length < 20) return null;
  const access = await prisma.portalAccess.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!access || access.revokedAt || access.expiresAt < new Date()) return null;
  const db = tenantDb(access.organizationId);
  const [org, client] = await Promise.all([
    prisma.organization.findUnique({ where: { id: access.organizationId }, select: { name: true, logoUrl: true, timezone: true, currency: true, blockedAt: true } }),
    db.client.findUnique({ where: { id: access.clientId }, select: { id: true, name: true } }),
  ]);
  if (!org || org.blockedAt || !client) return null;
  await prisma.portalAccess.update({ where: { id: access.id }, data: { lastAccessAt: new Date(), accessCount: { increment: 1 } } });
  const [projects, documents, proposals, meetings] = await Promise.all([
    db.project.findMany({
      where: { clientId: client.id, sharedWithClient: true, status: { not: "CANCELED" } },
      select: {
        id: true,
        name: true,
        status: true,
        startDate: true,
        dueDate: true,
        progress: true,
        completedAt: true,
        tasks: { where: { deletedAt: null, parentId: null, status: { not: "CANCELED" } }, select: { title: true, status: true, completedAt: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.document.findMany({ where: { clientId: client.id, sharedWithClient: true }, select: { id: true, name: true, fileName: true, sizeBytes: true, category: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
    db.proposal.findMany({
      where: { clientId: client.id, status: { in: ["SENT", "VIEWED", "NEGOTIATION", "ACCEPTED"] }, publicToken: { not: null } },
      select: { number: true, title: true, status: true, total: true, validUntil: true, publicToken: true, sentAt: true },
      orderBy: { createdAt: "desc" },
    }),
    db.meeting.findMany({ where: { clientId: client.id, status: { not: "CANCELED" } }, select: { title: true, startsAt: true, status: true, location: true }, orderBy: { startsAt: "desc" }, take: 20 }),
  ]);
  return { access, org, client, projects, documents, proposals, meetings };
}

/** Verifica se um documento pode ser baixado por este token de portal. */
export async function portalDocument(token: string, documentId: string) {
  const access = await prisma.portalAccess.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!access || access.revokedAt || access.expiresAt < new Date()) return null;
  return tenantDb(access.organizationId).document.findFirst({ where: { id: documentId, clientId: access.clientId, sharedWithClient: true } });
}
