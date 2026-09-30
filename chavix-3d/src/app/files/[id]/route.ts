import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/auth/session";
import { hashCartToken, readCartToken } from "@/lib/cart/service";

export const dynamic = "force-dynamic";

/**
 * Serve arquivos guardados no banco (driver "database").
 * Imagens de produto são públicas e imutáveis (cache longo).
 * Referências de clientes só são entregues ao próprio carrinho ou ao painel.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9]{20,40}$/i.test(id)) return new NextResponse(null, { status: 404 });

  const file = await db.storedFile.findUnique({ where: { id } });
  if (!file) return new NextResponse(null, { status: 404 });

  const headers: Record<string, string> = {
    "Content-Type": file.contentType,
    "Content-Length": String(file.size),
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  };

  if (file.kind === "CUSTOMER_REFERENCE") {
    const admin = await getAdminSession();
    const token = await readCartToken();
    const isOwner = token && file.ownerHash && hashCartToken(token) === file.ownerHash;
    if (!admin && !isOwner) return new NextResponse(null, { status: 404 });
    headers["Cache-Control"] = "private, no-store";
  } else {
    headers["Cache-Control"] = "public, max-age=31536000, immutable";
  }

  return new NextResponse(new Uint8Array(file.data), { headers });
}
