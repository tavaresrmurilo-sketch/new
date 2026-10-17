import { readLocalObject, storageDriver } from "@/server/storage";

export const dynamic = "force-dynamic";

/** Serve imagens do armazenamento local (STORAGE_DRIVER=local). Com S3, as URLs apontam para o bucket. */
export async function GET(_req: Request, ctx: RouteContext<"/media/[...key]">) {
  if (storageDriver() !== "local") return new Response("Not found", { status: 404 });
  const { key } = await ctx.params;
  const data = await readLocalObject(key.join("/"));
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": "image/webp",
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
