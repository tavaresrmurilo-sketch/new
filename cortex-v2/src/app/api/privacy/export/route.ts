import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { can, getCtx } from "@/server/auth/context";
import { audit } from "@/server/audit";
import { enforceRateLimit } from "@/server/security/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** LGPD: exportação dos dados do usuário (scope=me) ou do workspace (scope=org, requer data.export). */
export async function GET(req: Request) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const scope = new URL(req.url).searchParams.get("scope") === "org" ? "org" : "me";
  try {
    await enforceRateLimit(`privacy-export:${ctx.user.id}`, 5, 3600);
  } catch {
    return NextResponse.json({ error: "Limite de exportações por hora atingido." }, { status: 429 });
  }
  let data: unknown;
  if (scope === "me") {
    data = await prisma.user.findUnique({
      where: { id: ctx.user.id },
      select: { id: true, email: true, name: true, avatarUrl: true, createdAt: true, lastLoginAt: true, consents: true, memberships: { select: { organizationId: true, title: true, department: true, joinedAt: true, role: { select: { name: true } } } }, sessions: { select: { createdAt: true, lastActivityAt: true, ip: true, userAgent: true } } },
    });
  } else {
    if (!can(ctx, "data.export")) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    const db = ctx.db;
    const all = { where: {} };
    const [organization, clients, contacts, leads, opportunities, activities, projects, risks, tasks, meetings, proposals, contracts, receivables, documents, memory, decisions, tags] = await Promise.all([
      prisma.organization.findUnique({ where: { id: ctx.org.id }, select: { id: true, name: true, legalName: true, document: true, segment: true, timezone: true, currency: true, createdAt: true, settings: true } }),
      db.client.findMany(all), db.contact.findMany(all), db.lead.findMany(all), db.opportunity.findMany(all), db.activity.findMany(all), db.project.findMany(all), db.risk.findMany(all),
      db.task.findMany(all), db.meeting.findMany({ where: {}, include: { participants: true } }), db.proposal.findMany({ where: {}, include: { items: true } }), db.contract.findMany(all), db.receivable.findMany(all),
      db.document.findMany({ where: {}, select: { id: true, name: true, fileName: true, mimeType: true, sizeBytes: true, category: true, clientId: true, projectId: true, createdAt: true } }), db.memoryFact.findMany(all), db.decision.findMany(all), db.tag.findMany(all),
    ]);
    data = { organization, clients, contacts, leads, opportunities, activities, projects, risks, tasks, meetings, proposals, contracts, receivables, documents, memory, decisions, tags };
  }
  await audit(ctx, scope === "org" ? "privacy.org_exported" : "privacy.user_exported", {});
  const body = JSON.stringify({ exportedAt: new Date().toISOString(), scope, data }, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2);
  return new NextResponse(body, { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="cortex-export-${scope}-${new Date().toISOString().slice(0, 10)}.json"`, "Cache-Control": "private, no-store" } });
}
