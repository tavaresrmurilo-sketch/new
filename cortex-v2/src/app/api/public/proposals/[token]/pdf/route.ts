import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { renderProposalPdf } from "@/server/pdf/proposal-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = await prisma.proposal.findUnique({
    where: { publicToken: token },
    include: { items: { orderBy: { sortOrder: "asc" } }, client: { select: { name: true, legalName: true, document: true, city: true, state: true } }, owner: { select: { name: true } } },
  });
  if (!p || p.deletedAt || p.status === "DRAFT") return NextResponse.json({ error: "Não encontrada" }, { status: 404 });
  const [org, contact] = await Promise.all([
    prisma.organization.findUnique({ where: { id: p.organizationId }, select: { name: true, legalName: true, document: true } }),
    p.contactId ? prisma.contact.findUnique({ where: { id: p.contactId }, select: { name: true } }) : null,
  ]);
  const pdf = await renderProposalPdf({ org: org!, proposal: { ...p, taxes: (p.taxes as { name: string; rate: number }[]) ?? [] }, client: p.client, contactName: contact?.name ?? null, ownerName: p.owner?.name ?? null });
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="proposta-${p.number}.pdf"`, "Cache-Control": "private, no-store" } });
}
