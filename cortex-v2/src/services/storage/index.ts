import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { AwsClient } from "aws4fetch";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Armazenamento de arquivos abstrato.
 * - database (padrão): arquivos no PostgreSQL (tabela StoredFile) — funciona em Vercel + Neon sem serviço extra; limite por arquivo.
 * - local: disco do servidor (somente desenvolvimento / VM com volume persistente).
 * - s3: qualquer serviço compatível com S3 (AWS S3, Cloudflare R2, Supabase Storage, MinIO).
 */
export interface StorageProvider {
  readonly name: "database" | "local" | "s3";
  readonly maxFileBytes: number;
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

class DatabaseStorage implements StorageProvider {
  readonly name = "database" as const;
  readonly maxFileBytes = 10 * 1024 * 1024;
  async put(key: string, data: Buffer) {
    const bytes = new Uint8Array(data);
    await prisma.storedFile.upsert({ where: { key }, create: { key, data: bytes }, update: { data: bytes } });
  }
  async get(key: string) {
    const row = await prisma.storedFile.findUnique({ where: { key } });
    return row ? Buffer.from(row.data) : null;
  }
  async delete(key: string) {
    await prisma.storedFile.deleteMany({ where: { key } });
  }
}

class LocalStorage implements StorageProvider {
  readonly name = "local" as const;
  readonly maxFileBytes = 50 * 1024 * 1024;
  constructor(private root: string) {}
  private resolve(key: string) {
    const p = path.resolve(this.root, key);
    if (!p.startsWith(path.resolve(this.root))) throw new Error("Caminho inválido");
    return p;
  }
  async put(key: string, data: Buffer) {
    const p = this.resolve(key);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, data);
  }
  async get(key: string) {
    try {
      return await readFile(this.resolve(key));
    } catch {
      return null;
    }
  }
  async delete(key: string) {
    await rm(this.resolve(key), { force: true });
  }
}

class S3Storage implements StorageProvider {
  readonly name = "s3" as const;
  readonly maxFileBytes = 100 * 1024 * 1024;
  private client: AwsClient;
  constructor(private endpoint: string, private bucket: string, accessKeyId: string, secretAccessKey: string, region: string) {
    this.client = new AwsClient({ accessKeyId, secretAccessKey, region, service: "s3" });
  }
  private url(key: string) {
    return `${this.endpoint.replace(/\/$/, "")}/${this.bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
  }
  async put(key: string, data: Buffer, contentType: string) {
    const res = await this.client.fetch(this.url(key), { method: "PUT", body: new Uint8Array(data), headers: { "Content-Type": contentType } });
    if (!res.ok) throw new Error(`Falha no upload (${res.status})`);
  }
  async get(key: string) {
    const res = await this.client.fetch(this.url(key));
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Falha no download (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }
  async delete(key: string) {
    await this.client.fetch(this.url(key), { method: "DELETE" });
  }
}

let cached: StorageProvider | null = null;

export function storage(): StorageProvider {
  if (cached) return cached;
  const e = env();
  const kind = (e.STORAGE_PROVIDER ?? "database").toLowerCase();
  if (kind === "s3" && e.S3_ENDPOINT && e.S3_BUCKET && e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY) {
    cached = new S3Storage(e.S3_ENDPOINT, e.S3_BUCKET, e.S3_ACCESS_KEY_ID, e.S3_SECRET_ACCESS_KEY, e.S3_REGION ?? "auto");
  } else if (kind === "local") {
    cached = new LocalStorage(e.STORAGE_LOCAL_DIR ?? path.join(process.cwd(), "storage"));
  } else {
    cached = new DatabaseStorage();
  }
  return cached;
}

/** Instância específica (para ler arquivos gravados por outro provedor). */
export function storageFor(name: string): StorageProvider {
  const current = storage();
  if (current.name === name) return current;
  if (name === "database") return new DatabaseStorage();
  if (name === "local") return new LocalStorage(env().STORAGE_LOCAL_DIR ?? path.join(process.cwd(), "storage"));
  return current;
}
