import { NextResponse } from "next/server";
import { portalDocument, } from "@/server/modules/portal";
import { readDocumentFile } from "@/server/modules/documents";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const doc = await portalDocument(token, id);
  if (!doc) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  const data = await readDocumentFile(doc);
  if (!data) return NextResponse.json({ error: "Arquivo indisponível" }, { status: 410 });
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
