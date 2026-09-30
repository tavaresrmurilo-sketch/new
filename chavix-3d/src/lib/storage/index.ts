import "server-only";
import { del, put } from "@vercel/blob";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { processImage } from "./image";

export { MAX_UPLOAD_BYTES, UploadError, detectImageType } from "./image";

type Driver = "database" | "vercel-blob";

function driver(): Driver {
  return process.env.STORAGE_DRIVER === "vercel-blob" ? "vercel-blob" : "database";
}

export interface StoredImage {
  url: string;
  thumbUrl: string;
  storageKey: string;
  thumbKey: string;
  width: number;
  height: number;
}

async function storeBuffer(buffer: Buffer, width: number, height: number): Promise<{ url: string; key: string }> {
  if (driver() === "vercel-blob") {
    const name = `produtos/${randomBytes(12).toString("hex")}.webp`;
    const blob = await put(name, buffer, { access: "public", contentType: "image/webp", addRandomSuffix: false });
    return { url: blob.url, key: blob.url };
  }
  const file = await db.storedFile.create({
    data: { kind: "PRODUCT_IMAGE", contentType: "image/webp", size: buffer.length, width, height, data: new Uint8Array(buffer) },
    select: { id: true },
  });
  return { url: `/files/${file.id}`, key: file.id };
}

/** Processa e guarda uma imagem de produto em dois tamanhos (1600 px e 600 px). */
export async function saveProductImage(input: Buffer): Promise<StoredImage> {
  const full = await processImage(input, 1600);
  const thumb = await processImage(input, 600, 78);
  const [a, b] = await Promise.all([
    storeBuffer(full.buffer, full.width, full.height),
    storeBuffer(thumb.buffer, thumb.width, thumb.height),
  ]);
  return { url: a.url, thumbUrl: b.url, storageKey: a.key, thumbKey: b.key, width: full.width, height: full.height };
}

export async function deleteStoredImage(key: string | null | undefined): Promise<void> {
  if (!key) return;
  if (/^https?:\/\//.test(key)) {
    await del(key).catch(() => undefined);
    return;
  }
  await db.storedFile.deleteMany({ where: { id: key, kind: "PRODUCT_IMAGE" } });
}

/**
 * Referências enviadas por clientes ficam sempre no banco, com acesso restrito
 * ao próprio carrinho e ao painel — nunca em URL pública.
 */
export async function saveCustomerReference(input: Buffer, ownerHash: string): Promise<{ id: string }> {
  const image = await processImage(input, 1600);
  return db.storedFile.create({
    data: {
      kind: "CUSTOMER_REFERENCE",
      contentType: image.contentType,
      size: image.buffer.length,
      width: image.width,
      height: image.height,
      data: new Uint8Array(image.buffer),
      ownerHash,
    },
    select: { id: true },
  });
}
