import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env, integrations } from "@/server/env";

/**
 * Armazenamento de arquivos públicos (imagens já processadas).
 * - local: disco (desenvolvimento / servidor próprio), servido por /media/*
 * - s3: qualquer S3 compatível (Cloudflare R2, AWS S3, Supabase Storage, MinIO)
 */
const KEY_RE = /^[a-z0-9][a-z0-9/_.-]{0,200}$/;

export function isSafeKey(key: string): boolean {
  return KEY_RE.test(key) && !key.includes("..") && !key.includes("//");
}

function localRoot() {
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), env().STORAGE_LOCAL_DIR);
}

let s3: S3Client | null = null;
function s3Client() {
  const e = env();
  s3 ??= new S3Client({
    region: e.S3_REGION,
    endpoint: e.S3_ENDPOINT,
    forcePathStyle: e.S3_FORCE_PATH_STYLE,
    credentials: { accessKeyId: e.S3_ACCESS_KEY_ID!, secretAccessKey: e.S3_SECRET_ACCESS_KEY! },
  });
  return s3;
}

export function storageDriver(): "local" | "s3" {
  return integrations().s3 ? "s3" : "local";
}

export function publicUrl(key: string): string {
  if (storageDriver() === "s3") {
    const base = env().S3_PUBLIC_URL;
    if (!base) throw new Error("Defina S3_PUBLIC_URL (URL pública do bucket) para servir as imagens.");
    return `${base.replace(/\/$/, "")}/${key}`;
  }
  return `/media/${key}`;
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<string> {
  if (!isSafeKey(key)) throw new Error("Chave de arquivo inválida");
  if (storageDriver() === "s3") {
    await s3Client().send(
      new PutObjectCommand({
        Bucket: env().S3_BUCKET!,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
  } else {
    if (process.env.VERCEL) {
      throw new Error("Na Vercel o disco é temporário: configure STORAGE_DRIVER=s3 (ex.: Cloudflare R2) para enviar imagens.");
    }
    const file = path.join(localRoot(), key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
  }
  return publicUrl(key);
}

export async function deleteObject(key: string): Promise<void> {
  if (!isSafeKey(key)) return;
  if (storageDriver() === "s3") {
    await s3Client().send(new DeleteObjectCommand({ Bucket: env().S3_BUCKET!, Key: key }));
  } else {
    await rm(path.join(localRoot(), key), { force: true });
  }
}

/** Leitura local (rota /media). Retorna null se não existir. */
export async function readLocalObject(key: string): Promise<Buffer | null> {
  if (!isSafeKey(key)) return null;
  const root = localRoot();
  const file = path.resolve(root, key);
  if (!file.startsWith(root + path.sep)) return null;
  try {
    return await readFile(file);
  } catch {
    return null;
  }
}
