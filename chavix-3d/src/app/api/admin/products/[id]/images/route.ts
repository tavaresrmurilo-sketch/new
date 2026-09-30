import { NextResponse, type NextRequest } from "next/server";
import { getAdminSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { isSameOrigin } from "@/lib/security/request";
import { rateLimit } from "@/lib/security/rate-limit";
import { MAX_UPLOAD_BYTES, saveProductImage, UploadError } from "@/lib/storage";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

/** Upload de imagem de produto (uma por requisição, até 4 MB). Somente administradores. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Origem não permitida" }, { status: 403 });
  if (!(await rateLimit(`admin-upload:${session.adminId}`, 120, 3600)).allowed) {
    return NextResponse.json({ error: "Limite de envios atingido. Aguarde um pouco." }, { status: 429 });
  }

  const { id } = await params;
  const product = await db.product.findUnique({ where: { id }, select: { id: true, name: true, slug: true, _count: { select: { images: true } } } });
  if (!product) return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });
  if (product._count.images >= 12) return NextResponse.json({ error: "Máximo de 12 imagens por produto" }, { status: 400 });

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
    const stored = await saveProductImage(Buffer.from(await file.arrayBuffer()));
    const image = await db.productImage.create({
      data: {
        productId: product.id,
        url: stored.url,
        thumbUrl: stored.thumbUrl,
        storageKey: stored.storageKey,
        thumbKey: stored.thumbKey,
        width: stored.width,
        height: stored.height,
        alt: product.name,
        position: product._count.images,
      },
    });
    revalidatePath("/", "layout");
    return NextResponse.json({ id: image.id, url: image.url, thumbUrl: image.thumbUrl });
  } catch (error) {
    if (error instanceof UploadError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("product image upload", error);
    return NextResponse.json({ error: "Falha ao processar a imagem" }, { status: 500 });
  }
}
