import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { can, getCtx } from "@/server/auth/context";
import { getProposalDetail } from "@/server/modules/proposals";
import { renderProposalPdf } from "@/server/pdf/proposal-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!can(ctx, "proposals.read")) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const { id } = await params;
  const p = await getProposalDetail(ctx, id);
  if (!p) return NextResponse.json({ error: "Proposta não encontrada" }, { status: 404 });
  const [org, contact] = await Promise.all([
    prisma.organization.findUnique({ where: { id: ctx.org.id }, select: { name: true, legalName: true, document: true } }),
    p.contactId ? ctx.db.contact.findUnique({ where: { id: p.contactId }, select: { name: true } }) : null,
  ]);
  const pdf = await renderProposalPdf({
    org: org!,
    proposal: { ...p, taxes: (p.taxes as { name: string; rate: number }[]) ?? [] },
    client: p.client,
    contactName: contact?.name ?? null,
    ownerName: p.owner?.name ?? null,
  });
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="proposta-${p.number}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
