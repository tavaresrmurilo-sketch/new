import { NextResponse, type NextRequest } from "next/server";
import { can, getCtx } from "@/server/auth/context";
import { readDocumentFile } from "@/server/modules/documents";

export const dynamic = "force-dynamic";

const INLINE_SAFE = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);

/** Download autenticado: verifica sessão, tenant e permissão antes de entregar o arquivo. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!can(ctx, "documents.read")) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const { id } = await params;
  const doc = await ctx.db.document.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: "Documento não encontrado" }, { status: 404 });
  const data = await readDocumentFile(doc);
  if (!data) return NextResponse.json({ error: "Arquivo indisponível no armazenamento" }, { status: 410 });
  const inline = req.nextUrl.searchParams.get("inline") === "1" && INLINE_SAFE.has(doc.mimeType);
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": inline ? doc.mimeType : "application/octet-stream",
      "Content-Length": String(data.length),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
