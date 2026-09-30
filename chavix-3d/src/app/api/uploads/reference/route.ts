import { NextResponse, type NextRequest } from "next/server";
import { getOrCreateCart, hashCartToken } from "@/lib/cart/service";
import { clientIpFrom, isSameOrigin } from "@/lib/security/request";
import { rateLimit } from "@/lib/security/rate-limit";
import { MAX_UPLOAD_BYTES, saveCustomerReference, UploadError } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Upload da imagem de referência do chaveiro personalizado (fica privada no banco). */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Origem não permitida" }, { status: 403 });

  const limit = await rateLimit(`upload-ref:${clientIpFrom(request.headers)}`, 12, 3600);
  if (!limit.allowed) return NextResponse.json({ error: "Muitos envios. Tente de novo mais tarde." }, { status: 429 });

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_UPLOAD_BYTES + 64 * 1024) return NextResponse.json({ error: "Imagem maior que 4 MB" }, { status: 413 });

  let file: File | null = null;
  try {
    const form = await request.formData();
    const value = form.get("file");
    file = value instanceof File ? value : null;
  } catch {
    return NextResponse.json({ error: "Envio inválido" }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: "Selecione uma imagem" }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Imagem maior que 4 MB" }, { status: 413 });

  try {
    const cart = await getOrCreateCart();
    const stored = await saveCustomerReference(Buffer.from(await file.arrayBuffer()), hashCartToken(cart.token));
    return NextResponse.json({ id: stored.id, url: `/files/${stored.id}` });
  } catch (error) {
    if (error instanceof UploadError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("upload reference", error);
    return NextResponse.json({ error: "Não foi possível enviar a imagem" }, { status: 500 });
  }
}
