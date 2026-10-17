import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { AuthError, assertOrgRole } from "@/server/auth/guards";
import { getSessionUser } from "@/server/auth/session";
import { isSameOrigin } from "@/server/request";
import { rateLimit, retryMessage } from "@/server/security/rate-limit";
import { putObject } from "@/server/storage";
import { ImageError, MAX_UPLOAD_BYTES, processImage, type ImagePurpose } from "@/server/storage/images";
import { shortId } from "@/lib/slug";

export const dynamic = "force-dynamic";

const PURPOSES: ImagePurpose[] = ["event-cover", "org-logo", "org-cover", "avatar"];

/**
 * Upload de imagem (multipart: file, purpose, organizationId?).
 * Resposta: { id, url, thumbUrl, width, height, dominantColor }.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Entre na sua conta para enviar imagens." }, { status: 401 });

  const rl = await rateLimit("upload", user.id);
  if (!rl.allowed) return NextResponse.json({ error: retryMessage(rl.retryAfterSeconds) }, { status: 429 });

  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_UPLOAD_BYTES + 64 * 1024) return NextResponse.json({ error: "A imagem pode ter no máximo 8 MB." }, { status: 413 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Envio inválido." }, { status: 400 });
  }
  const file = form.get("file");
  const purpose = String(form.get("purpose") ?? "") as ImagePurpose;
  const organizationId = form.get("organizationId") ? String(form.get("organizationId")) : null;
  if (!(file instanceof File)) return NextResponse.json({ error: "Selecione uma imagem." }, { status: 400 });
  if (!PURPOSES.includes(purpose)) return NextResponse.json({ error: "Tipo de imagem inválido." }, { status: 400 });

  try {
    if (purpose !== "avatar") {
      if (!organizationId) return NextResponse.json({ error: "Organização não informada." }, { status: 400 });
      await assertOrgRole(user.id, organizationId, purpose === "event-cover" ? "EDITOR" : "ADMIN");
    }
    const processed = await processImage(Buffer.from(await file.arrayBuffer()), purpose);
    const now = new Date();
    const folder = purpose === "avatar" ? `avatars/${user.id}` : `orgs/${organizationId}/${purpose}`;
    const base = `${folder}/${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}-${shortId(10)}`;
    const [url, thumbUrl] = await Promise.all([
      putObject(`${base}.webp`, processed.full, "image/webp"),
      putObject(`${base}-thumb.webp`, processed.thumb, "image/webp"),
    ]);
    const upload = await prisma.upload.create({
      data: {
        key: `${base}.webp`,
        url,
        thumbUrl,
        mimeType: "image/webp",
        width: processed.width,
        height: processed.height,
        bytes: processed.full.length,
        dominantColor: processed.dominantColor,
        purpose,
        uploadedById: user.id,
        organizationId,
      },
    });
    return NextResponse.json({
      id: upload.id,
      url,
      thumbUrl,
      width: processed.width,
      height: processed.height,
      dominantColor: processed.dominantColor,
    });
  } catch (err) {
    if (err instanceof ImageError) return NextResponse.json({ error: err.message }, { status: 422 });
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("[upload]", err);
    const msg = err instanceof Error && /STORAGE_DRIVER|S3_PUBLIC_URL/.test(err.message) ? err.message : "Não foi possível salvar a imagem agora.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
